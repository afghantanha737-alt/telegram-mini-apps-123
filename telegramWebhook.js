'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { isValidAdminKey } = require('../utils/adminKey');
const { bot, broadcastCopyToActiveUsers } = require('../utils/bot');
const { botText } = require('../utils/botMessages');
const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const { generateReferralCode } = require('../utils/telegramAuth');
const { isAdminTelegramId, createAdminSessionStore } = require('../utils/telegramAdmin');
const { linkReferralByCode } = require('../utils/referralSystem');

// وضعیت موقت گفت‌وگوی «/admin» (در حافظه؛ توضیح کامل در utils/telegramAdmin.js)
const adminSessions = createAdminSessionStore();

const ADMIN_MENU_KEYBOARD = {
  inline_keyboard: [
    [{ text: '📊 آمار سریع', callback_data: 'admin_stats' }],
    [{ text: '💰 برداشت‌های در انتظار', callback_data: 'admin_pending' }],
    [{ text: '📢 ارسال پیام همگانی', callback_data: 'admin_broadcast' }]
  ]
};

async function sendAdminMenu(chatId) {
  await bot.sendMessage(chatId, '🛠 پنل مدیریت Gramup — یکی را انتخاب کن:', { reply_markup: ADMIN_MENU_KEYBOARD });
}

async function handleAdminStats(chatId) {
  const [totalUsers, pendingCount, pendingAgg] = await Promise.all([
    User.countDocuments({}),
    Withdrawal.countDocuments({ status: { $in: ['pending', 'approved', 'processing'] } }),
    Withdrawal.aggregate([
      { $match: { status: { $in: ['pending', 'approved', 'processing'] } } },
      { $group: { _id: '$token', total: { $sum: '$cryptoAmount' } } }
    ])
  ]);
  const pendingSum = pendingAgg.map(row => `${row.total} ${row._id || 'GRAM'}`).join(' + ') || '0';
  await bot.sendMessage(
    chatId,
    `📊 آمار سریع

کل کاربران: ${totalUsers}
برداشت‌های در انتظار: ${pendingCount} (${pendingSum})

برای جزئیات کامل، پنل وب را باز کن.`
  );
}

async function handleAdminPending(chatId) {
  const list = await Withdrawal.find({ status: { $in: ['pending', 'approved', 'processing'] } })
    .populate('user', 'firstName username')
    .sort({ createdAt: 1 })
    .limit(10);
  if (!list.length) {
    await bot.sendMessage(chatId, '✅ در حال حاضر برداشت در انتظاری وجود ندارد.');
    return;
  }
  const STATUS_FA = { pending: 'در انتظار بررسی', approved: 'تاییدشده', processing: 'در حال پردازش' };
  const lines = list.map(w =>
    `• ${w.cryptoAmount} ${w.token} — ${w.user?.firstName || w.user?.username || 'کاربر'} — ${STATUS_FA[w.status] || w.status}\n  شناسه: ${w._id}`
  );
  const body = `💰 برداشت‌های در انتظار (حداکثر ۱۰ مورد اول):\n\n${lines.join('\n\n')}\n\nتایید نهایی (وارد کردن Transaction Hash) فقط از پنل وب ممکن است، چون به بررسی روی زنجیره نیاز دارد.`;
  await bot.sendMessage(chatId, body);
}

async function handleAdminBroadcastPrompt(telegramId, chatId) {
  adminSessions.setAwaitingContent(telegramId);
  await bot.sendMessage(
    chatId,
    `📢 پیامی که می‌خواهی برای همه‌ی کاربران فعال ارسال شود را بفرست (متن، عکس، یا حتی یک پست از کانالت را فوروارد کن).\n\nبرای انصراف: /cancel`
  );
}

async function handleBroadcastContent(telegramId, chatId, message) {
  adminSessions.clearAwaitingContent(telegramId);
  adminSessions.setPendingConfirm(telegramId, chatId, message.message_id);
  await bot.copyMessage(chatId, chatId, message.message_id); // پیش‌نمایش دقیقاً همان چیزی که کاربران می‌بینند
  await bot.sendMessage(chatId, '⬆️ این پیام برای همه‌ی کاربران فعال ارسال شود؟', {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ بله، ارسال کن', callback_data: 'admin_broadcast_confirm' },
        { text: '❌ انصراف', callback_data: 'admin_broadcast_cancel' }
      ]]
    }
  });
}

