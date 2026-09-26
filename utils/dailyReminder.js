'use strict';

// عمداً lazy require می‌شوند (داخل خود تابع)، نه اینجا در بالای فایل: این‌طور
// tests/dailyReminder.test.js می‌تواند shouldRunNow/utcDayKey را بدون نیاز به
// دیتابیس یا نصب‌بودن mongoose تست کند.

function utcDayKey(date = new Date()) {
  return Math.floor(date.getTime() / 86400000);
}

/** بخش خالص (بدون دیتابیس) تصمیم‌گیری — آیا همین الان باید یادآوری اجرا شود؟ */
function shouldRunNow(settings, now = new Date()) {
  if (!settings.dailyReminderEnabled) return false;
  return now.getUTCHours() === settings.dailyReminderHourUtc;
}

/**
 * یادآوری ورود روزانه: فقط داخل «ساعت تنظیم‌شده‌ی UTC» به کاربرانی که امروز
 * هنوز ورود روزانه نزده‌اند و امروز قبلاً یادآوری نگرفته‌اند فرستاده می‌شود.
 * این تابع هر چند دقیقه (نه هر ساعت دقیق) صدا زده می‌شود؛ چک lastReminderSentAt
 * تضمین می‌کند حتی با چند بار اجرا در همان ساعت، پیام تکراری نرود.
 * پیش از ارسال، علامت «ارسال شد» ذخیره می‌شود (نه بعد از آن)، تا اگر ارسال
 * دسته‌جمعی وسط کار قطع شود، دفعه‌ی بعد همان کاربران دوباره spam نشوند؛
 * قیمت این تصمیم این است که اگر notifyUser واقعاً شکست بخورد (مثلاً کاربر
 * ربات را بلاک کرده)، همان روز دوباره تلاش نمی‌شود — که قابل قبول است.
 */
async function runDailyReminderSweep(now = new Date()) {
  const User = require('../models/User');
  const Settings = require('../models/Settings');
  const { notifyUser } = require('./bot');
  const { botText } = require('./botMessages');

  const settings = await Settings.getGlobal();
  if (!shouldRunNow(settings, now)) {
    return { sent: 0, skipped: settings.dailyReminderEnabled ? 'wrong_hour' : 'disabled' };
  }

  const startOfToday = new Date(utcDayKey(now) * 86400000);

  const candidates = await User.find(
    {
      isBanned: false,
      $and: [
        { $or: [{ lastCheckIn: null }, { lastCheckIn: { $lt: startOfToday } }] },
        { $or: [{ lastReminderSentAt: null }, { lastReminderSentAt: { $lt: startOfToday } }] }
      ]
    },
    '_id telegramId language'
  ).lean();

  if (!candidates.length) return { sent: 0, skipped: 'no_candidates' };

  // اول علامت‌گذاری، بعد ارسال (توضیح بالا) — همه‌ی کاندیدها یک‌جا mark می‌شوند
  await User.updateMany(
    { _id: { $in: candidates.map(c => c._id) } },
    { $set: { lastReminderSentAt: now } }
  );

  const BATCH_SIZE = 20;
  const DELAY_MS = 1100;
  let sent = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(u => notifyUser(u.telegramId, botText('dailyReminder', u.language)))
    );
    sent += results.filter(Boolean).length;
    if (i + BATCH_SIZE < candidates.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  return { sent, total: candidates.length };
}

module.exports = { runDailyReminderSweep, utcDayKey, shouldRunNow };
