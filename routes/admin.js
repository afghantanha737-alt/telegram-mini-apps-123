'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { bot } = require('../utils/bot');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

function requireAdmin(req, res, next) {
  // تگ <img> نمی‌تواند هدر سفارشی بفرستد، پس برای مسیر نمایش تصویر
  // اجازه می‌دهیم کلید از query هم بیاید (؟key=...).
  const key = req.headers['x-admin-key'] || req.query.key;
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز.' });
  }
  next();
}

router.use(requireAdmin);

/* -------------------- TASKS -------------------- */
router.get('/tasks', async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 });
  res.json({ success: true, tasks });
});

router.post('/tasks', async (req, res) => {
  const { title, description, type, url, reward, verifyType, chatId } = req.body || {};
  if (!title || !reward) {
    return res.status(400).json({ success: false, message: 'عنوان و مقدار پاداش الزامی است.' });
  }
  if (verifyType === 'telegram' && !chatId) {
    return res.status(400).json({ success: false, message: 'برای تسک تلگرامی، chatId (آیدی/یوزرنیم کانال یا گروه) الزامی است.' });
  }
  const task = await Task.create({ title, description, type, url, reward, verifyType, chatId });
  res.json({ success: true, task });
});

router.put('/tasks/:id', async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!task) return res.status(404).json({ success: false, message: 'تسک پیدا نشد.' });
  res.json({ success: true, task });
});

router.delete('/tasks/:id', async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

/* -------------------- TASK COMPLETIONS (بررسی اسکرین‌شات) -------------------- */
router.get('/task-completions', async (req, res) => {
  const status = req.query.status || 'pending';
  const filter = status === 'all' ? {} : { status };
  const list = await TaskCompletion.find(filter)
    .populate('user', 'firstName username telegramId')
    .populate('task', 'title reward')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ success: true, completions: list });
});

router.post('/task-completions/:id/approve', async (req, res) => {
  const completion = await TaskCompletion.findById(req.params.id);
  if (!completion) return res.status(404).json({ success: false, message: 'رکورد پیدا نشد.' });

  if (completion.status !== 'approved') {
    completion.status = 'approved';
    completion.adminNote = (req.body && req.body.note) || '';
    await completion.save();
    await User.findByIdAndUpdate(completion.user, { $inc: { points: completion.reward } });
  }

  res.json({ success: true, completion });
});

router.post('/task-completions/:id/reject', async (req, res) => {
  const completion = await TaskCompletion.findById(req.params.id);
  if (!completion) return res.status(404).json({ success: false, message: 'رکورد پیدا نشد.' });

  completion.status = 'rejected';
  completion.adminNote = (req.body && req.body.note) || '';
  await completion.save();

  res.json({ success: true, completion });
});

router.get('/task-completions/:id/proof', async (req, res) => {
  const completion = await TaskCompletion.findById(req.params.id);
  if (!completion || !completion.proofFileId) {
    return res.status(404).json({ success: false, message: 'تصویری ثبت نشده.' });
  }
  if (!bot) return res.status(500).json({ success: false, message: 'ربات پیکربندی نشده.' });

  try {
    const link = await bot.getFileLink(completion.proofFileId);
    return res.redirect(link);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت تصویر ناموفق بود.' });
  }
});

/* -------------------- WITHDRAWALS -------------------- */
router.get('/withdrawals', async (req, res) => {
  const status = req.query.status;
  const filter = status ? { status } : {};
  const list = await Withdrawal.find(filter)
    .populate('user', 'firstName username telegramId')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ success: true, withdrawals: list });
});

router.post('/withdrawals/:id/approve', async (req, res) => {
  const w = await Withdrawal.findByIdAndUpdate(
    req.params.id,
    { status: 'approved', adminNote: (req.body && req.body.note) || '' },
    { new: true }
  );
  if (!w) return res.status(404).json({ success: false, message: 'رکورد پیدا نشد.' });
  res.json({ success: true, withdrawal: w });
});

router.post('/withdrawals/:id/reject', async (req, res) => {
  const withdrawal = await Withdrawal.findById(req.params.id);
  if (!withdrawal) return res.status(404).json({ success: false, message: 'رکورد پیدا نشد.' });

  if (withdrawal.status === 'pending') {
    await User.findByIdAndUpdate(withdrawal.user, { $inc: { points: withdrawal.pointsSpent } });
  }

  withdrawal.status = 'rejected';
  withdrawal.adminNote = (req.body && req.body.note) || '';
  await withdrawal.save();

  res.json({ success: true, withdrawal });
});

/* -------------------- USERS -------------------- */
router.get('/users', async (req, res) => {
  const users = await User.find().select('-__v').sort({ createdAt: -1 }).limit(200);
  res.json({ success: true, users });
});

router.post('/users/:id/ban', async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isBanned: true }, { new: true });
  res.json({ success: true, user });
});

router.post('/users/:id/unban', async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isBanned: false }, { new: true });
  res.json({ success: true, user });
});

/* -------------------- SETTINGS -------------------- */
router.get('/settings', async (req, res) => {
  const settings = await Settings.getGlobal();
  res.json({ success: true, settings });
});

router.put('/settings', async (req, res) => {
  const settings = await Settings.getGlobal();
  Object.assign(settings, req.body || {});
  await settings.save();
  res.json({ success: true, settings });
});

/* -------------------- BROADCAST (پیام همگانی) -------------------- */
router.post('/broadcast', upload.single('image'), async (req, res) => {
  if (!bot) {
    return res.status(500).json({ success: false, message: 'ربات پیکربندی نشده.' });
  }
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) {
    return res.status(400).json({ success: false, message: 'متن پیام الزامی است.' });
  }

  const users = await User.find({ isBanned: false }, 'telegramId');
  let sent = 0;
  let failed = 0;

  // برای جلوگیری از برخورد با محدودیت نرخ تلگرام (~۳۰ پیام در ثانیه)،
  // ارسال را به‌صورت دسته‌ای و با تأخیر کوتاه انجام می‌دهیم.
  const BATCH_SIZE = 20;
  const DELAY_MS = 1100;

  res.json({
    success: true,
    message: `ارسال برای ${users.length} کاربر آغاز شد. این کار در پس‌زمینه ادامه می‌یابد.`,
    totalRecipients: users.length
  });

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async user => {
        try {
          if (req.file) {
            await bot.sendPhoto(user.telegramId, req.file.buffer, { caption: text });
          } else {
            await bot.sendMessage(user.telegramId, text);
          }
          sent += 1;
        } catch (error) {
          failed += 1;
        }
      })
    );
    if (i + BATCH_SIZE < users.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  console.log(`📣 Broadcast finished: sent=${sent} failed=${failed} total=${users.length}`);
});

module.exports = router;