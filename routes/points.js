const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const verifyTelegramInitData = require('../utils/verifyTelegram');

// GET /api/points/me?initData=...
router.get('/me', async (req, res) => {
  const { initData } = req.query;
  const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!tgUser) return res.status(401).json({ error: 'تایید هویت ناموفق' });

  const user = await User.findOne({ telegramId: String(tgUser.id) });
  if (!user) return res.status(404).json({ error: 'کاربر پیدا نشد' });

  const rate = Number(process.env.POINTS_TO_CRYPTO_RATE || 1000);

  const now = new Date();
  const last = user.lastCheckIn ? new Date(user.lastCheckIn) : null;
  const canCheckIn = !last || (now - last) >= 24 * 60 * 60 * 1000;

  res.json({
    points: user.points,
    estimatedCryptoValue: user.points / rate,
    rate,
    streak: user.streak,
    canCheckIn,
    spinChances: user.spinChances,
    totalCheckins: user.totalCheckins,
    firstName: user.firstName
  });
});

const SPIN_SEGMENTS = [2, 3, 5, 7, 10, 15, 25]; // مقادیر گردونه‌ی شانس

// POST /api/points/daily-checkin
router.post('/daily-checkin', async (req, res) => {
  const { initData } = req.body;
  const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!tgUser) return res.status(401).json({ error: 'تایید هویت ناموفق' });

  const user = await User.findOne({ telegramId: String(tgUser.id) });
  if (!user) return res.status(404).json({ error: 'کاربر پیدا نشد' });

  const now = new Date();
  const last = user.lastCheckIn ? new Date(user.lastCheckIn) : null;

  if (last && (now - last) < 24 * 60 * 60 * 1000) {
    return res.status(400).json({ error: 'امروز قبلا جایزه رو گرفتی، فردا دوباره سر بزن' });
  }

  const withinStreakWindow = last && (now - last) < 48 * 60 * 60 * 1000;
  user.streak = withinStreakWindow ? user.streak + 1 : 1;
  user.totalCheckins += 1;

  let earnedSpin = false;
  if (user.streak >= 7) {
    user.spinChances += 1;
    user.streak = 0;
    earnedSpin = true;
  }

  user.lastCheckIn = now;

  const DAILY_BASE = 2;
  user.points += DAILY_BASE;
  await user.save();

  res.json({
    success: true,
    points: user.points,
    streak: user.streak,
    bonus: DAILY_BASE,
    spinChances: user.spinChances,
    earnedSpin
  });
});

// POST /api/points/spin
router.post('/spin', async (req, res) => {
  const { initData } = req.body;
  const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!tgUser) return res.status(401).json({ error: 'تایید هویت ناموفق' });

  const user = await User.findOne({ telegramId: String(tgUser.id) });
  if (!user) return res.status(404).json({ error: 'کاربر پیدا نشد' });

  if (user.spinChances < 1) {
    return res.status(400).json({ error: 'چرخوندنی برات موجود نیست' });
  }

  const segmentIndex = Math.floor(Math.random() * SPIN_SEGMENTS.length);
  const won = SPIN_SEGMENTS[segmentIndex];

  user.points += won;
  user.spinChances -= 1;
  await user.save();

  res.json({
    success: true,
    points: user.points,
    won,
    segmentIndex,
    segments: SPIN_SEGMENTS,
    spinChances: user.spinChances
  });
});

// یه پیام به ادمین (یا کانال مشخص‌شده) درباره‌ی درخواست برداشت جدید می‌فرسته
async function notifyAdmin(text, withdrawalId) {
  const botToken = process.env.BOT_TOKEN;
  const chatId = process.env.ADMIN_CHAT_ID;
  if (!chatId) return null;

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ تایید', callback_data: `approve_${withdrawalId}` },
            { text: '❌ رد', callback_data: `reject_${withdrawalId}` }
          ]]
        }
      })
    });
    const data = await res.json();
    if (data.ok) {
      return { chatId: String(data.result.chat.id), messageId: data.result.message_id };
    }
    return null;
  } catch (err) {
    console.error('خطا در ارسال پیام به ادمین:', err.message);
    return null;
  }
}

// POST /api/points/withdraw
router.post('/withdraw', async (req, res) => {
  try {
    const { initData, pointsAmount, walletAddress } = req.body;
    const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
    if (!tgUser) return res.status(401).json({ error: 'تایید هویت ناموفق' });

    if (!walletAddress || !pointsAmount || pointsAmount <= 0) {
      return res.status(400).json({ error: 'اطلاعات ناقص است' });
    }

    const user = await User.findOne({ telegramId: String(tgUser.id) });
    if (!user || user.points < pointsAmount) {
      return res.status(400).json({ error: 'موجودی پوینت کافی نیست' });
    }

    user.points -= pointsAmount;
    await user.save();

    const withdrawal = await Withdrawal.create({
      userId: String(tgUser.id),
      pointsAmount,
      walletAddress,
      status: 'pending'
    });

    const username = user.username ? '@' + user.username : '(بدون یوزرنیم)';
    const message =
      `📤 <b>درخواست برداشت جدید</b>\n\n` +
      `👤 کاربر: ${user.firstName || ''} ${username}\n` +
      `🆔 آیدی عددی: <code>${user.telegramId}</code>\n` +
      `💎 مقدار پوینت: ${pointsAmount}\n` +
      `👛 آدرس کیف پول: <code>${walletAddress}</code>\n` +
      `🕒 زمان: ${new Date().toLocaleString('fa-IR')}`;

    const sent = await notifyAdmin(message, withdrawal._id);
    if (sent) {
      withdrawal.adminChatId = sent.chatId;
      withdrawal.adminMessageId = sent.messageId;
      await withdrawal.save();
    }

    res.json({ success: true, withdrawal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطای سرور' });
  }
});

module.exports = router;