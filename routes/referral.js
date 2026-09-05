'use strict';
const express = require('express');
const router = express.Router();
const { requireTelegramAuth } = require('../utils/telegramAuth');
const User = require('../models/User');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

router.get('/me', auth, async (req, res) => {
  const u = req.dbUser;
  const botUsername = process.env.BOT_USERNAME || '';

  const invited = await User.find({ referredBy: u._id })
    .select('firstName username createdAt')
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({
    success: true,
    referralCode: u.referralCode,
    invitedCount: u.invitedCount,
    shareLink: botUsername ? `https://t.me/${botUsername}?start=${u.referralCode}` : '',
    invited
  });
});

module.exports = router;