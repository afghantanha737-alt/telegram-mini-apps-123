const express = require('express');
const router = express.Router();

const User = require('../models/User');
const verifyTelegramInitData = require('../utils/verifyTelegram');
const { processReferral } = require('../utils/referralCheck');

// ============================================================
// Helpers
// ============================================================

function getInitData(req) {
  return req.body?.initData || req.query?.initData || '';
}

function getStartParam(req, telegramData = null) {
  const requestValue =
    req.body?.startParam ||
    req.body?.startapp ||
    req.query?.startParam ||
    req.query?.startapp ||
    '';

  if (typeof requestValue === 'string' && requestValue.trim()) {
    return requestValue.trim().slice(0, 200);
  }

  // fallback: Telegram start_param داخل initData
  if (telegramData instanceof URLSearchParams) {
    const value = telegramData.get('start_param');

    if (value) {
      return value.trim().slice(0, 200);
    }
  }

  return '';
}

function sanitizeName(value, maxLength = 100) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

function parseTelegramUser(initData) {
  const result = verifyTelegramInitData(initData);

  if (!result || result.valid !== true || !result.data) {
    return null;
  }

  const userRaw = result.data.get('user');

  if (!userRaw) {
    return null;
  }

  try {
    const telegramUser = JSON.parse(userRaw);

    if (!telegramUser || !telegramUser.id) {
      return null;
    }

    return {
      user: telegramUser,
      data: result.data
    };
  } catch (error) {
    console.error('Telegram user JSON parse error:', error);
    return null;
  }
}

function publicUser(user) {
  return {
    id: user._id,

    telegramId: user.telegramId,

    firstName: user.firstName || '',

    lastName: user.lastName || '',

    username: user.username || '',

    points: Math.max(
      0,
      Number(user.points) || 0
    ),

    referralCode: user.referralCode || '',

    referredBy: user.referredBy || null,

    invitedCount: Math.max(
      0,
      Number(user.invitedCount) || 0
    ),

    streak: Math.max(
      0,
      Number(user.streak) || 0
    ),

    spinChances: Math.max(
      0,
      Number(user.spinChances) || 0
    ),

    totalCheckins: Math.max(
      0,
      Number(user.totalCheckins) || 0
    ),

    captchaPassed: Boolean(
      user.captchaPassed
    ),

    termsAccepted: Boolean(
      user.termsAccepted
    )
  };
}

// ============================================================
// POST /api/auth
// ============================================================

router.post('/', async (req, res) => {
  try {
    const initData = getInitData(req);

    if (!initData) {
      return res.status(401).json({
        success: false,
        message: 'اطلاعات Telegram ارسال نشده است.'
      });
    }

    const parsed = parseTelegramUser(initData);

    if (!parsed) {
      return res.status(401).json({
        success: false,
        message: 'اطلاعات Telegram نامعتبر یا منقضی شده است.'
      });
    }

    const { user: telegramUser, data: telegramData } = parsed;

    const telegramId = String(telegramUser.id);

    let user = await User.findOne({ telegramId });

    let isNewUser = false;

    // ========================================================
    // CREATE NEW USER
    // ========================================================

    if (!user) {
      const newUser = new User({
        telegramId,

        username: sanitizeName(
          telegramUser.username
        ),

        firstName: sanitizeName(
          telegramUser.first_name
        ),

        lastName: sanitizeName(
          telegramUser.last_name
        ),

        points: 0,

        streak: 0,

        totalCheckins: 0,

        spinChances: 0,

        captchaPassed: false,

        termsAccepted: false,

        lastSeenAt: new Date()
      });

      try {
        user = await newUser.save();
        isNewUser = true;
      } catch (saveError) {
        /*
         * دو درخواست همزمان ممکن است یک User را بسازند.
         * unique index روی telegramId از duplicate جلوگیری می‌کند.
         */
        if (saveError?.code === 11000) {
          user = await User.findOne({ telegramId });

          if (!user) {
            throw saveError;
          }

          isNewUser = false;
        } else {
          throw saveError;
        }
      }

      // ======================================================
      // REFERRAL
      // ======================================================

      /*
       * Referral فقط برای کاربری که واقعاً همین درخواست
       * آن را ایجاد کرده پردازش می‌شود.
       */
      if (isNewUser) {
        const referralCode = getStartParam(
          req,
          telegramData
        );

        if (referralCode) {
          const cleanCode = referralCode
            .replace(/[^A-Za-z0-9_-]/g, '')
            .slice(0, 100);

          if (cleanCode) {
            await processReferral(
              user,
              cleanCode
            );

            /*
             * processReferral ممکن است user را تغییر داده باشد.
             * نسخه جدید را از DB می‌گیریم.
             */
            user = await User.findById(user._id);
          }
        }
      }
    }

    // ========================================================
    // EXISTING USER
    // ========================================================

    else {
      user.username = sanitizeName(
        telegramUser.username
      );

      user.firstName = sanitizeName(
        telegramUser.first_name
      );

      user.lastName = sanitizeName(
        telegramUser.last_name
      );

      user.lastSeenAt = new Date();

      await user.save();
    }

    // ========================================================
    // BAN CHECK
    // ========================================================

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        banned: true,
        message:
          user.banReason ||
          'حساب شما مسدود شده است.'
      });
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.json({
      success: true,

      isNewUser,

      user: publicUser(user)
    });

  } catch (error) {
    console.error(
      'POST /api/auth:',
      error
    );

    return res.status(
      error.status || 500
    ).json({
      success: false,
      message:
        error.message ||
        'خطا در ورود به حساب.'
    });
  }
});

