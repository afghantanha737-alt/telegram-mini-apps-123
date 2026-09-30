'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { requireTelegramAuth } = require('../utils/telegramAuth');
const { checkChatMembership, notifyUser } = require('../utils/bot');
const { botText } = require('../utils/botMessages');
const { recordLedgerRequired } = require('../utils/ledger');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { rewardCostUsd } = require('../utils/sponsor');
const { withMongoTransaction } = require('../utils/mongoTransaction');

// احراز هویت تلگرام + بررسی عضویت فعلی در کانال‌های اجباری (روی هر درخواست محافظت‌شده)
const { withMembership } = require('../utils/membership');
const auth = withMembership(requireTelegramAuth(process.env.BOT_TOKEN));

// حداقل تعداد تسک معتبری که کاربر دعوت‌شده باید تکمیل کند تا دعوت‌کننده‌اش پاداش بگیرد
const REFERRAL_MIN_TASKS = Number(process.env.REFERRAL_MIN_TASKS || 2);
const REFERRAL_BONUS_POINTS = Number(process.env.REFERRAL_BONUS_POINTS || 50);

/**
 * اگر کاربر دعوت‌شده به آستانه‌ی لازم رسیده باشد، دقیقاً یک‌بار به
 * دعوت‌کننده‌اش پاداش می‌دهد. با findOneAndUpdate و شرط
 * referralBonusAwarded:false این عملیات atomic است — یعنی حتی اگر دو
 * درخواست هم‌زمان بیایند (مثلاً از دو تب یا رفرش سریع)، فقط یکی از آن‌ها
 * موفق به آپدیت می‌شود و پاداش هرگز دوبار پرداخت نمی‌شود.
 */
async function maybeAwardReferralBonus(userId) {
  const result = await withMongoTransaction(async session => {
    const user = await User.findById(userId)
      .select('referredBy referralBonusAwarded firstName username referralRiskScore referralRiskBlocked')
      .session(session);
    if (!user || !user.referredBy) return null;

    const approvedCount = await TaskCompletion.countDocuments({ user: userId, status: 'approved' }).session(session);
    const referralRiskScore = Number(user.referralRiskScore || 0);
    if (approvedCount >= 1 && referralRiskScore < 50 && !user.referralRiskBlocked) {
      await User.findOneAndUpdate(
        { _id: user.referredBy, activeReferralIds: { $ne: user._id } },
        { $addToSet: { activeReferralIds: user._id }, $inc: { activeInvitedCount: 1 } },
        { session }
      );
    }

    if (referralRiskScore >= 50 || user.referralRiskBlocked || user.referralBonusAwarded || approvedCount < REFERRAL_MIN_TASKS) return null;

    const locked = await User.findOneAndUpdate(
      { _id: userId, referralBonusAwarded: false },
      { $set: { referralBonusAwarded: true } },
      { new: true, session }
    );
    if (!locked) return null;

    const referrer = await User.findByIdAndUpdate(
      user.referredBy,
      { $inc: { points: REFERRAL_BONUS_POINTS } },
      { new: true, session }
    );
    if (!referrer) throw new Error('دعوت‌کننده برای پرداخت پاداش پیدا نشد.');

    const invitedName = user.firstName || user.username || (referrer.language === 'en' ? 'your friend' : 'دوستت');
    await recordLedgerRequired({
      user: referrer._id,
      type: 'referral_bonus',
      amount: REFERRAL_BONUS_POINTS,
      description: `پاداش دعوت ${invitedName}`,
      balanceAfter: referrer.points,
      sourceId: `referral-bonus:${user._id}`,
      session
    });
    return { referrer, invitedName };
  });

  if (!result) return;
  const { referrer, invitedName } = result;

  // اطلاع‌رسانی فوری به دعوت‌کننده که پاداش ریفرالش آزاد شد — تا این لحظه
  // کاربر فقط تعداد دعوت‌شده‌ها را می‌دید، نه اینکه دقیقاً کِی پاداش می‌گیرد.
  notifyUser(
    referrer.telegramId,
    botText('referralBonus', referrer.language, invitedName, REFERRAL_BONUS_POINTS, referrer.points)
  ).catch(() => {});
}

