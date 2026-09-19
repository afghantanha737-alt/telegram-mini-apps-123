'use strict';

const crypto = require('crypto');
const User = require('../models/User');

/**
 * initData ارسالی از Telegram WebApp را طبق مستندات رسمی تلگرام
 * با استفاده از HMAC-SHA256 اعتبارسنجی می‌کند.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 */
function verifyInitData(initData, botToken) {
  const normalizedToken = String(botToken || '')
    .trim()
    .replace(/^['"]|['"]$/g, '');

  if (!initData || typeof initData !== 'string' || !normalizedToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) {
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(normalizedToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const computedBuffer = Buffer.from(computedHash, 'hex');
  const receivedBuffer = Buffer.from(hash, 'hex');
  if (
    computedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(computedBuffer, receivedBuffer)
  ) return null;

  const authDate = Number(params.get('auth_date') || 0);
  const maxAgeSeconds = Number(process.env.INIT_DATA_MAX_AGE || 86400);
  if (!authDate || !Number.isFinite(authDate)) return null;
  if (maxAgeSeconds > 0) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (authDate > nowSeconds + 60 || nowSeconds - authDate > maxAgeSeconds) return null;
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    user = null;
  }

  return {
    user,
    startParam: params.get('start_param') || null,
    authDate
  };
}

function generateReferralCode(telegramId) {
  return `R${telegramId}${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
}

function hashClientIp(ip) {
  const salt = String(process.env.REFERRAL_IP_SALT || process.env.BOT_TOKEN || 'referral-ip-salt');
  return crypto.createHash('sha256').update(`${salt}:${String(ip || 'unknown')}`).digest('hex');
}

async function getOrCreateUser(tgUser, startParam, requestContext = {}) {
  if (!tgUser || !tgUser.id) return null;
  const telegramId = String(tgUser.id);
  const referralIpHash = hashClientIp(requestContext.ip);

  let dbUser = await User.findOne({ telegramId });

  if (!dbUser) {
    let referredBy = null;

    let referrer = null;
    if (startParam) {
      const code = String(startParam).replace(/^ref_/, '').trim();
      if (code) {
        referrer = await User.findOne({ referralCode: code });
        if (referrer && String(referrer.telegramId) !== telegramId) {
          referredBy = referrer._id;
        }
      }
    }

    const referralRiskFlags = [];
    if (referrer?.referralIpHash && referrer.referralIpHash === referralIpHash) {
      referralRiskFlags.push('same_signup_ip');
    }

    dbUser = await User.create({
      telegramId,
      username: tgUser.username || '',
      firstName: tgUser.first_name || '',
      lastName: tgUser.last_name || '',
      photoUrl: tgUser.photo_url || '',
      referralCode: generateReferralCode(telegramId),
      referredBy,
      referralIpHash,
      referralRiskFlags
    });

    // نکته مهم: اینجا هیچ پوینتی به دعوت‌کننده داده نمی‌شود.
    // فقط شمارنده‌ی «تعداد دعوت‌شده‌ها» را برای نمایش در تیم به‌روزرسانی می‌کنیم.
    // پرداخت ۵۰ پوینت واقعی فقط بعد از اینکه همین کاربر جدید حداقل تعداد
    // تسک لازم را با موفقیت تکمیل کند اتفاق می‌افتد (routes/tasks.js).
    if (referredBy) {
      await User.findByIdAndUpdate(referredBy, { $inc: { invitedCount: 1 } });
    }
  } else {
    let changed = false;
    if (tgUser.username && tgUser.username !== dbUser.username) {
      dbUser.username = tgUser.username;
      changed = true;
    }
    if (tgUser.first_name && tgUser.first_name !== dbUser.firstName) {
      dbUser.firstName = tgUser.first_name;
      changed = true;
    }
    if (tgUser.last_name && tgUser.last_name !== dbUser.lastName) {
      dbUser.lastName = tgUser.last_name;
      changed = true;
    }
    if (tgUser.photo_url && tgUser.photo_url !== dbUser.photoUrl) {
      dbUser.photoUrl = tgUser.photo_url;
      changed = true;
    }
    if (!dbUser.referralIpHash) {
      dbUser.referralIpHash = referralIpHash;
      changed = true;
    }
    if (changed) await dbUser.save();
  }

  return dbUser;
}

function requireTelegramAuth(botToken) {
  return async function telegramAuthMiddleware(req, res, next) {
    try {
      const initData = req.query.initData || (req.body && req.body.initData) || '';

      if (!initData) {
        return res.status(401).json({
          success: false,
          code: 'TELEGRAM_INIT_DATA_MISSING',
          message: 'اطلاعات ورود تلگرام دریافت نشد. برنامه را از داخل تلگرام باز کنید.'
        });
      }

      const verified = verifyInitData(initData, botToken);

      if (!verified || !verified.user) {
        return res.status(401).json({
          success: false,
          code: 'TELEGRAM_INIT_DATA_INVALID',
          message: 'اطلاعات ورود تلگرام نامعتبر است. توکن BOT_TOKEN باید متعلق به همین ربات باشد.'
        });
      }

      const dbUser = await getOrCreateUser(verified.user, verified.startParam, { ip: req.ip });
      if (!dbUser) {
        return res.status(401).json({ success: false, message: 'کاربر شناسایی نشد.' });
      }
      if (dbUser.isBanned) {
        return res.status(403).json({ success: false, message: 'حساب شما محدود شده است.' });
      }

      req.tgUser = verified.user;
      req.dbUser = dbUser;
      req.referralIpHash = hashClientIp(req.ip);
      next();
    } catch (error) {
      console.error('Telegram auth error:', error);
      res.status(500).json({ success: false, message: 'خطا در احراز هویت.' });
    }
  };
}

module.exports = {
  verifyInitData,
  getOrCreateUser,
  requireTelegramAuth,
  generateReferralCode
};
