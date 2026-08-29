const express = require('express');
const router = express.Router();
const User = require('../models/User');
const verifyTelegramInitData = require('../utils/verifyTelegram');

// GET /api/leaderboard/top?initData=...
router.get('/top', async (req, res) => {
  const { initData } = req.query;
  const tgUser = verifyTelegramInitData(initData, process.env.BOT_TOKEN);
  if (!tgUser) return res.status(401).json({ error: 'تایید هویت ناموفق' });

  const topUsers = await User.find({ points: { $gt: 0 } })
    .sort({ points: -1 })
    .limit(10)
    .select('firstName username points telegramId');

  const me = await User.findOne({ telegramId: String(tgUser.id) });
  let myRank = null;
  if (me && me.points > 0) {
    myRank = (await User.countDocuments({ points: { $gt: me.points } })) + 1;
  }

  res.json({
    top: topUsers.map((u, i) => ({
      rank: i + 1,
      name: u.firstName || u.username || 'کاربر',
      points: u.points,
      isMe: u.telegramId === String(tgUser.id)
    })),
    myRank,
    myPoints: me ? me.points : 0
  });
});

module.exports = router;