'use strict';
const assert = require('assert');
const { buildReferralViewData, calculateReferralEarningsTotal } = require('../utils/referralView');

const view = buildReferralViewData({
  rootUserId: 'root',
  rates: [10, 5, 3, 1],
  descendants: [
    { _id: 'root', depth: 3 },
    { _id: 'friend-1', depth: 0, firstName: 'Ava', username: 'ava', createdAt: '2026-01-01T00:00:00Z' },
    { _id: 'friend-2', depth: 1, firstName: 'Mina', createdAt: '2026-02-01T00:00:00Z' },
    { _id: 'friend-3', depth: 3, username: 'third', createdAt: '2026-03-01T00:00:00Z' }
  ],
  earningsByLevel: [
    { _id: 1, earnedPoints: 20 },
    { _id: 2, earnedPoints: 7 },
    { _id: 4, earnedPoints: 5 },
    { _id: 5, earnedPoints: 6 },
    { _id: null, earnedPoints: 3 }
  ],
  earningsByFriend: [
    { _id: 'friend-1', earnedPoints: 20 },
    { _id: 'friend-2', earnedPoints: 7 },
    { _id: 'friend-3', earnedPoints: 5 }
  ]
});

assert.strictEqual(view.totalReferrals, 3, 'exclude the root even if a cycle appears');
assert.deepStrictEqual(view.levelCounts, { '1': 1, '2': 1, '3': 0, '4': 1, '5': 0 });
assert.deepStrictEqual(view.earningsByLevel.map(row => row.earnedPoints), [20, 7, 0, 5, 6, 3]);
assert.deepStrictEqual(view.earningsByLevel.map(row => row.level), [1, 2, 3, 4, 5, null]);
assert.strictEqual(view.totalReferralCommissionPoints, 41, 'commission total must match every displayed level row');
assert.strictEqual(calculateReferralEarningsTotal({ initialInviteRewardPoints: 10, milestoneRewardPoints: 25, teamCommissionPoints: view.totalReferralCommissionPoints }), 76, 'page total includes all credited referral reward types');
assert.strictEqual(view.earningsByLevel[0].commissionRatePercent, 10);
assert.strictEqual(view.earningsByLevel[4].commissionRatePercent, null, 'historical level with no current rate is not assigned a fake rate');
assert.strictEqual(view.team.find(person => person.username === 'ava').earnedPoints, 20);
assert.strictEqual(view.team.find(person => person.username === 'third').level, 4);

const empty = buildReferralViewData({ rates: [10, 5, 3, 1] });
assert.strictEqual(empty.totalReferrals, 0);
assert.strictEqual(empty.totalReferralCommissionPoints, 0);
assert.deepStrictEqual(empty.earningsByLevel.map(row => row.friends), [0, 0, 0, 0]);
assert.deepStrictEqual(empty.earningsByLevel.map(row => row.earnedPoints), [0, 0, 0, 0]);

console.log('ALL PASS — referral view aggregates');
