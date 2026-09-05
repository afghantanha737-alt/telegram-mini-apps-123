'use strict';
const express = require('express');
const router = express.Router();
const { requireTelegramAuth } = require('../utils/telegramAuth');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

router.get('/me', auth, (req, res) => {
  const u = req.dbUser;
  res.json({
    success: true,
    telegramId: u.telegramId,
    firstName: u.firstName,
    lastName: u.lastName,
    username: u.username,
    photoUrl: u.photoUrl,
    points: u.points,
    referralCode: u.referralCode
  });
});

module.exports = router;