async function handleBroadcastConfirm(telegramId, chatId) {
  const pending = adminSessions.takePendingConfirm(telegramId);
  if (!pending) {
    await bot.sendMessage(chatId, 'چیزی برای ارسال در انتظار نیست. از «📢 ارسال پیام همگانی» دوباره شروع کن.');
    return;
  }
  await bot.sendMessage(chatId, '⏳ در حال ارسال...');
  const sent = await broadcastCopyToActiveUsers(User, pending.fromChatId, pending.messageId);
  await bot.sendMessage(chatId, `✅ پیام برای ${sent} کاربر ارسال شد.`);
}

async function handleCallbackQuery(callbackQuery) {
  const telegramId = String(callbackQuery.from.id);
  const chatId = callbackQuery.message && callbackQuery.message.chat.id;
  if (bot.answerCallbackQuery) {
    bot.answerCallbackQuery(callbackQuery.id).catch(() => {});
  }
  if (!isAdminTelegramId(telegramId) || !chatId) return;

  const data = callbackQuery.data;
  if (data === 'admin_stats') return handleAdminStats(chatId);
  if (data === 'admin_pending') return handleAdminPending(chatId);
  if (data === 'admin_broadcast') return handleAdminBroadcastPrompt(telegramId, chatId);
  if (data === 'admin_broadcast_confirm') return handleBroadcastConfirm(telegramId, chatId);
  if (data === 'admin_broadcast_cancel') {
    adminSessions.takePendingConfirm(telegramId);
    return bot.sendMessage(chatId, 'لغو شد.');
  }
}

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

    if (bot && update && update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return;
    }

    const message = update && update.message;
    if (!bot || !message) return;

    const chatId = message.chat.id;
    const senderId = message.from && String(message.from.id);
    const text = (message.text || '').trim();

    // ---- جریان «/admin» در خود تلگرام (فقط برای آیدی‌های داخل ADMIN_TELEGRAM_IDS) ----
    if (text === '/admin') {
      if (isAdminTelegramId(senderId)) {
        await sendAdminMenu(chatId);
      } else {
        await bot.sendMessage(
          chatId,
          `آیدی عددی شما: ${senderId}

برای دسترسی مدیریتی از تلگرام، این عدد را به متغیر محیطی ADMIN_TELEGRAM_IDS در تنظیمات سرور اضافه کنید.`
        );
      }
      return;
    }

    if (isAdminTelegramId(senderId) && text === '/cancel' && adminSessions.isAwaitingContent(senderId)) {
      adminSessions.clearAwaitingContent(senderId);
      await bot.sendMessage(chatId, 'ارسال پیام همگانی لغو شد.');
      return;
    }

    // پیام (متن/عکس/فوروارد) که ادمین بعد از زدن «📢 ارسال پیام همگانی» می‌فرستد
    if (isAdminTelegramId(senderId) && adminSessions.isAwaitingContent(senderId)) {
      await handleBroadcastContent(senderId, chatId, message);
      return;
    }

    if (!text) return;

    const startMatch = /^\/start(?:@[A-Za-z0-9_]+)?(?:\s+([A-Za-z0-9_-]{1,64}))?\s*$/.exec(text);
    if (startMatch) {
      const payload = startMatch[1] || null;
      const telegramId = String(message.from.id);

      let user = await User.findOne({ telegramId });
      const isNewUser = !user;

      if (isNewUser) {
        user = await User.create({
          telegramId,
          username: message.from.username || '',
          firstName: message.from.first_name || '',
          lastName: message.from.last_name || '',
          referralCode: generateReferralCode(telegramId)
        });
        if (payload) {
          try {
            await linkReferralByCode({ referredUserId: user._id, referralCode: payload, source: 'signup' });
          } catch (error) {
            console.error('Referral /start linking failed; Mini App fallback will retry:', error.message || error);
          }
        }

        // Keep the configured Mini App URL; the referral query is only a fallback
        // for a newly-created account if the webhook-side link could not be applied.
        const webAppUrl = APP_URL
          ? (payload ? `${APP_URL}?ref=${encodeURIComponent(payload)}` : APP_URL)
          : '';

        const keyboard = webAppUrl
          ? { inline_keyboard: [[{ text: '🚀 Open GramUp', web_app: { url: webAppUrl } }]] }
          : undefined;

        await bot.sendMessage(
          chatId,
          botText('welcome', user.language || 'fa', message.from.first_name || (user.language === 'en' ? 'friend' : 'دوست عزیز')),
          keyboard ? { reply_markup: keyboard } : {}
        );
      }
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
