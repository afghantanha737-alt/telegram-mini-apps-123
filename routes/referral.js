const express = require('express');
const router = express.Router();

const User = require('../models/User');
const verifyTelegramInitData = require('../utils/verifyTelegram');


// ============================================================
// Helpers
// ============================================================

function getInitData(req) {
  return req.body?.initData || req.query?.initData || '';
}


async function authenticateUser(req) {
  const initData = getInitData(req);

  if (!initData) {
    const error = new Error(
      'اطلاعات Telegram ارسال نشده است.'
    );

    error.status = 401;
    throw error;
  }

  const telegramUser =
    verifyTelegramInitData(initData);

  if (!telegramUser || !telegramUser.id) {
    const error = new Error(
      'اطلاعات Telegram نامعتبر است.'
    );

    error.status = 401;
    throw error;
  }

  const user =
    await User.findOne({
      telegramId: String(telegramUser.id)
    });

  if (!user) {
    const error = new Error(
      'کاربر پیدا نشد.'
    );

    error.status = 404;
    throw error;
  }

  return {
    user,
    telegramUser
  };
}


// ============================================================
// GET /api/referral/me
// ============================================================

router.get('/me', async (req, res) => {
  try {
    const { user } =
      await authenticateUser(req);

    const referralCode =
      String(user.referralCode || '').trim();

    const invitedCount =
      Number(user.invitedCount) ||
      Number(user.referralsCount) ||
      0;

    res.json({
      success: true,

      referralCode,

      invitedCount:
        Math.max(0, invitedCount),

      points:
        Math.max(
          0,
          Number(user.points) || 0
        )
    });

  } catch (error) {
    console.error(
      'GET /api/referral/me:',
      error
    );

    res.status(
      error.status || 500
    ).json({
      success: false,
      message:
        error.message ||
        'خطا در دریافت اطلاعات دعوت دوستان.'
    });
  }
});


// ============================================================
// GET /api/referral/stats
// ============================================================

router.get('/stats', async (req, res) => {
  try {
    const { user } =
      await authenticateUser(req);

    const invitedCount =
      Number(user.invitedCount) ||
      Number(user.referralsCount) ||
      0;

    /*
     * این endpoint فعلاً آمار واقعی موجود در User
     * را برمی‌گرداند و چیزی را از خودش جعل نمی‌کند.
     */

    res.json({
      success: true,

      referralCode:
        String(
          user.referralCode || ''
        ).trim(),

      invitedCount:
        Math.max(
          0,
          invitedCount
        ),

      points:
        Math.max(
          0,
          Number(user.points) || 0
        )
    });

  } catch (error) {
    console.error(
      'GET /api/referral/stats:',
      error
    );

    res.status(
      error.status || 500
    ).json({
      success: false,
      message:
        error.message ||
        'خطا در دریافت آمار دعوت.'
    });
  }
});


// ============================================================
// GET /api/referral/link
// ============================================================

router.get('/link', async (req, res) => {
  try {
    const { user } =
      await authenticateUser(req);

    const referralCode =
      String(
        user.referralCode || ''
      ).trim();

    if (!referralCode) {
      return res.status(400).json({
        success: false,
        message:
          'کد دعوت کاربر موجود نیست.'
      });
    }

    /*
     * نام فعلی Bot پروژه.
     *
     * اگر در آینده نام Bot تغییر کرد،
     * فقط همین مقدار را تغییر می‌دهیم.
     */

    const botUsername =
      String(
        process.env.BOT_USERNAME ||
        'AmirAFG123_bot'
      )
        .replace(/^@/, '')
        .trim();

    const referralLink =
      `https://t.me/${botUsername}/app?startapp=${encodeURIComponent(
        referralCode
      )}`;

    res.json({
      success: true,
      referralCode,
      referralLink
    });

  } catch (error) {
    console.error(
      'GET /api/referral/link:',
      error
    );

    res.status(
      error.status || 500
    ).json({
      success: false,
      message:
        error.message ||
        'خطا در ساخت لینک دعوت.'
    });
  }
});


// ============================================================
// Error Handler
// ============================================================

router.use(
  (error, req, res, next) => {
    console.error(
      'Referral router error:',
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    res.status(500).json({
      success: false,
      message:
        'خطای داخلی سرور.'
    });
  }
);


module.exports = router;