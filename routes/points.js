const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const verifyTelegramInitData = require('../utils/verifyTelegram');

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const POINT_TO_CRYPTO_RATE =
  Number(process.env.POINT_TO_CRYPTO_RATE) > 0
    ? Number(process.env.POINT_TO_CRYPTO_RATE)
    : 1000;

const DAILY_REWARD = 2;
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
const STREAK_WINDOW = 48 * 60 * 60 * 1000;

const SPIN_SEGMENTS = [2, 3, 5, 7, 10, 15, 25];


// ----------------------------------------------------
// Helpers
// ----------------------------------------------------

function getInitData(req) {
  return req.body?.initData || req.query?.initData || '';
}

async function authenticateUser(req) {
  const initData = getInitData(req);

  if (!initData) {
    const error = new Error('اطلاعات تلگرام ارسال نشده است');
    error.status = 401;
    throw error;
  }

  const telegramUser = verifyTelegramInitData(initData);

  if (!telegramUser || !telegramUser.id) {
    const error = new Error('اطلاعات تلگرام نامعتبر است');
    error.status = 401;
    throw error;
  }

  const user = await User.findOne({
    telegramId: String(telegramUser.id)
  });

  if (!user) {
    const error = new Error('کاربر پیدا نشد');
    error.status = 404;
    throw error;
  }

  return {
    user,
    telegramUser
  };
}

function normalizeAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return null;
  }

  if (!Number.isInteger(amount)) {
    return null;
  }

  if (amount <= 0) {
    return null;
  }

  return amount;
}

function normalizeWallet(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

async function tgCall(method, payload = {}) {
  if (!BOT_TOKEN) {
    throw new Error('BOT_TOKEN تنظیم نشده است');
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      data?.description || `Telegram API error: ${response.status}`
    );
  }

  return data;
}

async function notifyAdmin(text, withdrawalId) {
  if (!ADMIN_CHAT_ID) {
    console.warn('ADMIN_CHAT_ID تنظیم نشده است');
    return null;
  }

  const result = await tgCall('sendMessage', {
    chat_id: ADMIN_CHAT_ID,
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '✅ تایید برداشت',
            callback_data: `withdraw:approve:${withdrawalId}`
          },
          {
            text: '❌ رد برداشت',
            callback_data: `withdraw:reject:${withdrawalId}`
          }
        ]
      ]
    }
  });

  return result?.result || null;
}


// ----------------------------------------------------
// GET /api/points/me
// ----------------------------------------------------

router.get('/me', async (req, res) => {
  try {
    const { user, telegramUser } = await authenticateUser(req);

    const points = Math.max(0, Number(user.points) || 0);

    const estimatedCryptoValue =
      points / POINT_TO_CRYPTO_RATE;

    const now = Date.now();

    let canCheckIn = true;

    if (user.lastCheckIn) {
      const lastCheckInTime =
        new Date(user.lastCheckIn).getTime();

      if (
        Number.isFinite(lastCheckInTime) &&
        now - lastCheckInTime < DAILY_COOLDOWN
      ) {
        canCheckIn = false;
      }
    }

    res.json({
      success: true,
      points,
      estimatedCryptoValue,
      rate: POINT_TO_CRYPTO_RATE,
      streak: Number(user.streak) || 0,
      canCheckIn,
      spinChances: Number(user.spinChances) || 0,
      totalCheckins: Number(user.totalCheckins) || 0,
      firstName:
        user.firstName ||
        telegramUser.first_name ||
        'کاربر'
    });

  } catch (error) {
    console.error('GET /points/me:', error);

    res.status(error.status || 500).json({
      success: false,
      message:
        error.message || 'خطا در دریافت اطلاعات امتیاز'
    });
  }
});


// ----------------------------------------------------
// POST /api/points/daily-checkin
// ----------------------------------------------------

