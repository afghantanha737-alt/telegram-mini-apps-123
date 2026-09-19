'use strict';
const express = require('express');
const router = express.Router();
const { requireTelegramAuth } = require('../utils/telegramAuth');
const { checkChatMembership } = require('../utils/bot');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

// GET /api/tasks
router.get('/', auth, async (req, res) => {
  try {
    const [tasks, completions] = await Promise.all([
      Task.find({ isActive: true }).sort({ createdAt: -1 }),
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
 * اگر عضو باشد، پاداش بلافاصله داده می‌شود.
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

    if (existing) {
      existing.status = 'approved';
      existing.reward = task.reward;
      await existing.save();
    } else {
      await TaskCompletion.create({ user: u._id, task: task._id, reward: task.reward, status: 'approved' });
    }

    u.points += task.reward;
    await u.save();

    res.json({
      success: true,
      joined: true,
      message: `${task.reward} پوینت به حساب شما اضافه شد.`,
      points: u.points,
      status: 'approved'
    });
  } catch (error) {
    console.error(`POST /api/tasks/${req.params.id}/claim failed:`, error);
    res.status(500).json({
      success: false,
      message: `خطای سرور: ${error.message}`,
      code: 'SERVER_ERROR'
    });
  }
});

module.exports = router;