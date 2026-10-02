'use strict';
const AdminLog = require('../models/AdminLog');

/**
 * یک ردیف لاگ فعالیت ادمین ثبت می‌کند. مثل recordLedger، عمداً خطاهایش را
 * می‌بلعد — ثبت لاگ هیچ‌وقت نباید باعث شکست عملیات اصلی ادمین شود.
 */
async function recordAdminLog({ actor, action, targetType = '', targetId = '', details = '' }) {
  try {
    await AdminLog.create({ actor: actor || 'ادمین', action, targetType, targetId: String(targetId || ''), details });
  } catch (error) {
    console.error('Failed to record admin log:', error.message || error);
  }
}

module.exports = { recordAdminLog };