router.post('/daily-checkin', async (req, res) => {
  try {
    const { user } = await authenticateUser(req);

    const now = new Date();

    /*
     * Optimistic concurrency:
     * ابتدا آخرین وضعیت را می‌خوانیم، سپس هنگام update
     * همان lastCheckIn قبلی را در شرط قرار می‌دهیم.
     *
     * این کار جلوی دو check-in همزمان را می‌گیرد.
     */

    const oldLastCheckIn = user.lastCheckIn
      ? new Date(user.lastCheckIn)
      : null;

    if (oldLastCheckIn) {
      const elapsed =
        now.getTime() - oldLastCheckIn.getTime();

      if (elapsed < DAILY_COOLDOWN) {
        const remaining =
          DAILY_COOLDOWN - elapsed;

        const remainingHours =
          Math.ceil(remaining / (60 * 60 * 1000));

        return res.status(429).json({
          success: false,
          message:
            `چک‌این بعدی حدود ${remainingHours} ساعت دیگر فعال می‌شود`,
          retryAfterMs: remaining
        });
      }
    }

    const oldStreak =
      Number(user.streak) || 0;

    let newStreak = 1;

    if (oldLastCheckIn) {
      const elapsed =
        now.getTime() - oldLastCheckIn.getTime();

      if (elapsed <= STREAK_WINDOW) {
        newStreak = oldStreak + 1;
      }
    }

    let earnedSpin = false;

    /*
     * بعد از 7 روز متوالی:
     * یک شانس اسپین داده می‌شود
     * و streak از نو شروع می‌شود.
     */

    if (newStreak >= 7) {
      earnedSpin = true;
      newStreak = 0;
    }

    const filter = {
      _id: user._id
    };

    if (oldLastCheckIn) {
      filter.lastCheckIn = oldLastCheckIn;
    } else {
      filter.$or = [
        { lastCheckIn: null },
        { lastCheckIn: { $exists: false } }
      ];
    }

    const increment = {
      points: DAILY_REWARD,
      totalCheckins: 1
    };

    if (earnedSpin) {
      increment.spinChances = 1;
    }

    const updatedUser =
      await User.findOneAndUpdate(
        filter,
        {
          $set: {
            lastCheckIn: now,
            streak: newStreak
          },
          $inc: increment
        },
        {
          new: true
        }
      );

    /*
     * اگر null شد یعنی درخواست دیگری همزمان
     * قبل از ما check-in را انجام داده است.
     */

    if (!updatedUser) {
      return res.status(409).json({
        success: false,
        message:
          'این عملیات قبلاً انجام شده است. صفحه را تازه کنید.'
      });
    }

    res.json({
      success: true,
      message: earnedSpin
        ? '🎉 تبریک! ۷ روز متوالی کامل شد و یک شانس اسپین گرفتی.'
        : '🎁 پاداش روزانه با موفقیت دریافت شد.',
      reward: DAILY_REWARD,
      streak: newStreak,
      earnedSpin,
      spinChances:
        Number(updatedUser.spinChances) || 0,
      points:
        Number(updatedUser.points) || 0
    });

  } catch (error) {
    console.error('POST /points/daily-checkin:', error);

    res.status(error.status || 500).json({
      success: false,
      message:
        error.message || 'خطا در ثبت چک‌این'
    });
  }
});


// ----------------------------------------------------
// POST /api/points/spin
// ----------------------------------------------------

router.post('/spin', async (req, res) => {
  try {
    const { user } = await authenticateUser(req);

    /*
     * انتخاب جایزه روی سرور انجام می‌شود.
     * بنابراین کاربر نمی‌تواند نتیجه اسپین را
     * از طریق JavaScript دستکاری کند.
     */

    const won =
      SPIN_SEGMENTS[
        Math.floor(
          Math.random() * SPIN_SEGMENTS.length
        )
      ];

    /*
     * کم کردن spin و اضافه کردن reward
     * در یک عملیات atomic انجام می‌شود.
     */

    const updatedUser =
      await User.findOneAndUpdate(
        {
          _id: user._id,
          spinChances: {
            $gt: 0
          }
        },
        {
          $inc: {
            spinChances: -1,
            points: won
          }
        },
        {
          new: true
        }
      );

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message:
          'شانس اسپین کافی ندارید.'
      });
    }

    res.json({
      success: true,
      won,
      points:
        Number(updatedUser.points) || 0,
      spinChances:
        Number(updatedUser.spinChances) || 0
    });

  } catch (error) {
    console.error('POST /points/spin:', error);

    res.status(error.status || 500).json({
      success: false,
      message:
        error.message || 'خطا در اجرای اسپین'
    });
  }
});


// ----------------------------------------------------
// POST /api/points/withdraw
// ----------------------------------------------------

