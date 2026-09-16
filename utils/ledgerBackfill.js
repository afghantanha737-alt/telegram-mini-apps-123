'use strict';

const User = require('../models/User');
const PointsLedger = require('../models/PointsLedger');

/**
 * Existing balances cannot be reconstructed into old individual events.
 * Record one immutable opening snapshot so every later change is auditable.
 */
async function backfillOpeningBalances() {
  const [users, ledgerUserIds] = await Promise.all([
    User.find({}, '_id telegramId points').lean(),
    PointsLedger.distinct('user')
  ]);
  const knownUsers = new Set(ledgerUserIds.map(id => String(id)));
  const operations = users
    .filter(user => !knownUsers.has(String(user._id)))
    .map(user => ({
      insertOne: {
        document: {
          user: user._id,
          telegramId: user.telegramId,
          delta: Number(user.points) || 0,
          balanceAfter: Number(user.points) || 0,
          type: 'opening_balance',
          referenceType: 'migration',
          referenceId: String(user._id),
          idempotencyKey: `opening:${user._id}`,
          status: 'completed',
          metadata: { source: 'ledger-backfill' }
        }
      }
  }));

  if (!operations.length) return 0;
  try {
    const result = await PointsLedger.bulkWrite(operations, { ordered: false });
    return result.insertedCount || operations.length;
  } catch (error) {
    const duplicateOnly = error.code === 11000 || error.writeErrors?.every(item => item.code === 11000);
    if (duplicateOnly) return 0;
    throw error;
  }
}

module.exports = backfillOpeningBalances;
