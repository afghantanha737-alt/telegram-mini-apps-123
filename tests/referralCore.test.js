'use strict';
const assert = require('assert');
const {
  DEFAULT_REFERRAL_LEVEL_RATES,
  normalizeReferralRates,
  isEligibleOriginalEarn,
  calculateReferralCommission,
  reviewStatusOf
} = require('../utils/referralCore');

assert.deepStrictEqual(normalizeReferralRates(undefined), [10, 5, 3, 2]);
assert.deepStrictEqual(DEFAULT_REFERRAL_LEVEL_RATES, [10, 5, 3, 2]);
assert.deepStrictEqual(normalizeReferralRates([10, 5, 3, 2, 1]), [10, 5, 3, 2, 1]);
assert.throws(() => normalizeReferralRates([80, 30]), /cannot exceed/);
assert.throws(() => normalizeReferralRates([10, -1]), /between/);
assert.strictEqual(isEligibleOriginalEarn({ type: 'task', currency: 'points', amount: 100 }), true);
assert.strictEqual(isEligibleOriginalEarn({ type: 'spin', amount: 25 }), true);
for (const type of ['referral_bonus', 'referral_initial', 'referral_commission', 'exchange_in', 'admin_adjust']) {
  assert.strictEqual(isEligibleOriginalEarn({ type, amount: 100 }), false, `${type} must not produce commissions`);
}
assert.strictEqual(isEligibleOriginalEarn({ type: 'task', currency: 'gram', amount: 100 }), false);
assert.strictEqual(isEligibleOriginalEarn({ type: 'task', amount: -10 }), false);
assert.strictEqual(calculateReferralCommission(100, 10), 10);
assert.strictEqual(calculateReferralCommission(100, 5), 5);
assert.strictEqual(calculateReferralCommission(100, 3), 3);
assert.strictEqual(calculateReferralCommission(100, 2), 2);
assert.strictEqual(calculateReferralCommission(49, 2), 0);
assert.strictEqual(reviewStatusOf({ accountReviewStatus: 'normal' }), 'active');
assert.strictEqual(reviewStatusOf({ accountReviewStatus: 'under_review' }), 'under_review');
assert.strictEqual(reviewStatusOf({ referralRiskScore: 50 }), 'blocked');
assert.strictEqual(reviewStatusOf({ isBanned: true }), 'blocked');
console.log('ALL PASS — referral core policies and commission math');
