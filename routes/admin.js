'use strict';
const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const multer = require('multer');
const Task = require('../models/Task');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { bot } = require('../utils/bot');
const { applyPointsChange } = require('../utils/pointsLedger');
const { createRateLimiter, clientAddress } = require('../utils/rateLimit');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

function requireAdmin(req, res, next) {
  // تگ <img> نمی‌تواند هدر سفارشی بفرستد، پس برای مسیر نمایش تصویر
  // اجازه می‌دهیم کلید از query هم بیاید (؟key=...).
  const key = req.headers['x-admin-key'] || req.query.key;
  const expected = Buffer.from(String(process.env.ADMIN_KEY || ''));
  const received = Buffer.from(String(key || ''));
  if (
    !expected.length ||
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز.' });
  }
  next();
}

router.use(createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: req => `admin:${clientAddress(req)}`
}));
router.use(requireAdmin);

/**
 * POST /api/admin/verify-chat — قبل از ساختن تسک، بررسی می‌کند آیا
 * chatId وارد‌شده واقعاً معتبر است و ربات در آن ادمین هست یا نه.
 * جلوی دقیقاً همان مشکلی را می‌گیرد که باعث شد تسک‌ها بی‌صدا شکست بخورند
 * (chatId اشتباه که فقط موقع تلاش واقعی کاربر مشخص می‌شد).
 */
router.post('/verify-chat', async (req, res) => {
  const chatId = String((req.body && req.body.chatId) || '').trim();
  if (!chatId) {
    return res.status(400).json({ success: false, message: 'chatId خالی است.' });
  }
  if (!bot) {
    return res.status(500).json({ success: false, message: 'ربات پیکربندی نشده (BOT_TOKEN).' });
  }

  try {
    const chat = await bot.getChat(chatId);
    const me = await bot.getMe();

    let botIsAdmin = false;
    try {
      const member = await bot.getChatMember(chatId, me.id);
      botIsAdmin = ['administrator', 'creator'].includes(member.status);
    } catch {
      botIsAdmin = false;
    }

    const title = chat.title || chat.username || chatId;

    return res.json({
      success: true,
      botIsAdmin,
      message: botIsAdmin
        ? `✅ معتبر است — «${title}». ربات ادمین این چت است.`
        : `⚠️ چت پیدا شد («${title}») ولی ربات ادمین این چت نیست — اول ربات رو از تنظیمات کانال/گروه، ادمین کن.`
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: `❌ chatId نامعتبر است: ${error.message}`
    });
  }
});

/* -------------------- TASKS -------------------- */
router.get('/tasks', async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 });
  res.json({ success: true, tasks });
});

router.post('/tasks', async (req, res) => {
  const { title, description, type, url, reward, chatId, maxCompletions } = req.body || {};
  if (!title || !Number.isInteger(Number(reward)) || Number(reward) <= 0) {
    return res.status(400).json({ success: false, message: 'عنوان و مقدار پاداش الزامی است.' });
  }
  if (!chatId) {
    return res.status(400).json({ success: false, message: 'chatId (آیدی/یوزرنیم کانال یا گروه) الزامی است.' });
  }

  // اگر خالی/صفر/نامعتبر بود یعنی «بدون محدودیت ظرفیت»
  const parsedMax = Number(maxCompletions);
  const finalMaxCompletions = Number.isFinite(parsedMax) && parsedMax > 0 ? Math.floor(parsedMax) : null;

  const task = await Task.create({
    title, description, type, url, reward,
    verifyType: 'telegram',
    chatId,
    maxCompletions: finalMaxCompletions
  });
  res.json({ success: true, task });
});

router.put('/tasks/:id', async (req, res) => {
  const allowed = ['title', 'description', 'type', 'url', 'chatId', 'isActive', 'maxCompletions'];
  const update = {};
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) update[field] = req.body[field];
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'reward')) {
    if (!Number.isInteger(Number(req.body.reward)) || Number(req.body.reward) <= 0) {
      return res.status(400).json({ success: false, message: 'مقدار پاداش نامعتبر است.' });
    }
    update.reward = Number(req.body.reward);
  }
  const task = await Task.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!task) return res.status(404).json({ success: false, message: 'تسک پیدا نشد.' });
  res.json({ success: true, task });
});

router.delete('/tasks/:id', async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ success: true });
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
  const w = await Withdrawal.findOneAndUpdate(
    { _id: req.params.id, status: 'pending' },
    { status: 'approved', adminNote: (req.body && req.body.note) || '' },
    { new: true }
  );
  if (!w) return res.status(409).json({ success: false, message: 'برداشت پیدا نشد یا قبلاً پردازش شده است.' });
  res.json({ success: true, withdrawal: w });
});

router.post('/withdrawals/:id/reject', async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let withdrawal;
    await session.withTransaction(async () => {
      withdrawal = await Withdrawal.findOne({ _id: req.params.id, status: 'pending' }).session(session);
      if (!withdrawal) {
        const error = new Error('برداشت پیدا نشد یا قبلاً پردازش شده است.');
        error.statusCode = 409;
        throw error;
      }

      const user = await User.findByIdAndUpdate(
        withdrawal.user,
        { $inc: { gramBalance: withdrawal.cryptoAmount } },
        { new: true, session }
      );
      if (!user) {
        const error = new Error('کاربر برداشت پیدا نشد.');
        error.statusCode = 404;
        throw error;
      }

      withdrawal.status = 'rejected';
      withdrawal.adminNote = String((req.body && req.body.note) || '').slice(0, 500);
      await withdrawal.save({ session });

      await applyPointsChange({
        userId: user._id,
        delta: 0,
        type: 'withdrawal_audit',
        referenceType: 'withdrawal',
        referenceId: withdrawal._id,
        idempotencyKey: `withdrawal:${withdrawal.requestId || withdrawal._id}:rejected`,
        metadata: { status: 'rejected', gramReturned: withdrawal.cryptoAmount },
        session
      });
    });

    res.json({ success: true, withdrawal });
  } catch (error) {
    console.error('Reject withdrawal failed:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.statusCode ? 'WITHDRAWAL_STATE_ERROR' : 'SERVER_ERROR',
      message: error.statusCode ? error.message : 'رد برداشت انجام نشد.'
    });
  } finally {
    await session.endSession();
  }
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
  const body = req.body || {};
  const numericFields = ['rate', 'minWithdrawPoints', 'dailyCheckInPoints', 'streakBonusPoints'];
  for (const field of numericFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      const value = Number(body[field]);
      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({ success: false, message: `مقدار ${field} نامعتبر است.` });
      }
      settings[field] = value;
    }
  }
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
