'use strict';
const PointsLedger = require('../models/PointsLedger');

/**
 * یک ردیف تاریخچه‌ی تراکنش ثبت می‌کند. عمداً خطاهایش را می‌بلعد —
 * ثبت تاریخچه هیچ‌وقت نباید باعث شکست خوردن عملیات اصلی (مثلاً اعطای
 * پاداش تسک) شود؛ در بدترین حالت فقط یک ردیف تاریخچه گم می‌شود.
 */
async function recordLedger({ user, type, amount, currency = 'points', description = '', balanceAfter = null }) {
  try {
    await PointsLedger.create({ user, type, amount, currency, description, balanceAfter });
  } catch (error) {
    console.error('Failed to record ledger entry:', error.message || error);
  }
}

module.exports = { recordLedger };
