'use strict';
const assert = require('assert');
const User = require('../models/User');
const Settings = require('../models/Settings');
const TaskCompletion = require('../models/TaskCompletion');
const PointsLedger = require('../models/PointsLedger');
const ReferralRelationship = require('../models/ReferralRelationship');
const ledger = require('../utils/ledger');

function query(value) {
  return {
    select() { return this; },
    session() { return this; },
    async lean() { return typeof value === 'function' ? value() : value; },
    then(resolve, reject) { return Promise.resolve(typeof value === 'function' ? value() : value).then(resolve, reject); }
  };
}

(async () => {
  const originals = {
    userFindById: User.findById,
    userFindByIdAndUpdate: User.findByIdAndUpdate,
    settingsFindOne: Settings.findOne,
    completionFind: TaskCompletion.find,
    ledgerFindOne: PointsLedger.findOne,
    relationshipUpsert: ReferralRelationship.findOneAndUpdate,
    recordLedgerRequired: ledger.recordLedgerRequired
  };
  const parent = { _id: 'parent-id', telegramId: '200', points: 0, referredBy: null, isBanned: false, accountReviewStatus: 'active' };
  const invitee = { _id: 'child-id', telegramId: '100', points: 0, referredBy: parent._id, isBanned: false, accountReviewStatus: 'active', referralRiskScore: 0, createdAt: new Date(Date.now() - 8 * 86400000) };
  let completions = [
    { status: 'approved', createdAt: new Date(Date.now() - 3 * 86400000) },
    { status: 'approved', createdAt: new Date(Date.now() - 2 * 86400000) },
    { status: 'approved', createdAt: new Date(Date.now() - 86400000) }
  ];
  const users = new Map([[parent._id, parent], [invitee._id, invitee]]);
  const entries = new Map();
  const incrementsByTransaction = new Map();
  let concurrentReadCount = 0;
  let releaseConcurrentReads;
  let concurrentReads = null;
  let failLedgerOnce = false;

  User.findById = id => query(users.get(String(id)) || null);
  User.findByIdAndUpdate = async (id, update, options = {}) => {
    const user = users.get(String(id));
    if (!user) return null;
    const increment = Number(update.$inc?.points || 0);
    user.points += increment;
    if (options.session) incrementsByTransaction.set(options.session.id, (incrementsByTransaction.get(options.session.id) || 0) + increment);
    return { ...user };
  };
  Settings.findOne = () => query({ referralLevelRates: [10, 5, 3] });
  TaskCompletion.find = () => query(completions);
  PointsLedger.findOne = filter => ({
    select() { return this; },
    session() { return this; },
    async lean() {
      if (concurrentReads) {
        concurrentReadCount += 1;
        if (concurrentReadCount === 2) releaseConcurrentReads();
        await concurrentReads;
      }
      return entries.has(filter.sourceId) ? { _id: filter.sourceId } : null;
    },
    then(resolve, reject) { return this.lean().then(resolve, reject); }
  });
  ReferralRelationship.findOneAndUpdate = async () => ({ ok: true });
  ledger.recordLedgerRequired = async payload => {
    if (failLedgerOnce) { failLedgerOnce = false; throw new Error('transient ledger write failure'); }
    if (entries.has(payload.sourceId)) return { created: false, entry: entries.get(payload.sourceId) };
    entries.set(payload.sourceId, { ...payload });
    return { created: true, entry: entries.get(payload.sourceId) };
  };

  const { distributeReferralCommissions } = require('../utils/referralSystem');
  let transactionSequence = 0;
  async function withMockTransaction(work) {
    const session = { id: `tx-${++transactionSequence}` };
    try { return await work(session); }
    catch (error) {
      parent.points -= incrementsByTransaction.get(session.id) || 0;
      incrementsByTransaction.delete(session.id);
      throw error;
    }
  }
  const earning = { user: invitee._id, amount: 100, currency: 'points', type: 'task', sourceId: 'task-source-123', transactionId: 'earn-tx-123' };
  try {
    completions = completions.slice(0, 2);
    assert.deepStrictEqual(await withMockTransaction(session => distributeReferralCommissions(earning, session)), [], 'ineligible referred user earns no commission');
    assert.strictEqual(parent.points, 0);
    completions = [
      { status: 'approved', createdAt: new Date(Date.now() - 3 * 86400000) },
      { status: 'approved', createdAt: new Date(Date.now() - 2 * 86400000) },
      { status: 'approved', createdAt: new Date(Date.now() - 86400000) }
    ];

    failLedgerOnce = true;
    await assert.rejects(withMockTransaction(session => distributeReferralCommissions(earning, session)), /transient ledger write failure/);
    assert.strictEqual(parent.points, 0, 'failed ledger write rolls back the ancestor balance in the transaction double');
    const first = await withMockTransaction(session => distributeReferralCommissions(earning, session));
    assert.strictEqual(first.length, 1);
    const onceBalance = parent.points;
    const duplicate = await withMockTransaction(session => distributeReferralCommissions(earning, session));
    assert.deepStrictEqual(duplicate, []);
    assert.strictEqual(parent.points, onceBalance, 'duplicate earning cannot pay twice');

    // Exercise simultaneous reads of the unique source IDs. The unique ledger write
    // lets one transaction win; the other must abort so only one set of credits remains.
    entries.clear(); parent.points = 0;
    concurrentReadCount = 0;
    concurrentReads = new Promise(resolve => { releaseConcurrentReads = resolve; });
    const raced = await Promise.allSettled([
      withMockTransaction(session => distributeReferralCommissions(earning, session)),
      withMockTransaction(session => distributeReferralCommissions(earning, session))
    ]);
    concurrentReads = null;
    assert.strictEqual(raced.filter(result => result.status === 'fulfilled').length, 1);
    assert.strictEqual(raced.filter(result => result.status === 'rejected').length, 1);
    const expected = [...entries.values()].reduce((sum, entry) => sum + entry.amount, 0);
    assert.strictEqual(parent.points, expected, 'losing duplicate commission transaction rolls back its credits');
    assert.strictEqual(entries.size, 1, 'only one commission ledger leg survives for the one-level chain');
    console.log('ALL PASS — referral commission eligibility, failed retry, duplicate, and concurrent unique-ledger guard (transaction test double)');
  } finally {
    User.findById = originals.userFindById;
    User.findByIdAndUpdate = originals.userFindByIdAndUpdate;
    Settings.findOne = originals.settingsFindOne;
    TaskCompletion.find = originals.completionFind;
    PointsLedger.findOne = originals.ledgerFindOne;
    ReferralRelationship.findOneAndUpdate = originals.relationshipUpsert;
    ledger.recordLedgerRequired = originals.recordLedgerRequired;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
