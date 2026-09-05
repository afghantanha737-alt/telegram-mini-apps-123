'use strict';

const crypto = require('crypto');
const User = require('../models/User');

function verifyInitData(initData, botToken) {
  if (!initData || typeof initData !== 'string' || !botToken) return null;

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

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const authDate = Number(params.get('auth_date') || 0);
  const maxAgeSeconds = Number(process.env.INIT_DATA_MAX_AGE || 86400);
  if (maxAgeSeconds > 0 && authDate > 0) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds - authDate > maxAgeSeconds) return null;
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
  return `R${telegramId}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

async function getOrCreateUser(tgUser, startParam) {
  if (!tgUser || !tgUser.id) return null;
  const telegramId = String(tgUser.id);

  let dbUser = await User.findOne({ telegramId });

  if (!dbUser) {
    let referredBy = null;

    if (startParam) {
      const code = String(startParam).replace(/^ref_/, '').trim();
      if (code) {
        const referrer = await User.findOne({ referralCode: code });
        if (referrer && String(referrer.telegramId) !== telegramId) {
          referredBy = referrer._id;
        }
      }
    }

    dbUser = await User.create({
      telegramId,
      username: tgUser.username || '',
      firstName: tgUser.first_name || '',
      lastName: tgUser.last_name || '',
      photoUrl: tgUser.photo_url || '',
      referralCode: generateReferralCode(telegramId),
      referredBy
    });

    if (referredBy) {
      const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS_POINTS || 50);
      await User.findByIdAndUpdate(referredBy, {
        $inc: { points: REFERRAL_BONUS, invitedCount: 1 }
      });
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
    if (changed) await dbUser.save();
  }

  return dbUser;
}

function requireTelegramAuth(botToken) {
  return async function telegramAuthMiddleware(req, res, next) {
    try {
      const initData = req.query.initData || (req.body && req.body.initData) || '';
      const verified = verifyInitData(initData, botToken);

      if (!verified || !verified.user) {
        return res.status(401).json({ success: false, message: 'احراز هویت تلگرام نامعتبر است.' });
      }

      const dbUser = await getOrCreateUser(verified.user, verified.startParam);
      if (!dbUser) {
        return res.status(401).json({ success: false, message: 'کاربر شناسایی نشد.' });
      }
      if (dbUser.isBanned) {
        return res.status(403).json({ success: false, message: 'حساب شما محدود شده است.' });
      }

      req.tgUser = verified.user;
      req.dbUser = dbUser;
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