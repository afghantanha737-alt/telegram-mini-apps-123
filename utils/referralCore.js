'use strict';

const crypto = require('crypto');
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

function createSignedReferralIdentifier(telegramId, secret = process.env.REFERRAL_LINK_SECRET || process.env.BOT_TOKEN || '') {
  const id = String(telegramId || '').trim();
  if (!/^\d{1,20}$/.test(id) || !secret) return '';
  const signature = crypto.createHmac('sha256', String(secret)).update(`gramup:referral:v1:${id}`).digest('hex').slice(0, 24);
  return `${id}_${signature}`;
}

function referralIdentifierQuery(value, secret = process.env.REFERRAL_LINK_SECRET || process.env.BOT_TOKEN || '') {
  let identifier = String(value || '').trim();
  if (identifier.startsWith('ref_')) identifier = identifier.slice(4);
  const signedTelegramId = /^(\d{1,20})_([a-f\d]{24})$/i.exec(identifier);
  if (signedTelegramId && secret) {
    const expected = createSignedReferralIdentifier(signedTelegramId[1], secret).split('_')[1];
    const receivedBuffer = Buffer.from(signedTelegramId[2].toLowerCase(), 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
      return { telegramId: signedTelegramId[1] };
    }
    return null;
  }
  if (/^\d{1,20}$/.test(identifier)) return null;
  if (/^[a-z\d]{1,64}$/i.test(identifier)) return { referralCode: identifier.toUpperCase() };
  return null;
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
  createSignedReferralIdentifier,
  referralIdentifierQuery,
  isEligibleOriginalEarn,
  calculateReferralCommission,
  reviewStatusOf
};
