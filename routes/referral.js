'use strict';
const express = require('express');
const router = express.Router();
const { requireTelegramAuth } = require('../utils/telegramAuth');
const User = require('../models/User');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

// GET /api/referral/me
router.get('/me', auth, async (req, res) => {
  const u = req.dbUser;
  const botUsername = process.env.BOT_USERNAME || '';
  const shortName = process.env.MINI_APP_SHORT_NAME || '';

  let shareLink = '';
  if (botUsername) {
    shareLink = shortName
      // اگر Mini App دارای short name باشد: لینک مستقیماً اپ را با کد رفرال باز می‌کند
      ? `https://t.me/${botUsername}/${shortName}?startapp=${u.referralCode}`
      // در غیر این‌صورت: لینک چت ربات را باز می‌کند و ربات دکمه‌ی «باز کردن اپ» می‌فرستد
      : `https://t.me/${botUsername}?start=${u.referralCode}`;
  }

  const invited = await User.find({ referredBy: u._id })
    .select('firstName username createdAt')
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({
    success: true,
    referralCode: u.referralCode,
    invitedCount: u.invitedCount,
    shareLink,
    botUsernameConfigured: Boolean(botUsername),
    invited
  });
});

module.exports = router;