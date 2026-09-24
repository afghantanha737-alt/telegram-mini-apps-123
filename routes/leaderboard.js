'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { requireTelegramAuth } = require('../utils/telegramAuth');
const User = require('../models/User');

// احراز هویت تلگرام + بررسی عضویت فعلی در کانال‌های اجباری (روی هر درخواست محافظت‌شده)
const { withMembership } = require('../utils/membership');
const auth = withMembership(requireTelegramAuth(process.env.BOT_TOKEN));

// GET /api/leaderboard/top
router.get('/top', auth, async (req, res) => {
  const top = await User.find({ isBanned: false })
    .select('firstName username photoUrl points')
    .sort({ points: -1 })
    .limit(50);

  const rankAbove = await User.countDocuments({
    isBanned: false,
    points: { $gt: req.dbUser.points }
  });

  const myId = String(req.dbUser._id);
  const list = top.map(doc => ({
    firstName: doc.firstName,
    username: doc.username,
    photoUrl: doc.photoUrl,
    points: doc.points,
    isMe: String(doc._id) === myId // برای هایلایت «من»؛ شناسه‌ی دیتابیس را به کلاینت نمی‌دهیم
  }));

  res.json({ success: true, top: list, myRank: rankAbove + 1 });
});

module.exports = router;