router.post('/withdraw', async (req, res) => {
  try {
    const { user, telegramUser } =
      await authenticateUser(req);

    const amount =
      normalizeAmount(req.body?.amount);

    const walletAddress =
      normalizeWallet(req.body?.walletAddress);

    if (!amount) {
      return res.status(400).json({
        success: false,
        message:
          'مقدار برداشت باید یک عدد صحیح بیشتر از صفر باشد.'
      });
    }

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        message:
          'آدرس کیف پول را وارد کنید.'
      });
    }

    /*
     * محدودیت طول برای جلوگیری از ورودی‌های غیرعادی.
     */
    if (walletAddress.length < 10) {
      return res.status(400).json({
        success: false,
        message:
          'آدرس کیف پول کوتاه یا نامعتبر است.'
      });
    }

    if (walletAddress.length > 200) {
      return res.status(400).json({
        success: false,
        message:
          'آدرس کیف پول بیش از حد طولانی است.'
      });
    }

    /*
     * اول موجودی را به صورت atomic کم می‌کنیم.
     * در نتیجه دو درخواست همزمان نمی‌توانند
     * یک موجودی را دوبار خرج کنند.
     */

    const updatedUser =
      await User.findOneAndUpdate(
        {
          _id: user._id,
          points: {
            $gte: amount
          }
        },
        {
          $inc: {
            points: -amount
          }
        },
        {
          new: true
        }
      );

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message:
          'موجودی امتیاز برای این برداشت کافی نیست.'
      });
    }

    let withdrawal;

    try {
      withdrawal =
        await Withdrawal.create({
          userId: updatedUser._id,
          amount,
          walletAddress,
          status: 'pending'
        });

    } catch (createError) {

      /*
       * اگر ساخت withdrawal شکست خورد،
       * امتیازها را برمی‌گردانیم.
       */

      await User.updateOne(
        {
          _id: updatedUser._id
        },
        {
          $inc: {
            points: amount
          }
        }
      );

      throw createError;
    }

    const username =
      telegramUser.username
        ? `@${telegramUser.username}`
        : 'بدون username';

    const adminText = `
<b>🔔 درخواست برداشت جدید</b>

👤 کاربر:
${telegramUser.first_name || 'Unknown'} ${telegramUser.last_name || ''}

🆔 Telegram ID:
<code>${telegramUser.id}</code>

📛 Username:
${username}

💰 مقدار:
<b>${amount.toLocaleString()}</b> points

💳 کیف پول:
<code>${walletAddress}</code>

🧾 Withdrawal ID:
<code>${withdrawal._id}</code>

⏳ وضعیت:
<b>در انتظار بررسی</b>
`.trim();

    /*
     * ارسال به ادمین نباید باعث برگشت پاسخ موفق شود.
     * اگر Telegram موقتاً unavailable باشد،
     * درخواست همچنان pending باقی می‌ماند.
     */

    try {
      const adminMessage =
        await notifyAdmin(
          adminText,
          withdrawal._id.toString()
        );

      if (adminMessage) {
        withdrawal.adminMessageId =
          adminMessage.message_id;

        /*
         * در صورت وجود این فیلد در مدل،
         * اطلاعات چت ادمین نیز ذخیره می‌شود.
         */
        if (
          Object.prototype.hasOwnProperty.call(
            withdrawal.toObject(),
            'adminChatId'
          )
        ) {
          withdrawal.adminChatId =
            String(ADMIN_CHAT_ID);
        }

        await withdrawal.save();
      }

    } catch (telegramError) {
      console.error(
        'Telegram admin notification failed:',
        telegramError.message
      );
    }

    res.json({
      success: true,
      message:
        'درخواست برداشت با موفقیت ثبت شد و برای بررسی ارسال گردید.',
      withdrawalId:
        withdrawal._id.toString(),
      amount,
      walletAddress,
      remainingPoints:
        Number(updatedUser.points) || 0,
      status: withdrawal.status
    });

  } catch (error) {
    console.error('POST /points/withdraw:', error);

    res.status(error.status || 500).json({
      success: false,
      message:
        error.message || 'خطا در ثبت برداشت'
    });
  }
});


// ----------------------------------------------------
// Global error safety
// ----------------------------------------------------

router.use((error, req, res, next) => {
  console.error('Points router error:', error);

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    message:
      'خطای داخلی سرور. لطفاً دوباره تلاش کنید.'
  });
});


module.exports = router;