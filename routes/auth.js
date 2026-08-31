const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyTelegramInitData = require('../utils/verifyTelegram');

// POST /api/auth/enter
// body: { initData, startParam }  (startParam = آیدی عددی دعوت‌کننده، اگر وجود داشته باشد)
router.post('/enter', async (req, res) => {
  try {
    const { initData, startParam } = req.body;
    const botToken = process.env.BOT_TOKEN;

    const tgUser = verifyTelegramInitData(initData, botToken);
    if (!tgUser) {
      return res.status(401).json({ error: 'تایید هویت تلگرام ناموفق بود' });
    }

    let user = await User.findOne({ telegramId: String(tgUser.id) });

    if (!user) {
      user = await User.create({
        telegramId: String(tgUser.id),
        username: tgUser.username || '',
        firstName: tgUser.first_name || '',
        referralCode: String(tgUser.id), // کد رفرال همون آیدی عددی کاربره
        referredBy: startParam || null
      });

      // اگر کاربر با لینک رفرال آمده، به دعوت‌کننده پوینت بده
      if (startParam) {
        const inviter = await User.findOne({ referralCode: startParam });
        if (inviter) {
          const REFERRAL_BONUS = 20; // پوینت هدیه ازای هر دعوت - قابل تغییر
          inviter.points += REFERRAL_BONUS;
          await inviter.save();
        }
      }
    }

    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'خطای سرور' });
  }
});

module.exports = router;