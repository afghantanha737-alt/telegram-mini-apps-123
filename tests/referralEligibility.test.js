'use strict';
const assert = require('assert');
const {
  evaluateReferralEligibility,
  REFERRAL_MIN_TASKS,
  REFERRAL_MIN_ACTIVE_DAYS,
  REFERRAL_WAIT_DAYS,
  referralWithdrawalRestriction
} = require('../utils/referralEligibility');

const now = new Date('2026-10-01T12:00:00.000Z');
const user = {
  referredBy: 'referrer-id',
  createdAt: new Date('2026-09-24T12:00:00.000Z'),
  referralRiskScore: 0,
  referralRiskBlocked: false
};
const completion = (date, status = 'approved') => ({ createdAt: new Date(date), status });

let result = evaluateReferralEligibility(user, [
  completion('2026-09-30T10:00:00Z'),
  completion('2026-09-30T11:00:00Z'),
  completion('2026-09-30T12:00:00Z')
], now);
assert.strictEqual(result.eligible, false);
assert.ok(result.reasons.includes('MIN_ACTIVE_DAYS'));

result = evaluateReferralEligibility(user, [
  completion('2026-09-29T10:00:00Z'),
  completion('2026-09-30T11:00:00Z')
], now);
assert.strictEqual(result.eligible, false);
assert.ok(result.reasons.includes('MIN_APPROVED_TASKS'));

result = evaluateReferralEligibility(user, [
  completion('2026-09-29T10:00:00Z'),
  completion('2026-09-30T11:00:00Z'),
  completion('2026-10-01T11:00:00Z')
], now);
assert.strictEqual(result.eligible, true);
assert.strictEqual(result.activeDayCount, 3);
assert.strictEqual(result.status, 'eligible');

result = evaluateReferralEligibility({ ...user, createdAt: new Date('2026-09-28T12:00:00Z') }, [
  completion('2026-09-29T10:00:00Z'),
  completion('2026-09-30T11:00:00Z'),
  completion('2026-10-01T11:00:00Z')
], now);
assert.strictEqual(result.eligible, false);
assert.ok(result.reasons.includes('WAITING_PERIOD'));

result = evaluateReferralEligibility({ ...user, referralRiskScore: 70 }, [
  completion('2026-09-29T10:00:00Z'),
  completion('2026-09-30T11:00:00Z'),
  completion('2026-10-01T11:00:00Z')
], now);
assert.strictEqual(result.status, 'blocked');
assert.ok(result.reasons.includes('RISK_BLOCKED'));

assert.strictEqual(REFERRAL_MIN_TASKS, 3);
assert.strictEqual(REFERRAL_MIN_ACTIVE_DAYS, 2);
assert.strictEqual(REFERRAL_WAIT_DAYS, 7);
assert.ok(referralWithdrawalRestriction(user));
assert.strictEqual(referralWithdrawalRestriction({ ...user, referralEligibilityStatus: 'eligible', referralEligibleAt: now }), null);

console.log('ALL PASS — secure referral eligibility');