// ============================================================
// POST /api/auth/accept-terms
// ============================================================

router.post('/accept-terms', async (req, res) => {
  try {
    const initData = getInitData(req);

    if (!initData) {
      return res.status(401).json({
        success: false,
        message: 'اطلاعات Telegram ارسال نشده است.'
      });
    }

    const parsed = parseTelegramUser(initData);

    if (!parsed) {
      return res.status(401).json({
        success: false,
        message: 'اطلاعات Telegram نامعتبر است.'
      });
    }

    const telegramId = String(
      parsed.user.id
    );

    const user = await User.findOneAndUpdate(
      {
        telegramId,
        isBanned: { $ne: true }
      },
      {
        $set: {
          termsAccepted: true,
          lastSeenAt: new Date()
        }
      },
      {
        new: true
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'کاربر پیدا نشد.'
      });
    }

    return res.json({
      success: true,
      termsAccepted: true
    });

  } catch (error) {
    console.error(
      'POST /auth/accept-terms:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'خطا در ثبت قوانین.'
    });
  }
});

// ============================================================
// POST /api/auth/captcha
// ============================================================

router.post('/captcha', async (req, res) => {
  try {
    const initData = getInitData(req);

    if (!initData) {
      return res.status(401).json({
        success: false,
        message: 'اطلاعات Telegram ارسال نشده است.'
      });
    }

    const parsed = parseTelegramUser(initData);

    if (!parsed) {
      return res.status(401).json({
        success: false,
        message: 'اطلاعات Telegram نامعتبر است.'
      });
    }

    /*
     * توجه:
     *
     * این هنوز CAPTCHA واقعی نیست.
     * verified=true از frontend قابل جعل است.
     *
     * در مرحله بعد CAPTCHA واقعی server-side را اضافه می‌کنیم.
     */
    if (req.body?.verified !== true) {
      return res.status(400).json({
        success: false,
        message: 'تأیید CAPTCHA نامعتبر است.'
      });
    }

    const user = await User.findOneAndUpdate(
      {
        telegramId: String(parsed.user.id),
        isBanned: { $ne: true }
      },
      {
        $set: {
          captchaPassed: true,
          lastSeenAt: new Date()
        }
      },
      {
        new: true
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'کاربر پیدا نشد.'
      });
    }

    return res.json({
      success: true,
      captchaPassed: true
    });

  } catch (error) {
    console.error(
      'POST /auth/captcha:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'خطا در تأیید CAPTCHA.'
    });
  }
});

// ============================================================
// GET /api/auth/me
// ============================================================

router.get('/me', async (req, res) => {
  try {
    const initData = getInitData(req);

    if (!initData) {
      return res.status(401).json({
        success: false,
        message: 'اطلاعات Telegram ارسال نشده است.'
      });
    }

    const parsed = parseTelegramUser(initData);

    if (!parsed) {
      return res.status(401).json({
        success: false,
        message: 'اطلاعات Telegram نامعتبر است.'
      });
    }

    const user = await User.findOne({
      telegramId: String(parsed.user.id)
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'کاربر پیدا نشد.'
      });
    }

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        banned: true,
        message:
          user.banReason ||
          'حساب شما مسدود شده است.'
      });
    }

    user.lastSeenAt = new Date();
    await user.save();

    return res.json({
      success: true,
      user: publicUser(user)
    });

  } catch (error) {
    console.error(
      'GET /auth/me:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت اطلاعات کاربر.'
    });
  }
});

// ============================================================
// Error Handler
// ============================================================

router.use((error, req, res, next) => {
  console.error(
    'Auth router error:',
    error
  );

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).json({
    success: false,
    message: 'خطای داخلی سرور.'
  });
});

module.exports = router;