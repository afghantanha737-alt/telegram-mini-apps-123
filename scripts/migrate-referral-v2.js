'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Settings = require('../models/Settings');
const ReferralRelationship = require('../models/ReferralRelationship');
const { normalizeReferralRates, DEFAULT_REFERRAL_LEVEL_RATES, reviewStatusOf } = require('../utils/referralCore');

const apply = process.argv.includes('--apply');
const batchSize = 500;

function statusForPath(path) {
  const values = path.map(reviewStatusOf);
  if (values.includes('blocked')) return 'blocked';
  for (const status of ['fraud_review', 'restricted', 'under_review']) {
    if (values.includes(status)) return status;
  }
  return 'active';
}

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  const settings = await Settings.findOne({ key: 'global' }).lean();
  let rates;
  try { rates = normalizeReferralRates(settings?.referralLevelRates); }
  catch { rates = [...DEFAULT_REFERRAL_LEVEL_RATES]; }

  let plannedRows = 0;
  let usersWithReferrer = 0;
  let possibleCycles = 0;
  let missingParents = 0;
  let batch = [];
  const cursor = User.find({ referredBy: { $ne: null } })
    .select('_id referredBy isBanned accountReviewStatus referralRiskBlocked referralRiskScore referralBonusAwarded createdAt')
    .lean()
    .cursor({ batchSize: 500 });

  async function flush() {
    if (!apply || batch.length === 0) { batch = []; return; }
    await ReferralRelationship.bulkWrite(batch, { ordered: false });
    batch = [];
  }

  for await (const invitee of cursor) {
    usersWithReferrer += 1;
    const path = [invitee];
    const seen = new Set([String(invitee._id)]);
    let parentId = invitee.referredBy;
    for (let level = 1; level <= rates.length && parentId; level += 1) {
      if (seen.has(String(parentId))) { possibleCycles += 1; break; }
      const parent = await User.findById(parentId)
        .select('_id referredBy isBanned accountReviewStatus referralRiskBlocked referralRiskScore')
        .lean();
      if (!parent) { missingParents += 1; break; }
      if (seen.has(String(parent._id))) { possibleCycles += 1; break; }
      seen.add(String(parent._id));
      path.push(parent);
      const status = statusForPath(path);
      const direct = level === 1;
      batch.push({
        updateOne: {
          filter: { referrerId: parent._id, referredUserId: invitee._id },
          update: {
            $set: { level, status, statusReason: status === 'active' ? '' : status },
            // برای رابطه‌ی قدیمی که هنوز سندی ندارد، پاداش جدید گذشته‌نگر نده؛
            // روی رکورد موجود، paid/pending state را دست‌کاری نکن.
            $setOnInsert: {
              referrerId: parent._id,
              referredUserId: invitee._id,
              source: 'migration',
              initialRewardStatus: direct ? 'legacy_exempt' : 'not_applicable'
            }
          },
          upsert: true
        }
      });
      plannedRows += 1;
      if (batch.length >= batchSize) await flush();
      parentId = parent.referredBy;
    }
  }
  await flush();

  const existing = await ReferralRelationship.countDocuments({});
  console.log(JSON.stringify({
    mode: apply ? 'APPLY' : 'DRY_RUN',
    usersWithDirectReferrer: usersWithReferrer,
    relationshipRowsPlanned: plannedRows,
    existingRelationshipRows: existing,
    possibleCycles,
    missingParents,
    configuredLevels: rates.length,
    retroactiveInitialRewards: 0,
    retroactiveCommissions: 0,
    historicalLedgerAndBalancesChanged: false
  }, null, 2));
  if (apply) console.log('Migration completed with idempotent relationship upserts. No wallet balances or historical Ledger entries were changed.');
}

run().catch(error => {
  console.error('Referral v2 migration failed:', error.message || error);
  process.exitCode = 1;
}).finally(async () => {
  await mongoose.disconnect().catch(() => {});
});
