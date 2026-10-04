'use strict';
const AdminLog = require('../models/AdminLog');

function sanitizeAdminLogDetails(value) {
  return String(value || '')
    .replace(/\b(BOT_TOKEN|ADMIN_KEY|TELEGRAM_WEBHOOK_SECRET|REFERRAL_LINK_SECRET|MONGO_URI|DATABASE_URL)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\b\d{6,10}:[A-Za-z0-9_-]{20,}\b/g, '[REDACTED_BOT_TOKEN]')
    .slice(0, 4000);
}

function buildAdminLog({ actor, action, targetType = '', targetId = '', details = '' }) {
  return {
    actor: String(actor || 'ادمین').slice(0, 120),
    action: String(action || '').slice(0, 120),
    targetType: String(targetType || '').slice(0, 120),
    targetId: String(targetId || '').slice(0, 200),
    details: sanitizeAdminLogDetails(details)
  };
}

/** Best-effort activity note for low-impact operations. */
async function recordAdminLog(data) {
  try {
    await AdminLog.create(buildAdminLog(data));
  } catch (error) {
    console.error('Failed to record admin log:', error.message || error);
  }
}

/** Required audit event for high-impact mutations; can join the mutation transaction. */
async function recordAdminLogRequired(data, session) {
  const document = buildAdminLog(data);
  const options = session ? { session } : undefined;
  if (options) return (await AdminLog.create([document], options))[0];
  return AdminLog.create(document);
}

module.exports = { recordAdminLog, recordAdminLogRequired, sanitizeAdminLogDetails };
