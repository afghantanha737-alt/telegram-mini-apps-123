'use strict';
const express = require('express');
const router = express.Router();
const TelegramBot = require('node-telegram-bot-api');
const User = require('../models/User');
const { generateReferralCode } = require('../utils/telegramAuth');

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const APP_URL = process.env.APP_URL || '';

const bot = BOT_TOKEN ? new TelegramBot(BOT_TOKEN) : null;

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
          const REFERRAL_BONUS = Number(process.env.REFERRAL_BONUS_POINTS || 50);
          await User.findByIdAndUpdate(referredBy, {
            $inc: { points: REFERRAL_BONUS, invitedCount: 1 }
          });
        }
      }

      const keyboard = APP_URL
        ? { inline_keyboard: [[{ text: '🚀 باز کردن اپلیکیشن', web_app: { url: APP_URL } }]] }
        : undefined;

      await bot.sendMessage(
        chatId,
        `سلام ${message.from.first_name || 'دوست عزیز'} 👋\nبه ربات امتیاز و پاداش خوش آمدی!\nبا انجام تسک‌ها، دعوت دوستان و ورود روزانه، امتیاز جمع کن.`,
        keyboard ? { reply_markup: keyboard } : {}
      );
    }
  } catch (error) {
    console.error('Webhook handling error:', error);
  }
});

router.get('/set-webhook', async (req, res) => {
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