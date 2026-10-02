'use strict';
const PointsLedger = require('../models/PointsLedger');

/**
 * یک ردیف تاریخچه‌ی تراکنش ثبت می‌کند. برای عملیات قدیمی، رفتار سازگار
 * حفظ شده است؛ عملیات مالی جدید باید throwOnError=true و در صورت نیاز
 * session را ارسال کند تا موجودی و Ledger از هم جدا نشوند.
 */
async function recordLedger({ user, type, amount, currency = 'points', description = '', balanceAfter = null, sourceId = null, transactionId = null, referralLevel = null, sourceUserId = null, recipientUserId = null, commissionRatePercent = null, earningTransactionId = '', session = null, throwOnError = false }) {
  try {
    const payload = { user, type, amount, currency, description, balanceAfter };
    if (sourceId) payload.sourceId = String(sourceId);
    if (transactionId) payload.transactionId = String(transactionId);
    if (referralLevel != null) payload.referralLevel = referralLevel;
    if (sourceUserId) payload.sourceUserId = sourceUserId;
    if (recipientUserId) payload.recipientUserId = recipientUserId;
    if (commissionRatePercent != null) payload.commissionRatePercent = commissionRatePercent;
    if (earningTransactionId) payload.earningTransactionId = String(earningTransactionId);
    const entry = session
      ? await new PointsLedger(payload).save({ session })
      : await PointsLedger.create(payload);
    return { ok: true, created: true, entry };
  } catch (error) {
    if (error?.code === 11000 && sourceId) {
      const query = PointsLedger.findOne({ sourceId });
      if (session) query.session(session);
      const entry = await query;
      return { ok: true, created: false, duplicate: true, entry };
    }
    console.error('Failed to record ledger entry:', error.message || error);
    if (throwOnError) throw error;
    return { ok: false, created: false, error };
  }
}

async function recordLedgerRequired(options) {
  const { isEligibleOriginalEarn } = require('./referralCore');
  const eligible = isEligibleOriginalEarn(options);
  if (eligible && !options.session) throw new Error('Qualifying point earnings must use a MongoDB transaction so referral commissions remain atomic.');
  const result = await recordLedger({ ...options, throwOnError: true });
  if (result.created && eligible) {
    const { distributeReferralCommissions } = require('./referralSystem');
    await distributeReferralCommissions(result.entry, options.session);
  }
  return result;
}

module.exports = { recordLedger, recordLedgerRequired };
