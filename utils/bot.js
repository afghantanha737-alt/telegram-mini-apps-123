'use strict';
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;

// یک instance مشترک ربات برای کل پروژه (webhook, verify عضویت, ارسال عکس, پیام همگانی)
const bot = BOT_TOKEN ? new TelegramBot(BOT_TOKEN) : null;

/**
 * بررسی می‌کند آیا کاربر عضو یک کانال/گروه هست یا نه.
 * نکته: ربات باید ادمین همان کانال/گروه باشد تا این متد کار کند.
 */
async function isChatMember(chatId, telegramUserId) {
  if (!bot || !chatId) return false;
  try {
    const member = await bot.getChatMember(chatId, telegramUserId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.warn(`getChatMember failed for chat=${chatId} user=${telegramUserId}:`, error.message);
    return false;
  }
}

module.exports = { bot, isChatMember };