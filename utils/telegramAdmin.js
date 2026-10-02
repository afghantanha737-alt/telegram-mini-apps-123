'use strict';

/**
 * منطق خالص (بدون دیتابیس/ربات) برای بخش «مدیریت از تلگرام» — قابل تست مستقل.
 * هویت ادمین فقط از روی telegramId امضاشده‌ی خودِ آپدیت تلگرام تایید می‌شود (نه از ورودی کاربر)،
 * پس این مسیر امن است حتی بدون کلید جداگانه.
 */

function parseAdminIds(raw) {
  return new Set(
    String(raw || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
  );
}

function isAdminTelegramId(telegramId, raw = process.env.ADMIN_TELEGRAM_IDS) {
  const ids = parseAdminIds(raw);
  return ids.has(String(telegramId));
}

/** حداکثر عمر «در انتظار محتوای پیام همگانی» و «در انتظار تایید» (میلی‌ثانیه) */
const BROADCAST_STATE_TTL_MS = 10 * 60 * 1000;

/**
 * وضعیت موقت گفت‌وگوی ادمین با ربات (کدام ادمین منتظر چه چیزی است).
 * عمداً در حافظه نگه داشته می‌شود، نه دیتابیس: این فقط یک جریان چندمرحله‌ای کوتاه‌عمر
 * («پیام رو بفرست» → «تایید کن») است، نه داده‌ای که باید بین ری‌استارت سرور بماند؛
 * اگر سرور ری‌استارت شود، ادمین فقط دوباره از «ارسال پیام همگانی» شروع می‌کند.
 */
function createAdminSessionStore(now = () => Date.now()) {
  const awaitingContent = new Map(); // telegramId -> expiresAt
  const pendingConfirm = new Map(); // telegramId -> { fromChatId, messageId, expiresAt }

  function prune(map) {
    const t = now();
    for (const [key, value] of map.entries()) {
      const expiresAt = typeof value === 'number' ? value : value.expiresAt;
      if (t > expiresAt) map.delete(key);
    }
  }

  return {
    setAwaitingContent(telegramId) {
      awaitingContent.set(String(telegramId), now() + BROADCAST_STATE_TTL_MS);
    },
    isAwaitingContent(telegramId) {
      prune(awaitingContent);
      return awaitingContent.has(String(telegramId));
    },
    clearAwaitingContent(telegramId) {
      awaitingContent.delete(String(telegramId));
    },
    setPendingConfirm(telegramId, fromChatId, messageId) {
      pendingConfirm.set(String(telegramId), { fromChatId, messageId, expiresAt: now() + BROADCAST_STATE_TTL_MS });
    },
    takePendingConfirm(telegramId) {
      prune(pendingConfirm);
      const key = String(telegramId);
      const value = pendingConfirm.get(key);
      pendingConfirm.delete(key);
      return value || null;
    },
    hasPendingConfirm(telegramId) {
      prune(pendingConfirm);
      return pendingConfirm.has(String(telegramId));
    }
  };
}

module.exports = { parseAdminIds, isAdminTelegramId, createAdminSessionStore, BROADCAST_STATE_TTL_MS };
