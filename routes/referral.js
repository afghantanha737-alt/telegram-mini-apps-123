'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { requireTelegramAuth } = require('../utils/telegramAuth');
const User = require('../models/User');
const TaskCompletion = require('../models/TaskCompletion');
const { recordLedgerRequired } = require('../utils/ledger');
const { withMongoTransaction } = require('../utils/mongoTransaction');
const { referralTaskId, buildReferralTaskProgress, REFERRAL_REWARD_TASKS } = require('../utils/referralRewards');

// احراز هویت تلگرام + بررسی عضویت فعلی در کانال‌های اجباری (روی هر درخواست محافظت‌شده)
const { withMembership } = require('../utils/membership');
const auth = withMembership(requireTelegramAuth(process.env.BOT_TOKEN));
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
      active: completedTasks >= 1,
      bonusAwarded: iu.referralBonusAwarded,
      tasksRemaining: iu.referralBonusAwarded ? 0 : Math.max(0, REFERRAL_MIN_TASKS - completedTasks)
    };
  });

  res.json({
    success: true,
    referralCode: u.referralCode,
    invitedCount: u.invitedCount,
    activeInvitedCount: u.activeInvitedCount,
    shareLink,
    botUsernameConfigured: Boolean(botUsername),
    referralMinTasks: REFERRAL_MIN_TASKS,
    referralBonusPoints: REFERRAL_BONUS_POINTS,
    referralTasks: buildReferralTaskProgress(u.activeInvitedCount, u.referralRewardClaims),
    invited
  });
});

// POST /api/referral/claim — دریافت اتمیک پاداش یکی از مراحل دعوت دوستان
router.post('/claim', auth, async (req, res) => {
  const taskId = referralTaskId(req.body && req.body.taskId);
  if (!taskId) {
    return res.status(400).json({ success: false, message: 'تسک ریفرال نامعتبر است.', code: 'INVALID_REFERRAL_TASK' });
  }

  const task = REFERRAL_REWARD_TASKS.find(item => item.id === taskId);
  let updated;
  try {
    updated = await withMongoTransaction(async session => {
      const result = await User.findOneAndUpdate(
        {
          _id: req.dbUser._id,
          activeInvitedCount: { $gte: task.requiredInvites },
          'referralRewardClaims.taskId': { $ne: taskId }
        },
        {
          $inc: { points: task.rewardPoints },
          $push: { referralRewardClaims: { taskId, claimedAt: new Date() } }
        },
        { new: true, runValidators: true, session }
      );
      if (!result) return null;
      await recordLedgerRequired({
        user: result._id,
        type: 'referral_bonus',
        amount: task.rewardPoints,
        description: `پاداش تسک دعوت ${task.requiredInvites} نفر`,
        balanceAfter: result.points,
        sourceId: `referral-task:${result._id}:${taskId}`,
        session
      });
      return result;
    });
  } catch (error) {
    throw error;
  }

  if (!updated) {
    const latest = await User.findById(req.dbUser._id).select('activeInvitedCount referralRewardClaims');
    if (!latest || latest.activeInvitedCount < task.requiredInvites) {
      return res.status(400).json({
        success: false,
        message: `${Math.max(0, task.requiredInvites - (latest?.activeInvitedCount || 0))} دعوت‌شده فعال دیگر لازم است.`,
        code: 'REFERRAL_TASK_LOCKED'
      });
    }
    return res.status(409).json({ success: false, message: 'این پاداش قبلاً دریافت شده است.', code: 'REFERRAL_TASK_ALREADY_CLAIMED' });
  }

  res.json({
    success: true,
    taskId,
    rewardPoints: task.rewardPoints,
    points: updated.points,
    invitedCount: updated.invitedCount,
    activeInvitedCount: updated.activeInvitedCount,
    referralTasks: buildReferralTaskProgress(updated.activeInvitedCount, updated.referralRewardClaims)
  });
});

module.exports = router;
