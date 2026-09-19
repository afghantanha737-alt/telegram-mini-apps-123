const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyTelegramInitData = require('../utils/verifyTelegram');

// GET /api/referral/me?initData=...
router.get('/me', async (req, res) => {
  const { initData } = req.query;
  const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!tgUser) return res.status(401).json({ error: 'تایید هویت ناموفق' });

  const user = await User.findOne({ telegramId: String(tgUser.id) });
  if (!user) return res.status(404).json({ error: 'کاربر پیدا نشد' });

  const invitedCount = await User.countDocuments({ referredBy: user.referralCode });

  res.json({
    referralCode: user.referralCode,
    invitedCount
  });
});

module.exports = router;
