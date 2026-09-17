'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { requireTelegramAuth } = require('../utils/telegramAuth');
const { checkChatMembership } = require('../utils/bot');
const { applyPointsChange, operationError } = require('../utils/pointsLedger');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const User = require('../models/User');
const PointsLedger = require('../models/PointsLedger');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);
const REFERRAL_MIN_TASKS = Math.max(1, Math.floor(Number(process.env.REFERRAL_MIN_TASKS || 2)));
const REFERRAL_BONUS_POINTS = Math.max(0, Math.floor(Number(process.env.REFERRAL_BONUS_POINTS || 50)));
const REFERRAL_MIN_ACCOUNT_AGE_HOURS = Math.max(
  0,
  Number(process.env.REFERRAL_MIN_ACCOUNT_AGE_HOURS || 0)
);
const REFERRAL_MAX_DAILY_BONUSES = Math.max(
  1,
  Math.floor(Number(process.env.REFERRAL_MAX_DAILY_BONUSES || 50))
);

function sendRouteError(res, error, fallback = 'خطای سرور رخ داد.') {
  console.error('Tasks route failed:', error);
  return res.status(error.statusCode || 500).json({
    success: false,
    code: error.code || 'SERVER_ERROR',
    message: error.statusCode ? error.message : fallback
  });
}

function utcDayStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The invited account must complete distinct verified tasks and remain old
 * enough before the inviter receives a ledger entry.
 */
async function maybeAwardReferralBonus(userId, session) {
  const user = await User.findById(userId)
    .select('referredBy referralBonusAwarded referralRiskFlags createdAt isBanned')
    .session(session);
  if (!user || user.isBanned || !user.referredBy || user.referralBonusAwarded) return;

  const accountAgeMs = Date.now() - new Date(user.createdAt).getTime();
  if (accountAgeMs < REFERRAL_MIN_ACCOUNT_AGE_HOURS * 60 * 60 * 1000) return;
  if (user.referralRiskFlags?.includes('same_signup_ip')) return;

  const approvedCount = await TaskCompletion.countDocuments({
    user: userId,
    status: 'approved'
  }).session(session);
  if (approvedCount < REFERRAL_MIN_TASKS) return;

  const referrer = await User.findById(user.referredBy)
    .select('telegramId isBanned')
    .session(session);
  if (!referrer || referrer.isBanned) return;

  const dailyBonusCount = await PointsLedger.countDocuments({
    user: referrer._id,
    type: 'referral_bonus',
    createdAt: { $gte: utcDayStart() }
  }).session(session);
  if (dailyBonusCount >= REFERRAL_MAX_DAILY_BONUSES) return;

  const locked = await User.findOneAndUpdate(
    { _id: userId, referralBonusAwarded: false },
    { $set: { referralBonusAwarded: true, referralBonusAwardedAt: new Date() } },
    { new: true, session }
  );
  if (!locked) return;

  await applyPointsChange({
    userId: referrer._id,
    delta: REFERRAL_BONUS_POINTS,
    type: 'referral_bonus',
    referenceType: 'referred_user',
    referenceId: userId,
    idempotencyKey: `referral:${userId}`,
    description: 'Referral reward',
    metadata: { approvedTasks: approvedCount },
    session
  });
}

router.get('/', auth, async (req, res) => {
  try {
    const [tasks, completions] = await Promise.all([
      Task.find({ isActive: true }).sort({ createdAt: -1 }),
      TaskCompletion.find({ user: req.dbUser._id })
    ]);
    res.json({ success: true, tasks, completions });
  } catch (error) {
    sendRouteError(res, error, 'خطایی در بارگذاری تسک‌ها رخ داد.');
  }
});

router.post('/:id/claim', auth, async (req, res) => {
  try {
    const taskForCheck = await Task.findById(req.params.id).select('chatId verifyType isActive');
    if (!taskForCheck || !taskForCheck.isActive) {
      return res.status(404).json({ success: false, message: 'تسک پیدا نشد.', code: 'TASK_NOT_FOUND' });
    }

    if (taskForCheck.verifyType === 'telegram') {
      const result = await checkChatMembership(taskForCheck.chatId, req.dbUser.telegramId);
      if (result.configError) {
        return res.status(400).json({
          success: false,
          joined: false,
          message: `⚠️ ${result.configError}`,
          code: 'VERIFY_CONFIG_ERROR'
        });
      }
      if (!result.joined) {
        return res.status(400).json({
          success: false,
          joined: false,
          message: 'هنوز عضویت شما تأیید نشد. ابتدا در کانال/گروه عضو شوید، سپس دوباره بررسی کنید.',
          code: 'NOT_JOINED'
        });
      }
    }

    const session = await mongoose.startSession();
    try {
      let response;
      await session.withTransaction(async () => {
        const u = await User.findById(req.dbUser._id).session(session);
        const task = await Task.findById(req.params.id).session(session);
        if (!u || u.isBanned) throw operationError('USER_NOT_FOUND', 'کاربر پیدا نشد.');
        if (!task || !task.isActive) throw operationError('TASK_NOT_FOUND', 'تسک پیدا نشد.');
        if (!Number.isInteger(task.reward) || task.reward <= 0) {
          throw operationError('INVALID_TASK_REWARD', 'پاداش این تسک معتبر نیست.');
        }

        const existing = await TaskCompletion.findOne({ user: u._id, task: task._id }).session(session);
        if (existing && existing.status !== 'rejected') {
          throw operationError('ALREADY_DONE', 'این تسک قبلاً انجام شده است.');
        }

        const reserved = await Task.findOneAndUpdate(
          {
            _id: task._id,
            isActive: true,
            $or: [
              { maxCompletions: null },
              { $expr: { $lt: ['$completedCount', '$maxCompletions'] } }
            ]
          },
          { $inc: { completedCount: 1 } },
          { new: true, session }
        );
        if (!reserved) throw operationError('TASK_FULL', 'ظرفیت این تسک تکمیل شده یا غیرفعال شده است.');

        if (reserved.maxCompletions != null && reserved.completedCount >= reserved.maxCompletions) {
          await Task.updateOne({ _id: reserved._id }, { $set: { isActive: false } }, { session });
        }

        let completion;
        if (existing) {
          existing.status = 'approved';
          existing.reward = task.reward;
          await existing.save({ session });
          completion = existing;
        } else {
          [completion] = await TaskCompletion.create([{
            user: u._id,
            task: task._id,
            reward: task.reward,
            status: 'approved'
          }], { session });
        }

        const updated = await applyPointsChange({
          userId: u._id,
          delta: task.reward,
          type: 'task_reward',
          referenceType: 'task_completion',
          referenceId: completion._id,
          idempotencyKey: `task:${u._id}:${task._id}`,
          description: 'Task reward',
          metadata: { taskId: task._id, taskTitle: task.title },
          session
        });

        await maybeAwardReferralBonus(u._id, session);
        response = {
          success: true,
          joined: true,
          message: `${task.reward} پوینت به حساب شما اضافه شد.`,
          points: updated.user.points,
          status: 'approved'
        };
      });
      return res.json(response);
    } finally {
      await session.endSession();
    }
  } catch (error) {
    return sendRouteError(res, error, 'تکمیل تسک انجام نشد.');
  }
});

module.exports = router;
