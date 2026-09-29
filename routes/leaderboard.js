'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { requireTelegramAuth } = require('../utils/telegramAuth');
const User = require('../models/User');
const PointsLedger = require('../models/PointsLedger');
const Settings = require('../models/Settings');
const { startOfUtcWeek, endOfUtcWeek, weekKey } = require('../utils/weeklyLeaderboard');

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

// GET /api/leaderboard/weekly — امتیازهای مثبت این هفته‌ی UTC؛ با شروع هفته خودکار صفر می‌شود.
router.get('/weekly', auth, async (req, res) => {
  const settings = await Settings.getGlobal();
  const start = startOfUtcWeek();
  const end = endOfUtcWeek();
  if (settings.weeklyLeaderboardEnabled === false) {
    return res.json({ success: true, enabled: false, weekKey: weekKey(), weekStart: start, weekEnd: end, prizes: [], top: [], myRank: null, myPoints: 0 });
  }
  const positiveTypes = ['task', 'checkin', 'spin', 'referral_bonus'];
  const rows = await PointsLedger.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end }, currency: 'points', amount: { $gt: 0 }, type: { $in: positiveTypes } } },
    { $group: { _id: '$user', points: { $sum: '$amount' } } },
    { $sort: { points: -1, _id: 1 } },
    { $limit: 50 },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $match: { 'user.isBanned': false } }
  ]);
  const myRow = rows.find(row => String(row._id) === String(req.dbUser._id));
  const above = await PointsLedger.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end }, currency: 'points', amount: { $gt: 0 }, type: { $in: positiveTypes } } },
    { $group: { _id: '$user', points: { $sum: '$amount' } } },
    { $match: { points: { $gt: myRow ? myRow.points : 0 } } },
    { $count: 'count' }
  ]);
  const top = rows.map((row, index) => ({
    firstName: row.user.firstName,
    username: row.user.username,
    photoUrl: row.user.photoUrl,
    points: row.points,
    rank: index + 1,
    prizePoints: Number(settings.weeklyLeaderboardPrizes?.[index] || 0),
    isMe: String(row._id) === String(req.dbUser._id)
  }));
  res.json({
    success: true,
    enabled: settings.weeklyLeaderboardEnabled !== false,
    weekKey: weekKey(),
    weekStart: start,
    weekEnd: end,
    prizes: (settings.weeklyLeaderboardPrizes || []).slice(0, 10),
    top,
    myRank: myRow ? (above[0]?.count || 0) + 1 : null,
    myPoints: myRow?.points || 0
  });
});

module.exports = router;
