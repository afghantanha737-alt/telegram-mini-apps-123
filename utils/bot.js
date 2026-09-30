'use strict';
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;

// یک instance مشترک ربات برای کل پروژه (webhook, verify عضویت, ارسال عکس, پیام همگانی)
const bot = BOT_TOKEN ? new TelegramBot(BOT_TOKEN) : null;

/**
 * یک Promise را با سقف زمانی مشخص اجرا می‌کند تا در صورت کندی/بی‌جوابی
 * API تلگرام (مثلاً وقتی سرویس رایگان تازه از خواب بیدار شده)، درخواست
 * کاربر برای همیشه معطل نماند.
 */
function withTimeout(promise, ms, fallbackValue) {
  // اگر promise اصلی بعد از سررسید timeout هم رد شود (reject)، بدون این خط
  // آن خطا "بی‌صاحب" (unhandled rejection) می‌ماند و می‌تواند در برخی محیط‌ها
  // باعث بی‌ثباتی پردازش کل سرور شود؛ این خط آن را بی‌خطر می‌کند.
  promise.catch(() => {});

  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallbackValue), ms))
  ]);
}

/**
 * بررسی می‌کند آیا کاربر عضو یک کانال/گروه هست یا نه.
 * نکته: ربات باید ادمین همان کانال/گروه باشد تا این متد کار کند.
 *
 * به‌جای true/false ساده، جزئیات کامل برمی‌گرداند تا اگر خطای واقعی
 * (chatId اشتباه، ربات بدون دسترسی و ...) رخ داد، بشود آن را از حالت
 * عادیِ «هنوز عضو نشده» تشخیص داد.
 */
async function checkChatMembership(chatId, telegramUserId) {
  if (!bot) {
    return { joined: false, configError: 'BOT_TOKEN تنظیم نشده است.' };
  }
  if (!chatId) {
    return { joined: false, configError: 'برای این تسک chatId ثبت نشده است.' };
  }

  try {
    const member = await withTimeout(
      bot.getChatMember(chatId, telegramUserId),
      25000,
      'TIMEOUT'
    );

    if (member === 'TIMEOUT') {
      console.warn(`getChatMember timed out for chat=${chatId} user=${telegramUserId}`);
      return { joined: false, configError: 'پاسخ تلگرام کند بود (Timeout). دوباره تلاش کن.' };
    }

    const joined = ['member', 'administrator', 'creator'].includes(member.status);
    return { joined };
  } catch (error) {
    const raw = error.message || '';
    console.warn(`getChatMember failed for chat=${chatId} user=${telegramUserId}:`, raw);

    // خطاهایی که یعنی مشکل از تنظیمات تسک/ربات است، نه از کاربر
    const isConfigIssue =
      /chat not found/i.test(raw) ||
      /not enough rights/i.test(raw) ||
      /member list is inaccessible/i.test(raw) ||
      /bot is not a member/i.test(raw) ||
      /kicked/i.test(raw);

    if (isConfigIssue) {
      return { joined: false, configError: `مشکل تنظیمات تسک: ${raw}` };
    }

    // کاربر پیدا نشد یعنی معمولاً واقعاً عضو نیست
    return { joined: false };
  }
}

// نگه‌داشتن نام قدیمی برای سازگاری با کدهای دیگر (اگر جایی صدا زده شده)
async function isChatMember(chatId, telegramUserId) {
  const result = await checkChatMembership(chatId, telegramUserId);
  return result.joined;
}

/**
 * ارسال امن یک پیام به یک کاربر مشخص (مثلاً برای اطلاع‌رسانی تایید/رد برداشت).
 * خطاها را می‌بلعد و فقط true/false برمی‌گرداند تا هیچ‌وقت باعث خرابی جریان اصلی
 * (مثل تایید برداشت در پنل ادمین) نشود — مثلاً اگر کاربر ربات را بلاک کرده باشد.
 */
async function notifyUser(telegramId, text, options = {}) {
  if (!bot || !telegramId) return false;
  try {
    await bot.sendMessage(telegramId, text, options);
    return true;
  } catch (error) {
    if (isTelegramDeliveryBlocked(error)) {
      await markTelegramBlocked(telegramId);
      return false;
    }
    console.warn(`notifyUser failed for telegramId=${telegramId}:`, error.message || error);
    return false;
  }
}

function isTelegramDeliveryBlocked(error) {
  const code = error?.response?.body?.error_code || error?.response?.statusCode;
  const message = String(error?.message || error || '');
  return Number(code) === 403 || /bot was blocked|user is deactivated|chat not found/i.test(message);
}

async function markTelegramBlocked(telegramId) {
  try {
    const User = require('../models/User');
    await User.updateOne(
      { telegramId: String(telegramId), telegramBlockedAt: null },
      { $set: { telegramBlockedAt: new Date() } }
    );
  } catch (error) {
    console.warn('Failed to mark Telegram-blocked user:', error.message || error);
  }
}

async function copyMessageSafe(User, telegramId, fromChatId, messageId) {
  try {
    await bot.copyMessage(telegramId, fromChatId, messageId);
    return true;
  } catch (error) {
    if (isTelegramDeliveryBlocked(error)) await markTelegramBlocked(telegramId);
    return false;
  }
}

/**
 * ارسال دسته‌ای یک پیام به همه‌ی کاربران فعال (غیربن‌شده)، با رعایت محدودیت نرخ تلگرام.
 * برای اطلاع‌رسانی رویدادهای عمومی مثل «تسک جدید اضافه شد» استفاده می‌شود.
 * fire-and-forget است؛ منتظرش نمی‌مانیم تا پاسخ اصلی API کند نشود.
 */
async function broadcastToActiveUsers(User, textOrFn) {
  if (!bot) return;
  // زبان هر کاربر هم لازم است تا اگر textOrFn تابع باشد، پیام به همان زبان ساخته شود
  const users = await User.find({ isBanned: false, telegramBlockedAt: null }, 'telegramId language');
  const BATCH_SIZE = 20;
  const DELAY_MS = 1100;
  const textFor = typeof textOrFn === 'function' ? textOrFn : () => textOrFn;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(u => notifyUser(u.telegramId, textFor(u))));
    if (i + BATCH_SIZE < users.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
}

/**
 * مثل broadcastToActiveUsers ولی برای «کپی کردن» یک پیام دلخواه (متن، عکس، پست فوروادشده از
 * کانال و ...) به همه‌ی کاربران — برای دکمه‌ی «ارسال پیام همگانی» در دستور /admin ربات.
 * از copyMessage استفاده می‌شود (نه forwardMessage) تا برچسب «Forwarded from» روی پیام کاربر نیفتد.
 * برمی‌گرداند: تعداد کاربرانی که با موفقیت پیام گرفتند.
 */
async function broadcastCopyToActiveUsers(User, fromChatId, messageId) {
  if (!bot) return 0;
  const users = await User.find({ isBanned: false, telegramBlockedAt: null }, 'telegramId');
  const BATCH_SIZE = 20;
  const DELAY_MS = 1100;
  let sent = 0;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(u => copyMessageSafe(User, u.telegramId, fromChatId, messageId)));
    sent += results.filter(Boolean).length;
    if (i + BATCH_SIZE < users.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }
  return sent;
}

module.exports = { bot, isChatMember, checkChatMembership, notifyUser, markTelegramBlocked, isTelegramDeliveryBlocked, broadcastToActiveUsers, broadcastCopyToActiveUsers };
