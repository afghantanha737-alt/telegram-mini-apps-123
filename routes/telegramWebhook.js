const express = require('express');
const router = express.Router();
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');

const botToken = () => process.env.BOT_TOKEN;

async function tgCall(method, payload) {
  const url = `https://api.telegram.org/bot${botToken()}/${method}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return res.json();
}

// POST /api/telegram/webhook/:secret
// تلگرام هر آپدیتی (از جمله کلیک روی دکمه‌ها) رو به این آدرس می‌فرسته
router.post('/webhook/:secret', async (req, res) => {
  if (req.params.secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }

  const update = req.body;
  res.sendStatus(200);

  try {
    const cq = update.callback_query;
    if (!cq) return;

    const adminChatId = String(process.env.ADMIN_CHAT_ID || '');
    if (String(cq.from.id) !== adminChatId) {
      await tgCall('answerCallbackQuery', { callback_query_id: cq.id, text: 'اجازه نداری این کارو بکنی', show_alert: true });
      return;
    }

    const [action, withdrawalId] = cq.data.split('_');
    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) {
      await tgCall('answerCallbackQuery', { callback_query_id: cq.id, text: 'این درخواست پیدا نشد' });
      return;
    }

    if (withdrawal.status !== 'pending') {
      await tgCall('answerCallbackQuery', { callback_query_id: cq.id, text: 'این درخواست قبلا رسیدگی شده' });
      return;
    }

    if (action === 'approve') {
      withdrawal.status = 'approved';
      withdrawal.processedAt = new Date();
      await withdrawal.save();
      await tgCall('answerCallbackQuery', { callback_query_id: cq.id, text: '✅ تایید شد' });
    } else if (action === 'reject') {
      withdrawal.status = 'rejected';
      withdrawal.processedAt = new Date();
      await withdrawal.save();
      await User.findOneAndUpdate({ telegramId: withdrawal.userId }, { $inc: { points: withdrawal.pointsAmount } });
      await tgCall('answerCallbackQuery', { callback_query_id: cq.id, text: '❌ رد شد و پوینت برگشت' });
    }

    const statusLabel = action === 'approve' ? '✅ تایید شده' : '❌ رد شده';
    const newText = cq.message.text + `\n\n<b>وضعیت: ${statusLabel}</b>`;
    await tgCall('editMessageText', {
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      text: newText,
      parse_mode: 'HTML'
    });
  } catch (err) {
    console.error('خطا در پردازش وبهوک تلگرام:', err.message);
  }
});

module.exports = router;