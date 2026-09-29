'use strict';
const assert = require('assert');
const { REFERRAL_REWARD_TASKS, referralTaskId, buildReferralTaskProgress } = require('../utils/referralRewards');

assert.deepStrictEqual(
  REFERRAL_REWARD_TASKS.map(task => [task.requiredInvites, task.rewardPoints]),
  [[10, 100], [20, 250], [50, 1000]]
);
assert.strictEqual(referralTaskId('referral_10'), 'referral_10');
assert.strictEqual(referralTaskId('invalid'), null);

let tasks = buildReferralTaskProgress(1);
assert.deepStrictEqual(tasks.map(task => task.status), ['locked', 'locked', 'locked']);
assert.strictEqual(tasks[0].remaining, 9);

 tasks = buildReferralTaskProgress(10);
assert.deepStrictEqual(tasks.map(task => task.status), ['claimable', 'locked', 'locked']);
assert.strictEqual(tasks[1].remaining, 10);

 tasks = buildReferralTaskProgress(20, [{ taskId: 'referral_10', claimedAt: new Date() }]);
assert.deepStrictEqual(tasks.map(task => task.status), ['claimed', 'claimable', 'locked']);

 tasks = buildReferralTaskProgress(50, [{ taskId: 'referral_10' }, { taskId: 'referral_20' }, { taskId: 'referral_50' }]);
assert.ok(tasks.every(task => task.status === 'claimed'));

console.log('ALL PASS — referral reward tasks');
