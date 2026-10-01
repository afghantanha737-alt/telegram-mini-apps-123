'use strict';
const assert = require('assert');
const { classifyReferralUser } = require('../utils/referralAudit');

const now = new Date('2026-10-01T12:00:00Z');
const user = {
  _id: 'user-1',
  telegramId: '1001',
  firstName: 'Test',
  referredBy: 'ref-1',
  createdAt: new Date('2026-09-20T12:00:00Z'),
  referralRiskScore: 0,
  referralRiskBlocked: false
};

let result = classifyReferralUser({
  user,
  completion: { count: 3, days: ['2026-09-29', '2026-09-30'] },
  reward: { amount: 0, count: 0 },
  withdrawal: { count: 0, paid: 0, pending: 0, totalGram: 0 },
  sharedIpCount: 1,
  burstCount: 1,
  now
});
assert.strictEqual(result.status, 'low');
assert.strictEqual(result.score, 0);

result = classifyReferralUser({
  user: { ...user, referralRiskScore: 70, referralRiskBlocked: true, createdAt: new Date('2026-09-30T12:00:00Z') },
  completion: { count: 0, days: [] },
  reward: { amount: 100, count: 1 },
  withdrawal: { count: 1, paid: 1, pending: 0, totalGram: 0.2 },
  sharedIpCount: 4,
  burstCount: 7,
  now
});
assert.strictEqual(result.status, 'high');
assert.ok(result.flags.includes('RISK_BLOCKED'));
assert.ok(result.flags.includes('SHARED_NETWORK_HASH'));
assert.ok(result.flags.includes('WITHDRAWAL_BEFORE_ELIGIBILITY'));
assert.ok(result.referralReward.amount === 100);

console.log('ALL PASS — referral audit classification');
