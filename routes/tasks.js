'use strict';
const express = require('express');
const router = express.Router();
const { requireTelegramAuth } = require('../utils/telegramAuth');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

router.get('/', auth, async (req, res) => {
  const [tasks, completions] = await Promise.all([
    Task.find({ isActive: true }).sort({ createdAt: -1 }),
    TaskCompletion.find({ user: req.dbUser._id })
  ]);

  res.json({ success: true, tasks, completions });
});

router.post('/:id/claim', auth, async (req, res) => {
  const u = req.dbUser;
  const task = await Task.findById(req.params.id);

  if (!task || !task.isActive) {
    return res.status(404).json({ success: false, message: 'تسک پیدا نشد.' });
  }

  const existing = await TaskCompletion.findOne({ user: u._id, task: task._id });
  if (existing) {
    return res.status(400).json({ success: false, message: 'این تسک قبلاً انجام شده است.' });
  }

  const status = task.requiresReview ? 'pending' : 'approved';

  try {
    await TaskCompletion.create({ user: u._id, task: task._id, reward: task.reward, status });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'این تسک قبلاً انجام شده است.' });
    }
    throw error;
  }

  if (status === 'approved') {
    u.points += task.reward;
    await u.save();
  }

  res.json({
    success: true,
    message:
      status === 'approved'
        ? `${task.reward} پوینت به حساب شما اضافه شد.`
        : 'تسک ثبت شد و در انتظار بررسی است.',
    points: u.points,
    status
  });
});

module.exports = router;