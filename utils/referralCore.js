'use strict';

const DEFAULT_REFERRAL_LEVEL_RATES = Object.freeze([10, 5, 3, 2]);
const DEFAULT_REFERRAL_INITIAL_REWARD_POINTS = 10;
const MAX_REFERRAL_LEVELS = 10;
const ELIGIBLE_ORIGINAL_EARN_TYPES = Object.freeze(['task', 'checkin', 'spin', 'leaderboard_reward']);
const eligibleEarnTypes = new Set(ELIGIBLE_ORIGINAL_EARN_TYPES);

function normalizeReferralRates(value) {
  const rates = Array.isArray(value) ? value.map(Number) : [...DEFAULT_REFERRAL_LEVEL_RATES];
  if (rates.length < 1 || rates.length > MAX_REFERRAL_LEVELS || rates.some(rate => !Number.isFinite(rate) || rate < 0 || rate > 100)) {
    throw new TypeError(`Referral rates must contain 1-${MAX_REFERRAL_LEVELS} values between 0 and 100.`);
  }
  if (rates.reduce((sum, rate) => sum + rate, 0) > 100) {
    throw new TypeError('The total referral commission rate cannot exceed 100%.');
  }
  return rates;
}

function isEligibleOriginalEarn({ type, currency = 'points', amount } = {}) {
  return currency === 'points' && eligibleEarnTypes.has(type) && Number.isFinite(Number(amount)) && Number(amount) > 0;
}

function calculateReferralCommission(originalEarnedPoints, ratePercent) {
  const amount = Math.floor(Number(originalEarnedPoints) * Number(ratePercent) / 100);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function reviewStatusOf(user = {}) {
  const status = ['normal', 'under_review', 'restricted', 'fraud_review'].includes(user.accountReviewStatus)
    ? user.accountReviewStatus
    : 'normal';
  if (user.isBanned || user.referralRiskBlocked || Number(user.referralRiskScore || 0) >= 50) return 'blocked';
  return status === 'normal' ? 'active' : status;
}

module.exports = {
  DEFAULT_REFERRAL_LEVEL_RATES,
  DEFAULT_REFERRAL_INITIAL_REWARD_POINTS,
  MAX_REFERRAL_LEVELS,
  ELIGIBLE_ORIGINAL_EARN_TYPES,
  normalizeReferralRates,
  isEligibleOriginalEarn,
  calculateReferralCommission,
  reviewStatusOf
};
