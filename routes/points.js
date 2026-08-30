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
    firstName: user.firstName
  });
});

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
  user.lastCheckIn = now;

  const DAILY_BASE = 10;
  const bonus = DAILY_BASE + Math.min(user.streak - 1, 6) * 5;
  user.points += bonus;
  await user.save();

  res.json({ success: true, points: user.points, streak: user.streak, bonus });
});

// یه پیام به ادمین (یا کانال مشخص‌شده) درباره‌ی درخواست برداشت جدید می‌فرسته
async function notifyAdmin(text) {
  const botToken = process.env.BOT_TOKEN;
  const chatId = process.env.ADMIN_CHAT_ID;
  if (!chatId) return; // اگه تنظیم نشده بود، فقط رد شو

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' })
    });
  } catch (err) {
    console.error('خطا در ارسال پیام به ادمین:', err.message);
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
    await notifyAdmin(message);

    res.json({ success: true, withdrawal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطای سرور' });
  }
});

module.exports = router;