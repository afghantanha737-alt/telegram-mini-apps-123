'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { isValidAdminKey } = require('../utils/adminKey');
const { bot } = require('../utils/bot');
const { botText } = require('../utils/botMessages');
const User = require('../models/User');
const { generateReferralCode } = require('../utils/telegramAuth');

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const APP_URL = process.env.APP_URL || '';

// POST /api/telegram/webhook — دریافت آپدیت از تلگرام
router.post('/webhook', async (req, res) => {
  if (WEBHOOK_SECRET) {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== WEBHOOK_SECRET) {
      return res.sendStatus(401);
    }
  }

  res.sendStatus(200);

  try {
    const update = req.body;
    const message = update && update.message;
    if (!bot || !message || !message.text) return;

    const chatId = message.chat.id;
    const text = message.text.trim();

    if (text.startsWith('/start')) {
      const parts = text.split(' ');
      const payload = parts[1] || null;
      const telegramId = String(message.from.id);

      let user = await User.findOne({ telegramId });

      if (!user) {
        let referredBy = null;
        if (payload) {
          const referrer = await User.findOne({ referralCode: payload });
          if (referrer && String(referrer.telegramId) !== telegramId) {
            referredBy = referrer._id;
          }
        }

        user = await User.create({
          telegramId,
          username: message.from.username || '',
          firstName: message.from.first_name || '',
          lastName: message.from.last_name || '',
          referralCode: generateReferralCode(telegramId),
          referredBy
        });

        if (referredBy) {
          // پاداش اینجا داده نمی‌شود — فقط بعد از تکمیل حداقل تعداد تسک لازم
          // توسط همین کاربر جدید (در routes/tasks.js) پرداخت می‌شود.
          await User.findByIdAndUpdate(referredBy, { $inc: { invitedCount: 1 } });
        }
      }

      // آدرس اپ را با ref=CODE می‌فرستیم تا اگر کاربر همان لحظه رفرال نشده،
      // فرانت‌اند بتواند از طریق GET /api/auth/me?ref=CODE آن را اعمال کند.
      const webAppUrl = APP_URL
        ? (payload ? `${APP_URL}?ref=${encodeURIComponent(payload)}` : APP_URL)
        : '';

      const keyboard = webAppUrl
        ? { inline_keyboard: [[{ text: '🚀 باز کردن اپلیکیشن', web_app: { url: webAppUrl } }]] }
        : undefined;

      const startedUser = await User.findOne({ telegramId: String(chatId) }, 'language');
      await bot.sendMessage(
        chatId,
        botText('welcome', startedUser?.language || 'fa', message.from.first_name || (startedUser?.language === 'en' ? 'friend' : 'دوست عزیز')),
        keyboard ? { reply_markup: keyboard } : {}
      );
    }
  } catch (error) {
    console.error('Webhook handling error:', error);
  }
});

// GET /api/telegram/set-webhook — یک‌بار برای تنظیم وبهوک صدا بزنید
router.get('/set-webhook', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  if (!isValidAdminKey(typeof adminKey === 'string' ? adminKey : '')) {
    return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز. کلید ادمین لازم است (?key=ADMIN_KEY).' });
  }
  if (!bot || !APP_URL) {
    return res.status(400).json({ success: false, message: 'BOT_TOKEN یا APP_URL تنظیم نشده است.' });
  }
  try {
    const url = `${APP_URL}/api/telegram/webhook`;
    const options = WEBHOOK_SECRET ? { secret_token: WEBHOOK_SECRET } : {};
    await bot.setWebHook(url, options);
    res.json({ success: true, message: `Webhook تنظیم شد: ${url}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;