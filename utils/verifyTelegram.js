const crypto = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN;


// ============================================================
// Telegram Mini App initData verification
// ============================================================

function verifyTelegramInitData(initData) {
  try {
    if (
      !initData ||
      typeof initData !== 'string'
    ) {
      return null;
    }

    if (!BOT_TOKEN) {
      console.error(
        'BOT_TOKEN تنظیم نشده است.'
      );

      return null;
    }


    // --------------------------------------------------------
    // Parse Telegram initData
    // --------------------------------------------------------

    const params =
      new URLSearchParams(initData);

    const receivedHash =
      params.get('hash');

    if (!receivedHash) {
      return null;
    }

    /*
     * hash نباید وارد data-check-string شود.
     */

    params.delete('hash');


    // --------------------------------------------------------
    // Create data-check-string
    // --------------------------------------------------------

    const dataCheckString =
      Array.from(params.entries())
        .sort(([a], [b]) =>
          a.localeCompare(b)
        )
        .map(
          ([key, value]) =>
            `${key}=${value}`
        )
        .join('\n');


    // --------------------------------------------------------
    // Telegram secret key
    // --------------------------------------------------------

    /*
     * برای Mini App:
     *
     * secret_key =
     * HMAC_SHA256("WebAppData", BOT_TOKEN)
     */

    const secretKey =
      crypto
        .createHmac(
          'sha256',
          'WebAppData'
        )
        .update(BOT_TOKEN)
        .digest();


    // --------------------------------------------------------
    // Calculate expected hash
    // --------------------------------------------------------

    const calculatedHash =
      crypto
        .createHmac(
          'sha256',
          secretKey
        )
        .update(dataCheckString)
        .digest('hex');


    // --------------------------------------------------------
    // Timing-safe comparison
    // --------------------------------------------------------

    const receivedBuffer =
      Buffer.from(
        receivedHash,
        'hex'
      );

    const calculatedBuffer =
      Buffer.from(
        calculatedHash,
        'hex'
      );

    /*
     * اگر طول hashها برابر نباشد،
     * timingSafeEqual خطا می‌دهد.
     */

    if (
      receivedBuffer.length !==
      calculatedBuffer.length
    ) {
      return null;
    }

    const isValid =
      crypto.timingSafeEqual(
        receivedBuffer,
        calculatedBuffer
      );

    if (!isValid) {
      return null;
    }


    // --------------------------------------------------------
    // Validate auth_date
    // --------------------------------------------------------

    const authDate =
      Number(
        params.get('auth_date')
      );

    if (
      !Number.isFinite(authDate) ||
      authDate <= 0
    ) {
      return null;
    }

    /*
     * initData قدیمی نباید برای همیشه قابل استفاده باشد.
     *
     * 24 ساعت را به عنوان حداکثر عمر قابل قبول
     * در نظر می‌گیریم.
     */

    const now =
      Math.floor(
        Date.now() / 1000
      );

    const MAX_AGE =
      24 * 60 * 60;

    if (
      authDate > now + 60
    ) {
      /*
       * auth_date نمی‌تواند بیش از یک دقیقه
       * در آینده باشد.
       */
      return null;
    }

    if (
      now - authDate >
      MAX_AGE
    ) {
      return null;
    }


    // --------------------------------------------------------
    // Parse user
    // --------------------------------------------------------

    const rawUser =
      params.get('user');

    if (!rawUser) {
      return null;
    }

    let telegramUser;

    try {
      telegramUser =
        JSON.parse(rawUser);
    } catch (error) {
      return null;
    }

    if (
      !telegramUser ||
      !telegramUser.id
    ) {
      return null;
    }


    // --------------------------------------------------------
    // Normalize Telegram user
    // --------------------------------------------------------

    return {
      id: String(
        telegramUser.id
      ),

      first_name:
        telegramUser.first_name ||
        '',

      last_name:
        telegramUser.last_name ||
        '',

      username:
        telegramUser.username ||
        '',

      language_code:
        telegramUser.language_code ||
        '',

      is_premium:
        Boolean(
          telegramUser.is_premium
        )
    };

  } catch (error) {
    console.error(
      'Telegram initData verification error:',
      error.message
    );

    return null;
  }
}


module.exports =
  verifyTelegramInitData;