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

  const rate = Number(process.env.POINTS_TO_CRYPTO_RATE || 1000); // هر چند پوینت = ۱ واحد کریپتو (فرضی)
  res.json({
    points: user.points,
    estimatedCryptoValue: user.points / rate,
    rate
  });
});

// POST /api/points/withdraw
// body: { initData, pointsAmount, walletAddress }
// نکته مهم: این فقط یک "درخواست" ثبت می‌کند. ارسال واقعی کریپتو باید توسط ادمین تایید و انجام شود
// (یا بعدا به یک درگاه پرداخت کریپتو مثل NOWPayments وصل شود)
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

    res.json({ success: true, withdrawal });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطای سرور' });
  }
});

module.exports = router;
