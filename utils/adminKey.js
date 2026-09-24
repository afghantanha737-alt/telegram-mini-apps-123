'use strict';
const crypto = require('crypto');

/**
 * مقایسه‌ی کلید ادمین به‌صورت timing-safe (با هش SHA-256 تا طول دو رشته یکسان شود).
 */
function isValidAdminKey(candidate) {
  const expected = process.env.ADMIN_KEY;
  if (!expected || typeof candidate !== 'string' || !candidate) return false;
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { isValidAdminKey };
