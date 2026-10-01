'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const REFERRAL_MIN_TASKS = Math.max(3, Number(process.env.REFERRAL_MIN_TASKS || 3));
const REFERRAL_MIN_ACTIVE_DAYS = Math.max(2, Number(process.env.REFERRAL_MIN_ACTIVE_DAYS || 2));
const REFERRAL_WAIT_DAYS = Math.max(7, Number(process.env.REFERRAL_WAIT_DAYS || 7));
const REFERRAL_WAIT_MS = REFERRAL_WAIT_DAYS * DAY_MS;

function utcDayKey(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function evaluateReferralEligibility(user, completions = [], now = new Date()) {
  const approvedCompletions = (Array.isArray(completions) ? completions : [])
    .filter(item => item?.status === undefined || item.status === 'approved');
  const activeDays = new Set(approvedCompletions.map(item => utcDayKey(item.createdAt)).filter(Boolean));
  const createdAt = user?.createdAt ? new Date(user.createdAt) : null;
  const ageMs = createdAt && !Number.isNaN(createdAt.getTime()) ? Math.max(0, now.getTime() - createdAt.getTime()) : 0;
  const waitSatisfied = ageMs >= REFERRAL_WAIT_MS;
  const riskBlocked = Boolean(user?.referralRiskBlocked) || Number(user?.referralRiskScore || 0) >= 50;
  const reasons = [];

  if (approvedCompletions.length < REFERRAL_MIN_TASKS) reasons.push('MIN_APPROVED_TASKS');
  if (activeDays.size < REFERRAL_MIN_ACTIVE_DAYS) reasons.push('MIN_ACTIVE_DAYS');
  if (!waitSatisfied) reasons.push('WAITING_PERIOD');
  if (riskBlocked) reasons.push('RISK_BLOCKED');

  const eligible = reasons.length === 0;
  return {
    eligible,
    status: riskBlocked ? 'blocked' : eligible ? 'eligible' : 'pending',
    reasons,
    approvedTaskCount: approvedCompletions.length,
    activeDayCount: activeDays.size,
    activeDays: [...activeDays].sort(),
    ageDays: Math.floor(ageMs / DAY_MS),
    waitDaysRemaining: Math.max(0, Math.ceil((REFERRAL_WAIT_MS - ageMs) / DAY_MS)),
    eligibleAt: eligible ? now : null
  };
}

function referralWithdrawalRestriction(user) {
  if (!user?.referredBy) return null;
  if (user.referralRiskBlocked || Number(user.referralRiskScore || 0) >= 50) {
    return 'این حساب تا پایان بررسی ضدتقلب اجازه تبدیل یا برداشت ندارد.';
  }
  if (user.referralEligibilityStatus !== 'eligible' || !user.referralEligibleAt) {
    return 'برای تبدیل یا برداشت، ابتدا باید شرایط فعال‌شدن Referral تکمیل شود: ۳ تسک تأییدشده در حداقل ۲ روز متفاوت و گذشت ۷ روز از ثبت‌نام.';
  }
  return null;
}

module.exports = {
  DAY_MS,
  REFERRAL_MIN_TASKS,
  REFERRAL_MIN_ACTIVE_DAYS,
  REFERRAL_WAIT_DAYS,
  utcDayKey,
  evaluateReferralEligibility,
  referralWithdrawalRestriction
};
