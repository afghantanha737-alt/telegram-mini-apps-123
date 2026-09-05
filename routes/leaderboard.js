'use strict';
const express = require('express');
const router = express.Router();
const { requireTelegramAuth } = require('../utils/telegramAuth');
const User = require('../models/User');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

router.get('/top', auth, async (req, res) => {
  const top = await User.find({ isBanned: false })
    .select('firstName username photoUrl points')
    .sort({ points: -1 })
    .limit(50);

  const rankAbove = await User.countDocuments({
    isBanned: false,
    points: { $gt: req.dbUser.points }
  });

  res.json({ success: true, top, myRank: rankAbove + 1 });
});

module.exports = router;