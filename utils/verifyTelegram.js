const crypto = require('crypto');

/**
 * Verify Telegram Mini App initData
 *
 * Telegram Mini Apps امضای initData را با HMAC-SHA256
 * تولید می‌کنند.
 *
 * این تابع:
 * 1. initData را parse می‌کند
 * 2. hash را استخراج می‌کند
 * 3. data-check-string را طبق استاندارد Telegram می‌سازد
 * 4. secret key را از BOT_TOKEN تولید می‌کند
 * 5. hash را با timingSafeEqual مقایسه می‌کند
 * 6. auth_date را برای جلوگیری از استفاده از داده‌های بسیار قدیمی بررسی می‌کند
 *
 * خروجی:
 * {
 *   valid: true,
 *   data: URLSearchParams
 * }
 *
 * یا:
 * {
 *   valid: false,
 *   error: '...'
 * }
 */

const MAX_AUTH_AGE_SECONDS = Number(
  process.env.TELEGRAM_AUTH_MAX_AGE || 24 * 60 * 60
);

function verifyTelegramInitData(initData) {
  try {
    const botToken = process.env.BOT_TOKEN;

    if (!botToken) {
      console.error('BOT_TOKEN is not configured.');

      return {
        valid: false,
        error: 'BOT_TOKEN is not configured'
      };
    }

    if (!initData || typeof initData !== 'string') {
      return {
        valid: false,
        error: 'Missing initData'
      };
    }

    const params = new URLSearchParams(initData);

    const receivedHash = params.get('hash');

    if (!receivedHash) {
      return {
        valid: false,
        error: 'Missing Telegram hash'
      };
    }

    /*
     * hash نباید وارد data-check-string شود.
     */
    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    /*
     * Telegram Mini App secret key:
     *
     * HMAC-SHA256(botToken, "WebAppData")
     */
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    /*
     * جلوگیری از timing attack
     */
    const receivedBuffer = Buffer.from(receivedHash, 'hex');
    const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

    if (
      receivedBuffer.length !== calculatedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)
    ) {
      return {
        valid: false,
        error: 'Invalid Telegram signature'
      };
    }

    /*
     * بررسی auth_date
     *
     * این بررسی باعث می‌شود initData بسیار قدیمی قابل استفاده
     * نباشد.
     */
    const authDateRaw = params.get('auth_date');
    const authDate = Number(authDateRaw);

    if (!Number.isFinite(authDate) || authDate <= 0) {
      return {
        valid: false,
        error: 'Invalid auth_date'
      };
    }

    const now = Math.floor(Date.now() / 1000);

    /*
     * کمی clock skew را تحمل می‌کنیم.
     */
    const clockSkew = 60;

    if (authDate > now + clockSkew) {
      return {
        valid: false,
        error: 'Telegram auth_date is from the future'
      };
    }

    if (now - authDate > MAX_AUTH_AGE_SECONDS) {
      return {
        valid: false,
        error: 'Telegram initData has expired'
      };
    }

    return {
      valid: true,
      data: params
    };
  } catch (error) {
    console.error('Telegram initData verification error:', error);

    return {
      valid: false,
      error: 'Invalid Telegram initData'
    };
  }
}

/**
 * نسخه ساده برای routeهایی که فقط true/false نیاز دارند.
 */
function isValidTelegramInitData(initData) {
  return verifyTelegramInitData(initData).valid;
}

module.exports = verifyTelegramInitData;
module.exports.verifyTelegramInitData = verifyTelegramInitData;
module.exports.isValidTelegramInitData = isValidTelegramInitData;