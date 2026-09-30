'use strict';
const PointsLedger = require('../models/PointsLedger');

/**
 * یک ردیف تاریخچه‌ی تراکنش ثبت می‌کند. عمداً خطاهایش را می‌بلعد —
 * ثبت تاریخچه هیچ‌وقت نباید باعث شکست خوردن عملیات اصلی (مثلاً اعطای
 * پاداش تسک) شود؛ در بدترین حالت فقط یک ردیف تاریخچه گم می‌شود.
 */
async function recordLedger({ user, type, amount, currency = 'points', description = '', balanceAfter = null, sourceId = null }) {
  try {
    const entry = await PointsLedger.create({ user, type, amount, currency, description, balanceAfter, sourceId });
    return { ok: true, created: true, entry };
  } catch (error) {
    if (error?.code === 11000 && sourceId) {
      const entry = await PointsLedger.findOne({ sourceId });
      return { ok: true, created: false, duplicate: true, entry };
    }
    console.error('Failed to record ledger entry:', error.message || error);
    return { ok: false, created: false, error };
  }
}

module.exports = { recordLedger };
