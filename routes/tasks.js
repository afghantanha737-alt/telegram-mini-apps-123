'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { requireTelegramAuth } = require('../utils/telegramAuth');
const { bot, isChatMember } = require('../utils/bot');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 } // حداکثر 8 مگابایت
});

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || '';

// GET /api/tasks
router.get('/', auth, async (req, res) => {
  const [tasks, completions] = await Promise.all([
    Task.find({ isActive: true }).sort({ createdAt: -1 }),
    TaskCompletion.find({ user: req.dbUser._id })
  ]);

  res.json({ success: true, tasks, completions });
});

/**
 * POST /api/tasks/:id/claim
 * فقط برای تسک‌های verifyType=telegram — عضویت کاربر در کانال/گروه را
 * با API تلگرام بررسی می‌کند. اگر عضو باشد پاداش را می‌دهد.
 */
router.post('/:id/claim', auth, async (req, res) => {
  const u = req.dbUser;
  const task = await Task.findById(req.params.id);

  if (!task || !task.isActive) {
    return res.status(404).json({ success: false, message: 'تسک پیدا نشد.', code: 'TASK_NOT_FOUND' });
  }
  if (task.verifyType !== 'telegram') {
    return res.status(400).json({ success: false, message: 'این تسک نیاز به ارسال اسکرین‌شات دارد.', code: 'NEEDS_PROOF' });
  }

  const existing = await TaskCompletion.findOne({ user: u._id, task: task._id });
  if (existing && existing.status !== 'rejected') {
    return res.status(400).json({ success: false, message: 'این تسک قبلاً انجام شده است.', code: 'ALREADY_DONE' });
  }

  const joined = await isChatMember(task.chatId, u.telegramId);
  if (!joined) {
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
});

/**
 * POST /api/tasks/:id/submit-proof
 * فقط برای تسک‌های verifyType=manual — کاربر اسکرین‌شات آپلود می‌کند،
 * عکس برای بررسی به چت ادمین فرستاده می‌شود و وضعیت pending ثبت می‌شود.
 */
router.post('/:id/submit-proof', auth, upload.single('proof'), async (req, res) => {
  const u = req.dbUser;
  const task = await Task.findById(req.params.id);

  if (!task || !task.isActive) {
    return res.status(404).json({ success: false, message: 'تسک پیدا نشد.', code: 'TASK_NOT_FOUND' });
  }
  if (task.verifyType !== 'manual') {
    return res.status(400).json({ success: false, message: 'این تسک نیاز به اسکرین‌شات ندارد.', code: 'NO_PROOF_NEEDED' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'لطفاً یک تصویر انتخاب کنید.', code: 'NO_FILE' });
  }

  const existing = await TaskCompletion.findOne({ user: u._id, task: task._id });
  if (existing && (existing.status === 'approved' || existing.status === 'pending')) {
    return res.status(400).json({ success: false, message: 'این تسک قبلاً ثبت شده است.', code: 'ALREADY_DONE' });
  }

  // ابتدا رکورد را با وضعیت pending ذخیره می‌کنیم و فوراً به کاربر جواب می‌دهیم.
  // ارسال عکس به چت ادمین در پس‌زمینه انجام می‌شود تا کندی/بی‌جوابی تلگرام
  // باعث معطل ماندن کاربر (حالت «در حال ارسال...» بی‌پایان) نشود.
  let completion;
  if (existing) {
    existing.status = 'pending';
    existing.reward = task.reward;
    existing.adminNote = '';
    completion = await existing.save();
  } else {
    completion = await TaskCompletion.create({
      user: u._id,
      task: task._id,
      reward: task.reward,
      status: 'pending'
    });
  }

  res.json({
    success: true,
    message: 'اسکرین‌شات ثبت شد و در انتظار بررسی ادمین است.',
    status: 'pending'
  });

  // --- از این‌جا به بعد پاسخ کاربر قبلاً ارسال شده؛ فقط پس‌زمینه ---
  if (bot && ADMIN_CHAT_ID) {
    const caption =
      `📥 تسک جدید برای بررسی\n` +
      `تسک: ${task.title}\n` +
      `کاربر: ${u.firstName || u.username || u.telegramId} (${u.telegramId})\n` +
      `پاداش: ${task.reward} پوینت\n` +
      `شناسه تکمیل: ${completion._id}`;

    bot
      .sendPhoto(ADMIN_CHAT_ID, req.file.buffer, { caption }, { filename: 'proof.jpg', contentType: 'image/jpeg' })
      .then(async sent => {
        const photos = sent.photo || [];
        const proofFileId = photos.length > 0 ? photos[photos.length - 1].file_id : '';
        if (proofFileId) {
          await TaskCompletion.findByIdAndUpdate(completion._id, { proofFileId });
        }
      })
      .catch(error => {
        console.error('Failed to forward proof to admin chat:', error.message);
      });
  }
});

module.exports = router;