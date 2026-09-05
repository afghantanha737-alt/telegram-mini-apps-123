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


function getStartParam(req) {
  const value =
    req.body?.startParam ||
    req.body?.startapp ||
    req.query?.startParam ||
    req.query?.startapp ||
    '';

  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value
    .trim()
    .slice(0, 200);
}


function sanitizeName(value, maxLength = 100) {
  if (
    typeof value !== 'string'
  ) {
    return '';
  }

  return value
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}


// ============================================================
// POST /api/auth
// ============================================================

router.post('/', async (req, res) => {
  try {
    const initData =
      getInitData(req);

    if (!initData) {
      return res.status(401).json({
        success: false,
        message:
          'اطلاعات Telegram ارسال نشده است.'
      });
    }


    // --------------------------------------------------------
    // Verify Telegram
    // --------------------------------------------------------

    const telegramUser =
      verifyTelegramInitData(
        initData
      );

    if (
      !telegramUser ||
      !telegramUser.id
    ) {
      return res.status(401).json({
        success: false,
        message:
          'اطلاعات Telegram نامعتبر یا منقضی شده است.'
      });
    }


    const telegramId =
      String(
        telegramUser.id
      );


    // --------------------------------------------------------
    // Find existing user
    // --------------------------------------------------------

    let user =
      await User.findOne({
        telegramId
      });


    const isNewUser =
      !user;


    // --------------------------------------------------------
    // Create user
    // --------------------------------------------------------

    if (!user) {
      user =
        new User({
          telegramId,

          username:
            sanitizeName(
              telegramUser.username,
              100
            ),

          firstName:
            sanitizeName(
              telegramUser.first_name,
              100
            ),

          lastName:
            sanitizeName(
              telegramUser.last_name,
              100
            ),

          points: 0,

          streak: 0,

          totalCheckins: 0,

          spinChances: 0,

          captchaPassed: false,

          termsAccepted: false,

          lastSeenAt: new Date()
        });


      // ------------------------------------------------------
      // Referral
      // ------------------------------------------------------

      /*
       * اگر کاربر جدید با لینک referral وارد شده باشد،
       * startapp معمولاً کد دعوت را حمل می‌کند.
       */

      const referralCode =
        getStartParam(req);

      if (referralCode) {
        const cleanCode =
          referralCode
            .replace(
              /[^A-Za-z0-9_-]/g,
              ''
            )
            .slice(0, 100);

        if (cleanCode) {
          const inviter =
            await User.findOne({
              referralCode:
                cleanCode
            });

          /*
           * کاربر نمی‌تواند خودش را دعوت کند.
           */

          if (
            inviter &&
            String(inviter._id) !==
              String(user._id)
          ) {
            user.referredBy =
              inviter._id;

            /*
             * افزایش invitedCount را بعد از
             * ذخیره موفق User انجام می‌دهیم.
             */
          }
        }
      }


      try {
        await user.save();

      } catch (saveError) {

        /*
         * اگر دو درخواست همزمان برای یک Telegram ID
         * رسیدند، unique index از duplicate جلوگیری می‌کند.
         *
         * در این حالت User موجود را دوباره می‌گیریم.
         */

        if (
          saveError?.code === 11000
        ) {
          user =
            await User.findOne({
              telegramId
            });

          if (!user) {
            throw saveError;
          }
        } else {
          throw saveError;
        }
      }


      // ------------------------------------------------------
      // Referral counter
      // ------------------------------------------------------

      /*
       * فقط در صورتی که کاربر واقعاً جدید باشد،
       * دعوت‌کننده یک نفر به آمارش اضافه می‌کند.
       */

      if (
        isNewUser &&
        user.referredBy
      ) {
        await User.updateOne(
          {
            _id: user.referredBy
          },
          {
            $inc: {
              invitedCount: 1
            }
          }
        );
      }

    } else {

      // ------------------------------------------------------
      // Existing user
      // ------------------------------------------------------

      /*
       * اطلاعات پروفایل Telegram ممکن است تغییر کرده باشد،
       * پس username/name را به‌روز می‌کنیم.
       */

      user.username =
        sanitizeName(
          telegramUser.username,
          100
        );

      user.firstName =
        sanitizeName(
          telegramUser.first_name,
          100
        );

      user.lastName =
        sanitizeName(
          telegramUser.last_name,
          100
        );

      user.lastSeenAt =
        new Date();

      await user.save();
    }


    // --------------------------------------------------------
    // Banned user
    // --------------------------------------------------------

    if (user.isBanned) {
      return res.status(403).json({
        success: false,
        banned: true,
        message:
          user.banReason ||
          'حساب شما مسدود شده است.'
      });
    }


    // --------------------------------------------------------
    // Response
    // --------------------------------------------------------

    res.json({
      success: true,

      isNewUser,

      user: {
        id:
          user._id,

        telegramId:
          user.telegramId,

        firstName:
          user.firstName || '',

        lastName:
          user.lastName || '',

        username:
          user.username || '',

        points:
          Math.max(
            0,
            Number(user.points) || 0
          ),

        referralCode:
          user.referralCode || '',

        invitedCount:
          Math.max(
            0,
            Number(user.invitedCount) || 0
          ),

        streak:
          Math.max(
            0,
            Number(user.streak) || 0
          ),

        spinChances:
          Math.max(
            0,
            Number(user.spinChances) || 0
          ),

        totalCheckins:
          Math.max(
            0,
            Number(user.totalCheckins) || 0
          ),

        captchaPassed:
          Boolean(
            user.captchaPassed
          ),

        termsAccepted:
          Boolean(
            user.termsAccepted
          )
      }
    });

  } catch (error) {
    console.error(
      'POST /api/auth:',
      error
    );

    res.status(
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

router.post(
  '/accept-terms',
  async (req, res) => {
    try {
      const initData =
        getInitData(req);

      if (!initData) {
        return res.status(401).json({
          success: false,
          message:
            'اطلاعات Telegram ارسال نشده است.'
        });
      }

      const telegramUser =
        verifyTelegramInitData(
          initData
        );

      if (
        !telegramUser ||
        !telegramUser.id
      ) {
        return res.status(401).json({
          success: false,
          message:
            'اطلاعات Telegram نامعتبر است.'
        });
      }

      const user =
        await User.findOneAndUpdate(
          {
            telegramId:
              String(telegramUser.id),

            isBanned: {
              $ne: true
            }
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
          message:
            'کاربر پیدا نشد.'
        });
      }

      res.json({
        success: true,
        termsAccepted: true
      });

    } catch (error) {
      console.error(
        'POST /auth/accept-terms:',
        error
      );

      res.status(
        error.status || 500
      ).json({
        success: false,
        message:
          error.message ||
          'خطا در ثبت قوانین.'
      });
    }
  }
);


// ============================================================
// POST /api/auth/captcha
// ============================================================

router.post(
  '/captcha',
  async (req, res) => {
    try {
      const initData =
        getInitData(req);

      if (!initData) {
        return res.status(401).json({
          success: false,
          message:
            'اطلاعات Telegram ارسال نشده است.'
        });
      }

      const telegramUser =
        verifyTelegramInitData(
          initData
        );

      if (
        !telegramUser ||
        !telegramUser.id
      ) {
        return res.status(401).json({
          success: false,
          message:
            'اطلاعات Telegram نامعتبر است.'
        });
      }


      /*
       * CAPTCHA واقعی باید در سمت سرور
       * تولید و بررسی شود.
       *
       * فعلاً frontend مقدار verified=true
       * را ارسال می‌کند و ما فقط اجازه نمی‌دهیم
       * کاربر بدون ارسال مقدار معتبر، این endpoint
       * را فعال کند.
       */

      const verified =
        req.body?.verified === true;

      if (!verified) {
        return res.status(400).json({
          success: false,
          message:
            'تأیید CAPTCHA نامعتبر است.'
        });
      }


      const user =
        await User.findOneAndUpdate(
          {
            telegramId:
              String(telegramUser.id),

            isBanned: {
              $ne: true
            }
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
          message:
            'کاربر پیدا نشد.'
        });
      }


      res.json({
        success: true,
        captchaPassed: true
      });

    } catch (error) {
      console.error(
        'POST /auth/captcha:',
        error
      );

      res.status(
        error.status || 500
      ).json({
        success: false,
        message:
          error.message ||
          'خطا در تأیید CAPTCHA.'
      });
    }
  }
);


// ============================================================
// GET /api/auth/me
// ============================================================

router.get(
  '/me',
  async (req, res) => {
    try {
      const initData =
        getInitData(req);

      if (!initData) {
        return res.status(401).json({
          success: false,
          message:
            'اطلاعات Telegram ارسال نشده است.'
        });
      }

      const telegramUser =
        verifyTelegramInitData(
          initData
        );

      if (
        !telegramUser ||
        !telegramUser.id
      ) {
        return res.status(401).json({
          success: false,
          message:
            'اطلاعات Telegram نامعتبر است.'
        });
      }

      const user =
        await User.findOne({
          telegramId:
            String(telegramUser.id)
        }).lean();

      if (!user) {
        return res.status(404).json({
          success: false,
          message:
            'کاربر پیدا نشد.'
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

      res.json({
        success: true,

        user: {
          id:
            user._id,

          telegramId:
            user.telegramId,

          firstName:
            user.firstName || '',

          lastName:
            user.lastName || '',

          username:
            user.username || '',

          points:
            Math.max(
              0,
              Number(user.points) || 0
            ),

          referralCode:
            user.referralCode || '',

          invitedCount:
            Math.max(
              0,
              Number(user.invitedCount) || 0
            ),

          streak:
            Math.max(
              0,
              Number(user.streak) || 0
            ),

          spinChances:
            Math.max(
              0,
              Number(user.spinChances) || 0
            ),

          totalCheckins:
            Math.max(
              0,
              Number(user.totalCheckins) || 0
            ),

          captchaPassed:
            Boolean(
              user.captchaPassed
            ),

          termsAccepted:
            Boolean(
              user.termsAccepted
            )
        }
      });

    } catch (error) {
      console.error(
        'GET /auth/me:',
        error
      );

      res.status(
        error.status || 500
      ).json({
        success: false,
        message:
          error.message ||
          'خطا در دریافت اطلاعات کاربر.'
      });
    }
  }
);


// ============================================================
// Error Handler
// ============================================================

router.use(
  (error, req, res, next) => {
    console.error(
      'Auth router error:',
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