'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { isValidAdminKey } = require('../utils/adminKey');
const { bot, broadcastCopyToActiveUsers } = require('../utils/bot');
const { botText } = require('../utils/botMessages');
const User = require('../models/User');
const Task = require('../models/Task');
const TaskReactionState = require('../models/TaskReactionState');
const Withdrawal = require('../models/Withdrawal');
const { generateReferralCode } = require('../utils/telegramAuth');
const { isAdminTelegramId, createAdminSessionStore } = require('../utils/telegramAdmin');
const { linkReferralByCode } = require('../utils/referralSystem');
const { extractReactionEmojis, extractAddedReactionEmojis } = require('../utils/latestPostEngagement');
const { parseTelegramStart, handleTelegramStart } = require('../utils/telegramStart');
const {
  recordWebhookUpdate,
  recordStartWelcomeSent,
  recordStartHandlerFailure,
  recordWebhookProcessingFailure,
  recordWebhookSecretRejection
} = require('../utils/telegramWebhookMetrics');

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

async function handleLatestChannelPost(update) {
  const message = update.channel_post;
  const chatId = message?.chat?.id;
  const messageId = Number(message?.message_id);
  const updateId = Number(update.update_id);
  if (chatId == null || !Number.isSafeInteger(messageId) || messageId <= 0 || !Number.isSafeInteger(updateId)) return;

  const normalizedChatId = String(chatId);
  await Task.updateMany(
    {
      verifyType: 'latest_post',
      chatId: normalizedChatId,
      $or: [{ latestPostUpdateId: null }, { latestPostUpdateId: { $lt: updateId } }]
    },
    {
      $set: {
        latestPostMessageId: messageId,
        latestPostDate: message.date ? new Date(Number(message.date) * 1000) : new Date(),
        latestPostUpdateId: updateId
      }
    }
  );

  const currentTasks = await Task.find({ verifyType: 'latest_post', chatId: normalizedChatId })
    .select('latestPostMessageId')
    .lean();
  if (currentTasks.some(task => Number(task.latestPostMessageId) === messageId)) {
    // Keep reaction state only for the currently tracked post to bound storage.
    await TaskReactionState.deleteMany({ chatId: normalizedChatId, messageId: { $ne: messageId } });
  }
}

async function handleMessageReaction(update) {
  const reaction = update.message_reaction;
  const chatId = reaction?.chat?.id;
  const messageId = Number(reaction?.message_id);
  const telegramUserId = reaction?.user?.id;
  const updateId = Number(update.update_id);
  // Anonymous reactions cannot be attributed to an app user, so they never qualify.
  if (chatId == null || telegramUserId == null || !Number.isSafeInteger(messageId) || !Number.isSafeInteger(updateId)) return;

  const normalizedChatId = String(chatId);
  const tracked = await Task.exists({
    verifyType: 'latest_post',
    chatId: normalizedChatId,
    latestPostMessageId: messageId
  });
  if (!tracked) return;

  const userExists = await User.exists({ telegramId: String(telegramUserId) });
  if (!userExists) return;

  const key = { chatId: normalizedChatId, messageId, telegramUserId: String(telegramUserId) };
  const reactionEmojis = extractReactionEmojis(update);
  const values = {
    ...key,
    reactionEmojis,
    lastAddedReactionEmojis: extractAddedReactionEmojis(update),
    lastUpdateId: updateId,
    lastEventAt: reaction.date ? new Date(Number(reaction.date) * 1000) : new Date()
  };

  try {
    await TaskReactionState.updateOne(
      { ...key, $or: [{ lastUpdateId: null }, { lastUpdateId: { $lt: updateId } }] },
      { $set: values },
      { upsert: true, runValidators: true }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const current = await TaskReactionState.findOne(key).select('lastUpdateId').lean();
    // Duplicate/replayed or out-of-order update; the state already reflects a newer event.
    if (current && Number(current.lastUpdateId) >= updateId) return;
    throw error;
  }
}

// POST /api/telegram/webhook — دریافت آپدیت از تلگرام
router.post('/webhook', async (req, res) => {
  if (WEBHOOK_SECRET) {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== WEBHOOK_SECRET) {
      recordWebhookSecretRejection();
      return res.sendStatus(401);
    }
  }

  const update = req.body;
  const updateType = update?.channel_post ? 'channel_post'
    : update?.message_reaction ? 'message_reaction'
      : update?.callback_query ? 'callback_query'
        : parseTelegramStart(update?.message?.text) ? 'start'
          : update?.message ? 'message' : 'other';
  recordWebhookUpdate(updateType);

  if (update?.channel_post || update?.message_reaction) {
    try {
      if (update.channel_post) await handleLatestChannelPost(update);
      if (update.message_reaction) await handleMessageReaction(update);
      return res.sendStatus(200);
    } catch (error) {
      recordWebhookProcessingFailure();
      console.error('Telegram engagement update processing failed; requesting retry:', error.message || error);
      return res.sendStatus(500);
    }
  }

  // Acknowledge /start only after user creation/referral handling and sendMessage succeed.
  // This makes Telegram retry transient failures instead of silently losing the Welcome.
  if (bot && update?.message && updateType === 'start') {
    try {
      const result = await handleTelegramStart({
        message: update.message,
        bot,
        User,
        appUrl: APP_URL,
        generateReferralCode,
        linkReferralByCode,
        botText
      });
      if (result?.welcomeSent) recordStartWelcomeSent();
      console.info('Telegram /start handled', {
        updateId: update.update_id,
        isNewUser: Boolean(result?.isNewUser),
        referralPayloadReceived: Boolean(result?.hadReferralPayload),
        welcomeSent: Boolean(result?.welcomeSent)
      });
      return res.sendStatus(200);
    } catch (error) {
      recordStartHandlerFailure();
      console.error('Telegram /start failed; requesting retry:', {
        updateId: update.update_id,
        error: error.message || String(error)
      });
      return res.sendStatus(500);
    }
  }

  res.sendStatus(200);
  try {
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
  } catch (error) {
    recordWebhookProcessingFailure();
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
  if (WEBHOOK_SECRET && !/^[A-Za-z0-9_-]{1,256}$/.test(WEBHOOK_SECRET)) {
    return res.status(400).json({ success: false, message: 'TELEGRAM_WEBHOOK_SECRET باید ۱ تا ۲۵۶ کاراکتر و فقط شامل حروف انگلیسی، عدد، _ یا - باشد.' });
  }
  try {
    const url = `${APP_URL.replace(/\/$/, '')}/api/telegram/webhook`;
    const options = {
      allowed_updates: ['message', 'callback_query', 'channel_post', 'message_reaction'],
      ...(WEBHOOK_SECRET ? { secret_token: WEBHOOK_SECRET } : {})
    };
    await bot.setWebHook(url, options);
    const info = await bot.getWebhookInfo();
    res.json({
      success: true,
      message: `Webhook تنظیم شد: ${url}`,
      webhook: {
        url: info.url || '',
        allowedUpdates: info.allowed_updates || [],
        pendingUpdateCount: Number(info.pending_update_count) || 0,
        lastErrorMessage: info.last_error_message || ''
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
