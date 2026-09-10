'use strict';
const express = require('express');
const router = express.Router();
const { requireTelegramAuth } = require('../utils/telegramAuth');
const User = require('../models/User');
const TaskCompletion = require('../models/TaskCompletion');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);
const REFERRAL_MIN_TASKS = Number(process.env.REFERRAL_MIN_TASKS || 2);
const REFERRAL_BONUS_POINTS = Number(process.env.REFERRAL_BONUS_POINTS || 50);

// GET /api/referral/me — کد رفرال، لینک اشتراک‌گذاری، و لیست «تیم» با وضعیت پاداش هرکدام
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

  const invitedUsers = await User.find({ referredBy: u._id })
    .select('telegramId firstName username createdAt referralBonusAwarded')
    .sort({ createdAt: -1 })
    .limit(100);

  // تعداد تسک تکمیل‌شده‌ی هر عضو تیم را یک‌جا (با aggregate) می‌گیریم
  // تا به‌جای N کوئری جدا، فقط یک کوئری اضافه بزنیم.
  const invitedIds = invitedUsers.map(iu => iu._id);
  const taskCounts = await TaskCompletion.aggregate([
    { $match: { user: { $in: invitedIds }, status: 'approved' } },
    { $group: { _id: '$user', count: { $sum: 1 } } }
  ]);
  const countMap = new Map(taskCounts.map(tc => [String(tc._id), tc.count]));

  const invited = invitedUsers.map(iu => {
    const completedTasks = countMap.get(String(iu._id)) || 0;
    return {
      telegramId: iu.telegramId,
      firstName: iu.firstName,
      username: iu.username,
      createdAt: iu.createdAt,
      completedTasks,
      bonusAwarded: iu.referralBonusAwarded,
      tasksRemaining: iu.referralBonusAwarded ? 0 : Math.max(0, REFERRAL_MIN_TASKS - completedTasks)
    };
  });

  res.json({
    success: true,
    referralCode: u.referralCode,
    invitedCount: u.invitedCount,
    shareLink,
    botUsernameConfigured: Boolean(botUsername),
    referralMinTasks: REFERRAL_MIN_TASKS,
    referralBonusPoints: REFERRAL_BONUS_POINTS,
    invited
  });
});

module.exports = router;