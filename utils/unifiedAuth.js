'use strict';
const { requireTelegramAuth } = require('./telegramAuth');
const { requireMobileAuth } = require('./mobileAuth');

/**
 * Preserve the existing Telegram initData contract while accepting a validated
 * mobile Bearer session for the same protected business APIs.
 */
function requireUnifiedAuth(botToken) {
  const telegramAuth = requireTelegramAuth(botToken);
  const mobileAuth = requireMobileAuth();
  return async (req, res, next) => {
    const authorization = String(req.get('authorization') || '');
    if (/^Bearer\s+/i.test(authorization)) return mobileAuth(req, res, next);
    return telegramAuth(req, res, next);
  };
}

module.exports = { requireUnifiedAuth };
