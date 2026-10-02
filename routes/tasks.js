'use strict';
const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { requireTelegramAuth } = require('../utils/telegramAuth');
const { checkChatMembership } = require('../utils/bot');
const { recordLedgerRequired } = require('../utils/ledger');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { rewardCostUsd } = require('../utils/sponsor');
const { withMongoTransaction } = require('../utils/mongoTransaction');
const { evaluateReferralEligibility, REFERRAL_MIN_TASKS, REFERRAL_MIN_ACTIVE_DAYS, REFERRAL_WAIT_DAYS } = require('../utils/referralEligibility');
const { SCREENSHOT_MIME_TYPES, isValidScreenshot } = require('../utils/screenshotValidation');

// احراز هویت تلگرام + بررسی عضویت فعلی در کانال‌های اجباری (روی هر درخواست محافظت‌شده)
const { withMembership } = require('../utils/membership');
const auth = withMembership(requireTelegramAuth(process.env.BOT_TOKEN));
const screenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  fileFilter(req, file, callback) {
    if (!SCREENSHOT_MIME_TYPES.includes(file.mimetype)) {
      return callback(new Error('فقط تصویر JPEG، PNG یا WebP قابل ارسال است.'));
    }
    callback(null, true);
  }
});

function parseScreenshot(req, res, next) {
  screenshotUpload.single('screenshot')(req, res, error => {
    if (error) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';
      return res.status(400).json({
        success: false,
        message: tooLarge ? 'حجم تصویر باید حداکثر ۵ مگابایت باشد.' : (error.message || 'تصویر ارسالی نامعتبر است.'),
        code: tooLarge ? 'SCREENSHOT_TOO_LARGE' : 'INVALID_SCREENSHOT'
      });
    }
    next();
  });
}

/**
 * Eligibility قدیمی برای تبدیل/برداشت و شمارنده‌ی دعوت فعال را به‌روز می‌کند؛
 * پاداش ثابت ۵۰ پوینتی در سیستم جدید غیرفعال شده و پرداخت اولیه هنگام اتصال Referral است.
 */
async function maybeAwardReferralBonus(userId) {
  const result = await withMongoTransaction(async session => {
    const user = await User.findById(userId)
      .select('referredBy referralBonusAwarded firstName username referralRiskScore referralRiskBlocked createdAt referralEligibilityStatus')
      .session(session);
    if (!user || !user.referredBy) return null;

    const completions = await TaskCompletion.find({ user: userId, status: 'approved' }).select('createdAt status').session(session).lean();
    const eligibility = evaluateReferralEligibility(user, completions);
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          referralEligibilityStatus: eligibility.status,
          referralEligibilityReasons: eligibility.reasons,
          referralEligibleAt: eligibility.eligible ? eligibility.eligibleAt : null
        }
      },
      { session }
    );

    if (eligibility.eligible) {
      await User.findOneAndUpdate(
        { _id: user.referredBy, activeReferralIds: { $ne: user._id } },
        { $addToSet: { activeReferralIds: user._id }, $inc: { activeInvitedCount: 1 } },
        { session }
      );
    } else {
      await User.findOneAndUpdate(
        { _id: user.referredBy, activeReferralIds: user._id, activeInvitedCount: { $gt: 0 } },
        { $pull: { activeReferralIds: user._id }, $inc: { activeInvitedCount: -1 } },
        { session }
      );
    }

    return null;
  });
}