// GET /api/tasks
router.get('/', auth, async (req, res) => {
  try {
    const [tasks, completions] = await Promise.all([
      // قیمت/بودجه‌ی تبلیغ‌دهنده هرگز به کاربر داده نمی‌شود؛ تسک‌های منقضی‌شده هم نمایش داده نمی‌شوند
      Task.find({ isActive: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
        .select('-sponsorPriceUsd -sponsorBudgetUsd')
        .sort({ isSpecialOfDay: -1, isSponsored: -1, createdAt: -1 }),
      TaskCompletion.find({ user: req.dbUser._id })
    ]);
    res.json({ success: true, tasks, completions });
  } catch (error) {
    console.error('GET /api/tasks failed:', error);
    res.status(500).json({ success: false, message: 'خطایی در بارگذاری تسک‌ها رخ داد.', code: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/tasks/:id/claim
 * عضویت کاربر در کانال/گروه تلگرامی را با API خود تلگرام بررسی می‌کند.
 * اگر عضو باشد، پاداش بلافاصله داده می‌شود؛ سپس بررسی می‌شود که آیا با
 * این تکمیل، شرط پاداش رفرال دعوت‌کننده‌اش (در صورت وجود) برآورده شده.
 *
 * توجه: کل بدنه در try/catch پیچیده شده — در Express 4، اگر یک خطای
 * غیرمنتظره داخل async handler رخ دهد و catch نشود، درخواست کاربر
 * بی‌پاسخ می‌ماند (نه یک خطای JSON مرتب) و در مرورگر شبیه "قطع شدن
 * ارتباط" دیده می‌شود. این تغییر تضمین می‌کند همیشه یک پاسخ JSON
 * برگردد، هرچه که خطا باشد.
 */
router.post('/:id/claim', auth, async (req, res) => {
  try {
    const u = req.dbUser;
    const task = await Task.findById(req.params.id);

    if (!task || !task.isActive) {
      return res.status(404).json({ success: false, message: 'تسک پیدا نشد.', code: 'TASK_NOT_FOUND' });
    }
    if (task.verifyType !== 'telegram') {
      return res.status(409).json({ success: false, message: 'این نوع تسک هنوز برای ارسال و بررسی Proof فعال نشده است.', code: 'MANUAL_TASK_DISABLED' });
    }

    const existing = await TaskCompletion.findOne({ user: u._id, task: task._id });
    if (existing && existing.status !== 'rejected') {
      return res.status(400).json({ success: false, message: 'این تسک قبلاً انجام شده است.', code: 'ALREADY_DONE' });
    }

    const result = await checkChatMembership(task.chatId, u.telegramId);

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
        message: 'هنوز عضویت شما تأیید نشد. ابتدا در کانال/گروه عضو شوید، سپس دوباره روی «بررسی» بزنید.',
        code: 'NOT_JOINED'
      });
    }

    const settings = await Settings.getGlobal();
    const payment = await withMongoTransaction(async session => {
      const currentTask = await Task.findById(task._id).session(session);
      if (!currentTask || !currentTask.isActive || (currentTask.expiresAt && currentTask.expiresAt <= new Date())) {
        const error = new Error('تسک پیدا نشد یا منقضی شده است.');
        error.code = 'TASK_FULL';
        throw error;
      }

      const currentCompletion = await TaskCompletion.findOne({ user: u._id, task: currentTask._id }).session(session);
      if (currentCompletion && currentCompletion.status !== 'rejected') {
        const error = new Error('این تسک قبلاً انجام شده است.');
        error.code = 'ALREADY_DONE';
        throw error;
      }

      const reserved = await Task.findOneAndUpdate(
        {
          _id: currentTask._id,
          isActive: true,
          $and: [
            { $or: [{ maxCompletions: null }, { $expr: { $lt: ['$completedCount', '$maxCompletions'] } }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }
          ]
        },
        { $inc: { completedCount: 1 } },
        { new: true, session }
      );
      if (!reserved) {
        const error = new Error('ظرفیت این تسک تکمیل شده یا غیرفعال شده است.');
        error.code = 'TASK_FULL';
        throw error;
      }

      const revenueUsd = currentTask.isSponsored ? Number(currentTask.sponsorPriceUsd) || 0 : 0;
      const costUsd = rewardCostUsd(currentTask.reward, settings.rate, settings.gramUsdPrice);
      if (currentCompletion) {
        await TaskCompletion.findOneAndUpdate(
          { _id: currentCompletion._id, status: 'rejected' },
          { $set: { status: 'approved', reward: currentTask.reward, revenueUsd, costUsd } },
          { new: true, session }
        );
      } else {
        await new TaskCompletion({ user: u._id, task: currentTask._id, reward: currentTask.reward, status: 'approved', revenueUsd, costUsd }).save({ session });
      }

      if (reserved.maxCompletions != null && reserved.completedCount >= reserved.maxCompletions) {
        await Task.updateOne({ _id: reserved._id }, { $set: { isActive: false } }, { session });
      }

      const rewarded = await User.findByIdAndUpdate(
        u._id,
        { $inc: { points: currentTask.reward } },
        { new: true, session }
      );
      if (!rewarded) throw new Error('کاربر برای ثبت پاداش پیدا نشد.');

      await recordLedgerRequired({
        user: u._id,
        type: 'task',
        amount: currentTask.reward,
        description: currentTask.title,
        balanceAfter: rewarded.points,
        sourceId: `task:${currentTask._id}:user:${u._id}`,
        session
      });
      return { points: rewarded.points, reward: currentTask.reward };
    });

    // بعد از ثبت موفق تسک، بررسی می‌کنیم آیا پاداش رفرال دعوت‌کننده
    // (در صورت وجود) باید همین حالا آزاد شود.
    maybeAwardReferralBonus(u._id).catch(error =>
      console.error('Referral bonus check failed:', error)
    );

    res.json({
      success: true,
      joined: true,
      message: `${payment.reward} پوینت به حساب شما اضافه شد.`,
      points: payment.points,
      status: 'approved'
    });
  } catch (error) {
    console.error(`POST /api/tasks/${req.params.id}/claim failed:`, error);
    if (error.code === 'ALREADY_DONE' || error.code === 'TASK_FULL') {
      return res.status(400).json({ success: false, message: error.message, code: error.code });
    }
    res.status(500).json({
      success: false,
      message: `خطای سرور: ${error.message}`,
      code: 'SERVER_ERROR'
    });
  }
});

module.exports = router;
