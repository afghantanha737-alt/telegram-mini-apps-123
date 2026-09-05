const express = require('express');
const router = express.Router();

const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');

const botToken = () => process.env.BOT_TOKEN;

/**
 * Call Telegram Bot API
 */
async function tgCall(method, payload) {
  const token = botToken();

  if (!token) {
    throw new Error('BOT_TOKEN در متغیرهای محیطی تنظیم نشده است');
  }

  const url = `https://api.telegram.org/bot${token}/${method}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!data.ok) {
    console.error(`Telegram API error (${method}):`, data.description);
  }

  return data;
}

/**
 * POST /api/telegram/webhook/:secret
 *
 * IMPORTANT:
 * این Webhook عمداً به پیام‌های معمولی، /start، گروه‌ها،
 * my_chat_member و channel_post پاسخ نمی‌دهد.
 *
 * تنها callback_query مربوط به مدیریت برداشت‌ها پردازش می‌شود.
 */
router.post('/webhook/:secret', async (req, res) => {
  // ---------------------------------------------------------
  // 1. بررسی Secret
  // ---------------------------------------------------------
  if (req.params.secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    console.warn('⚠️ درخواست Webhook با secret اشتباه دریافت شد');
    return res.sendStatus(403);
  }

  // ---------------------------------------------------------
  // 2. Telegram باید سریع 200 دریافت کند
  // ---------------------------------------------------------
  res.sendStatus(200);

  try {
    const update = req.body || {};

    // -------------------------------------------------------
    // 3. فقط callback_query را پردازش کن
    // -------------------------------------------------------
    //
    // همه این موارد عمداً IGNORE می‌شوند:
    //
    // message
    // edited_message
    // channel_post
    // edited_channel_post
    // inline_query
    // chosen_inline_result
    // my_chat_member
    // chat_member
    // chat_join_request
    //
    // بنابراین این Webhook هیچ /start یا پیام گروهی ارسال نمی‌کند.
    //
    const callbackQuery = update.callback_query;

    if (!callbackQuery) {
      return;
    }

    // -------------------------------------------------------
    // 4. اطلاعات callback
    // -------------------------------------------------------
    const callbackId = callbackQuery.id;
    const callbackData = String(callbackQuery.data || '');
    const callbackUserId = String(
      callbackQuery.from?.id || ''
    );

    // -------------------------------------------------------
    // 5. فقط Admin اجازه پردازش دارد
    // -------------------------------------------------------
    const adminChatId = String(
      process.env.ADMIN_CHAT_ID || ''
    );

    if (!adminChatId || callbackUserId !== adminChatId) {
      await tgCall('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: 'اجازه انجام این کار را نداری',
        show_alert: true
      });

      return;
    }

    // -------------------------------------------------------
    // 6. بررسی callback data
    // -------------------------------------------------------
    //
    // انتظار:
    // approve_WITHDRAWAL_ID
    // reject_WITHDRAWAL_ID
    //
    const separatorIndex = callbackData.indexOf('_');

    if (separatorIndex === -1) {
      await tgCall('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: 'دستور نامعتبر است'
      });

      return;
    }

    const action = callbackData.slice(0, separatorIndex);
    const withdrawalId = callbackData.slice(separatorIndex + 1);

    if (!['approve', 'reject'].includes(action)) {
      await tgCall('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: 'دستور نامعتبر است'
      });

      return;
    }

    if (!withdrawalId) {
      await tgCall('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: 'شناسه برداشت پیدا نشد'
      });

      return;
    }

    // -------------------------------------------------------
    // 7. پیدا کردن درخواست برداشت
    // -------------------------------------------------------
    const withdrawal = await Withdrawal.findById(withdrawalId);

    if (!withdrawal) {
      await tgCall('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: 'این درخواست برداشت پیدا نشد'
      });

      return;
    }

    // -------------------------------------------------------
    // 8. جلوگیری از پردازش دوباره
    // -------------------------------------------------------
    if (withdrawal.status !== 'pending') {
      await tgCall('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: 'این درخواست قبلاً رسیدگی شده است'
      });

      return;
    }

    // -------------------------------------------------------
    // 9. APPROVE
    // -------------------------------------------------------
    if (action === 'approve') {
      withdrawal.status = 'approved';
      withdrawal.processedAt = new Date();

      await withdrawal.save();

      await tgCall('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: '✅ برداشت تأیید شد'
      });
    }

    // -------------------------------------------------------
    // 10. REJECT
    // -------------------------------------------------------
    if (action === 'reject') {
      withdrawal.status = 'rejected';
      withdrawal.processedAt = new Date();

      await withdrawal.save();

      // برگشت دادن پوینت‌های برداشت‌شده به کاربر
      await User.findOneAndUpdate(
        {
          telegramId: withdrawal.userId
        },
        {
          $inc: {
            points: withdrawal.pointsAmount
          }
        }
      );

      await tgCall('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: '❌ برداشت رد شد و پوینت‌ها برگشت داده شد'
      });
    }

    // -------------------------------------------------------
    // 11. بروزرسانی پیام ادمین
    // -------------------------------------------------------
    //
    // این قسمت فقط همان پیام مدیریتی مربوط به برداشت را
    // آپدیت می‌کند و هیچ پیام جدیدی برای /start یا گروه‌ها
    // ارسال نمی‌کند.
    //
    const telegramMessage = callbackQuery.message;

    if (!telegramMessage) {
      return;
    }

    const oldText = String(telegramMessage.text || '');

    const statusLabel =
      action === 'approve'
        ? '✅ تأیید شده'
        : '❌ رد شده';

    // جلوگیری از اضافه شدن چندباره وضعیت
    let newText = oldText;

    if (!oldText.includes('وضعیت:')) {
      newText = `${oldText}\n\n<b>وضعیت: ${statusLabel}</b>`;
    } else {
      newText = oldText.replace(
        /<b>وضعیت:.*?<\/b>/g,
        `<b>وضعیت: ${statusLabel}</b>`
      );
    }

    await tgCall('editMessageText', {
      chat_id: telegramMessage.chat.id,
      message_id: telegramMessage.message_id,
      text: newText,
      parse_mode: 'HTML'
    });

  } catch (error) {
    console.error(
      '❌ خطا در پردازش Webhook تلگرام:',
      error.message
    );
  }
});

module.exports = router;