// GET /api/tasks
router.get('/', auth, async (req, res) => {
  try {
    const completions = await TaskCompletion.find({ user: req.dbUser._id });
    const pendingScreenshotTaskIds = completions
      .filter(item => item.status === 'pending' && ['image/jpeg', 'image/png', 'image/webp'].includes(item.proofMimeType))
      .map(item => item.task);
    // قیمت/بودجه‌ی تبلیغ‌دهنده هرگز به کاربر داده نمی‌شود. تسک‌های عادیِ منقضی/غیرفعال پنهان‌اند؛
    // فقط تسکی که همین کاربر برایش screenshot pending دارد نمایش داده می‌شود تا وضعیت بررسی را ببیند.
    const tasks = await Task.find({
      $or: [
        { isActive: true, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
        ...(pendingScreenshotTaskIds.length ? [{ _id: { $in: pendingScreenshotTaskIds } }] : [])
      ]
    })
      .select('-sponsorPriceUsd -sponsorBudgetUsd')
      .sort({ isSpecialOfDay: -1, isSponsored: -1, createdAt: -1 });
    res.json({ success: true, tasks, completions });
  } catch (error) {
    console.error('GET /api/tasks failed:', error);
    res.status(500).json({ success: false, message: 'خطایی در بارگذاری تسک‌ها رخ داد.', code: 'SERVER_ERROR' });
  }
});

/** POST /api/tasks/:id/submission — screenshot proof for generic manual-verification tasks. */
router.post('/:id/submission', auth, parseScreenshot, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ success: false, message: 'تسک پیدا نشد.', code: 'TASK_NOT_FOUND' });
    }
    if (!req.file || !isValidScreenshot(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'فایل انتخاب‌شده تصویر معتبر نیست.', code: 'INVALID_SCREENSHOT' });
    }

    const task = await Task.findById(req.params.id);
    if (!task || task.verifyType !== 'manual') {
      return res.status(404).json({ success: false, message: 'تسک Screenshot Verification پیدا نشد.', code: 'TASK_NOT_FOUND' });
    }
    if (!task.isActive || (task.expiresAt && task.expiresAt <= new Date())) {
      return res.status(409).json({ success: false, message: 'این تسک دیگر فعال نیست.', code: 'TASK_INACTIVE' });
    }
    if (task.maxCompletions != null && task.completedCount >= task.maxCompletions) {
      return res.status(409).json({ success: false, message: 'ظرفیت این تسک تکمیل شده است.', code: 'TASK_FULL' });
    }

    const now = new Date();
    const existing = await TaskCompletion.findOne({ user: req.dbUser._id, task: task._id });
    if (existing && existing.status !== 'rejected') {
      return res.status(409).json({
        success: false,
        message: existing.status === 'pending' ? 'اسکرین‌شات شما در انتظار بررسی است.' : 'این تسک قبلاً تکمیل شده است.',
        code: existing.status === 'pending' ? 'SUBMISSION_PENDING' : 'ALREADY_DONE'
      });
    }

    try {
      if (existing) {
        const resubmission = await TaskCompletion.findOneAndUpdate(
          { _id: existing._id, status: 'rejected' },
          {
            $set: {
              status: 'pending',
              reward: task.reward,
              proofImage: req.file.buffer,
              proofMimeType: req.file.mimetype,
              submittedAt: now,
              reviewedAt: null,
              reviewedBy: '',
              adminNote: ''
            }
          },
          { new: true, runValidators: true }
        );
        if (!resubmission) {
          return res.status(409).json({ success: false, message: 'درخواست قبلی هم‌زمان تغییر کرده است؛ صفحه را تازه کنید.', code: 'SUBMISSION_CONFLICT' });
        }
      } else {
        await new TaskCompletion({
          user: req.dbUser._id,
          task: task._id,
          reward: task.reward,
          status: 'pending',
          proofImage: req.file.buffer,
          proofMimeType: req.file.mimetype,
          submittedAt: now
        }).save();
      }
    } catch (error) {
      if (error?.code === 11000) {
        return res.status(409).json({ success: false, message: 'برای این تسک قبلاً submission ثبت شده است.', code: 'SUBMISSION_DUPLICATE' });
      }
      throw error;
    }

    return res.status(201).json({
      success: true,
      status: 'pending',
      message: 'اسکرین‌شات ارسال شد و در انتظار بررسی ادمین است.'
    });
  } catch (error) {
    console.error(`POST /api/tasks/${req.params.id}/submission failed:`, error);
    return res.status(500).json({ success: false, message: 'ارسال اسکرین‌شات انجام نشد.', code: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/tasks/:id/claim
 * عضویت کاربر در کانال/گروه تلگرامی را با API خود تلگرام بررسی می‌کند.
 * اگر عضو باشد، پاداش اصلی بلافاصله داده می‌شود و کمیسیون‌های Referral در
 * همان Mongo transaction ثبت می‌شوند؛ سپس Eligibility قدیمی برداشت به‌روز می‌شود.
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
