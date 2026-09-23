'use strict';
const express = require('express');
const router = express.Router();
const multer = require('multer');
const Task = require('../models/Task');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { bot, notifyUser, broadcastToActiveUsers } = require('../utils/bot');
const { verifyTonTransaction } = require('../utils/tonVerify');
const { recordLedger } = require('../utils/ledger');
const { recordAdminLog } = require('../utils/adminLog');
const AdminLog = require('../models/AdminLog');
const TaskCompletion = require('../models/TaskCompletion');
const PointsLedger = require('../models/PointsLedger');

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
  // نامی که ادمین موقع ورود تایپ کرده (اختیاری) — فقط برای لاگ فعالیت، نه احراز هویت واقعی
  req.adminActor = String(req.headers['x-admin-name'] || '').trim() || 'ادمین';
  next();
}

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
/**
 * GET /api/admin/tasks?search=...&type=...&status=active|inactive
 * جستجو روی عنوان/توضیحات، فیلتر روی نوع و وضعیت فعال/غیرفعال.
 */
router.get('/tasks', async (req, res) => {
  const { search, type, status } = req.query;
  const filter = {};

  if (search) {
    const regex = new RegExp(String(search).trim(), 'i');
    filter.$or = [{ title: regex }, { description: regex }, { chatId: regex }];
  }
  if (type) filter.type = type;
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  const tasks = await Task.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, tasks });
});

router.post('/tasks', async (req, res) => {
  const { title, description, type, url, reward, chatId, maxCompletions } = req.body || {};
  if (!title || !reward) {
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

  recordAdminLog({
    actor: req.adminActor,
    action: 'task_create',
    targetType: 'task',
    targetId: task._id,
    details: `«${title}» — پاداش ${reward} پوینت`
  });

  // اطلاع‌رسانی تسک جدید به همه‌ی کاربران فعال؛ عمداً بدون await تا پاسخ به پنل ادمین معطل نماند
  broadcastToActiveUsers(User, `🎯 تسک جدید اضافه شد!\n\n${title}\nپاداش: ${reward} پوینت\n\nهمین حالا از تب «تسک‌ها» انجامش بده.`)
    .catch(error => console.warn('Task broadcast failed:', error.message || error));
});

router.put('/tasks/:id', async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!task) return res.status(404).json({ success: false, message: 'تسک پیدا نشد.' });
  res.json({ success: true, task });

  recordAdminLog({
    actor: req.adminActor,
    action: 'task_update',
    targetType: 'task',
    targetId: task._id,
    details: `«${task.title}» ویرایش شد`
  });
});

router.delete('/tasks/:id', async (req, res) => {
  const task = await Task.findByIdAndDelete(req.params.id);
  res.json({ success: true });

  recordAdminLog({
    actor: req.adminActor,
    action: 'task_delete',
    targetType: 'task',
    targetId: req.params.id,
    details: task ? `«${task.title}» حذف شد (پاداش بود: ${task.reward} پوینت، chatId: ${task.chatId || '—'})` : 'تسک (که قبلاً هم پیدا نشد) حذف شد'
  });
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

/**
 * POST /api/admin/withdrawals/:id/approve
 * تأیید یک درخواست برداشت به‌شرط ورود Transaction Hash و بررسی موفق آن روی زنجیره.
 * body: { txHash, note?, forceManualConfirm? }
 * forceManualConfirm فقط وقتی لازم است که توکن Jetton باشد (مثل GRAM) — چون مبلغ/مقصد دقیق
 * داخل payload رمزنگاری‌شده است و سیستم نمی‌تواند به‌تنهایی آن را کامل تایید کند؛ در این حالت
 * ادمین باید جزئیات خام تراکنش (raw) را که در پاسخ خطا برگردانده می‌شود ببیند و صریحاً تایید کند.
 */
router.post('/withdrawals/:id/approve', async (req, res) => {
  const txHash = String((req.body && req.body.txHash) || '').trim();
  const forceManualConfirm = Boolean(req.body && req.body.forceManualConfirm);

  if (!txHash) {
    return res.status(400).json({ success: false, message: 'وارد کردن Transaction Hash الزامی است.' });
  }

  const withdrawal = await Withdrawal.findById(req.params.id);
  if (!withdrawal) return res.status(404).json({ success: false, message: 'رکورد پیدا نشد.' });
  if (withdrawal.status !== 'pending') {
    return res.status(400).json({ success: false, message: 'این درخواست قبلاً پردازش شده است.' });
  }

  const verification = await verifyTonTransaction({
    txHash,
    expectedAddress: withdrawal.address,
    expectedAmount: withdrawal.cryptoAmount,
    token: withdrawal.token
  });

  if (!verification.ok) {
    return res.status(400).json({
      success: false,
      message: `تایید تراکنش روی زنجیره ناموفق بود: ${verification.reason}`,
      code: 'VERIFICATION_FAILED'
    });
  }

  if (verification.requiresManualAmountCheck && !forceManualConfirm) {
    return res.status(409).json({
      success: false,
      message: verification.reason,
      code: 'MANUAL_CONFIRM_REQUIRED',
      raw: verification.raw
    });
  }

  withdrawal.status = 'paid';
  withdrawal.txHash = txHash;
  withdrawal.verified = !verification.requiresManualAmountCheck;
  withdrawal.verificationNote = verification.reason;
  withdrawal.fromAddress = verification.fromAddress || '';
  withdrawal.paidAt = new Date();
  withdrawal.adminNote = (req.body && req.body.note) || withdrawal.adminNote;
  await withdrawal.save();

  res.json({ success: true, withdrawal });

  recordAdminLog({
    actor: req.adminActor,
    action: 'withdrawal_approve',
    targetType: 'withdrawal',
    targetId: withdrawal._id,
    details: `${withdrawal.cryptoAmount} ${withdrawal.token} — TxID: ${txHash}`
  });

  // اطلاع‌رسانی به خود کاربر که پرداختش انجام شد
  const payeeUser = await User.findById(withdrawal.user, 'telegramId');
  if (payeeUser) {
    notifyUser(
      payeeUser.telegramId,
      `✅ برداشت شما تایید و پرداخت شد!\n\nمبلغ: ${withdrawal.cryptoAmount} ${withdrawal.token}\nTxID: ${withdrawal.txHash}\n\nمی‌تونی تراکنش رو تو تاریخچه‌ی کیف‌پولت هم ببینی.`
    ).catch(() => {});
  }
});

router.post('/withdrawals/:id/reject', async (req, res) => {
  const withdrawal = await Withdrawal.findById(req.params.id);
  if (!withdrawal) return res.status(404).json({ success: false, message: 'رکورد پیدا نشد.' });

  if (withdrawal.status === 'pending') {
    const refunded = await User.findByIdAndUpdate(
      withdrawal.user,
      { $inc: { points: withdrawal.pointsSpent } },
      { new: true }
    );
    if (refunded) {
      recordLedger({
        user: refunded._id,
        type: 'admin_adjust',
        amount: withdrawal.pointsSpent,
        description: 'بازگشت پوینت بابت رد درخواست برداشت',
        balanceAfter: refunded.points
      }).catch(() => {});
    }
  }

  withdrawal.status = 'rejected';
  withdrawal.adminNote = (req.body && req.body.note) || '';
  await withdrawal.save();

  res.json({ success: true, withdrawal });

  recordAdminLog({
    actor: req.adminActor,
    action: 'withdrawal_reject',
    targetType: 'withdrawal',
    targetId: withdrawal._id,
    details: withdrawal.adminNote ? `دلیل: ${withdrawal.adminNote}` : ''
  });

  // اطلاع‌رسانی رد شدن درخواست به کاربر (پوینتش قبلاً در بالا برگردانده شده)
  const requesterUser = await User.findById(withdrawal.user, 'telegramId');
  if (requesterUser) {
    const reasonLine = withdrawal.adminNote ? `\nدلیل: ${withdrawal.adminNote}` : '';
    notifyUser(
      requesterUser.telegramId,
      `❌ درخواست برداشت شما رد شد و پوینت‌هایش به حسابت برگشت.${reasonLine}`
    ).catch(() => {});
  }
});

/* -------------------- USERS -------------------- */
/**
 * GET /api/admin/users?search=...&status=banned|active&sort=points|newest
 * جستجو روی نام/یوزرنیم/آیدی تلگرام، فیلتر روی وضعیت بن، مرتب‌سازی.
 */
router.get('/users', async (req, res) => {
  const { search, status, sort } = req.query;
  const filter = {};

  if (search) {
    const regex = new RegExp(String(search).trim(), 'i');
    filter.$or = [{ firstName: regex }, { lastName: regex }, { username: regex }, { telegramId: regex }, { referralCode: regex }];
  }
  if (status === 'banned') filter.isBanned = true;
  if (status === 'active') filter.isBanned = false;

  const sortMap = { points: { points: -1 }, invited: { invitedCount: -1 }, newest: { createdAt: -1 }, oldest: { createdAt: 1 } };
  const sortBy = sortMap[sort] || sortMap.newest;

  const users = await User.find(filter).select('-__v').sort(sortBy).limit(200);
  res.json({ success: true, users });
});

router.post('/users/:id/ban', async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isBanned: true }, { new: true });
  res.json({ success: true, user });

  recordAdminLog({
    actor: req.adminActor,
    action: 'user_ban',
    targetType: 'user',
    targetId: req.params.id,
    details: user ? (user.firstName || user.username || user.telegramId) : ''
  });
});

router.post('/users/:id/unban', async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isBanned: false }, { new: true });
  res.json({ success: true, user });

  recordAdminLog({
    actor: req.adminActor,
    action: 'user_unban',
    targetType: 'user',
    targetId: req.params.id,
    details: user ? (user.firstName || user.username || user.telegramId) : ''
  });
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

  recordAdminLog({
    actor: req.adminActor,
    action: 'settings_update',
    targetType: 'settings',
    details: Object.keys(req.body || {}).join(', ')
  });
});

/* -------------------- STATS (داشبورد آمار) -------------------- */
/**
 * GET /api/admin/stats — خلاصه‌ی امروز + روند ۷ روز اخیر، برای داشبورد گرافیکی.
 */
router.get('/stats', async (req, res) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(startOfToday);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // شامل خود امروز = ۷ روز

  const [
    newUsersToday,
    tasksCompletedToday,
    totalUsers,
    bannedUsers,
    totalReferred,
    convertedReferred,
    pendingWithdrawals,
    paidTodayAgg,
    newUsersTrend,
    tasksTrend
  ] = await Promise.all([
    User.countDocuments({ createdAt: { $gte: startOfToday } }),
    TaskCompletion.countDocuments({ status: 'approved', createdAt: { $gte: startOfToday } }),
    User.countDocuments({}),
    User.countDocuments({ isBanned: true }),
    User.countDocuments({ referredBy: { $ne: null } }),
    User.countDocuments({ referredBy: { $ne: null }, referralBonusAwarded: true }),
    Withdrawal.countDocuments({ status: 'pending' }),
    Withdrawal.aggregate([
      { $match: { status: 'paid', paidAt: { $gte: startOfToday } } },
      { $group: { _id: '$token', total: { $sum: '$cryptoAmount' } } }
    ]),
    User.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } }
    ]),
    TaskCompletion.aggregate([
      { $match: { status: 'approved', createdAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } }
    ])
  ]);

  // پر کردن روزهای بدون داده با صفر، تا نمودار ۷ ستون کامل داشته باشد
  function buildTrend(aggResult) {
    const map = new Map(aggResult.map(r => [r._id, r.count]));
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: map.get(key) || 0 });
    }
    return days;
  }

  const referralConversionRate = totalReferred > 0 ? Math.round((convertedReferred / totalReferred) * 1000) / 10 : 0;

  res.json({
    success: true,
    stats: {
      newUsersToday,
      tasksCompletedToday,
      totalUsers,
      bannedUsers,
      totalReferred,
      convertedReferred,
      referralConversionRate,
      pendingWithdrawals,
      paidToday: paidTodayAgg,
      newUsersTrend: buildTrend(newUsersTrend),
      tasksTrend: buildTrend(tasksTrend)
    }
  });
});

/* -------------------- ADMIN ACTIVITY LOG -------------------- */
/**
 * GET /api/admin/logs?action=...&targetType=...&limit=100
 */
router.get('/logs', async (req, res) => {
  const { action, targetType } = req.query;
  const filter = {};
  if (action) filter.action = action;
  if (targetType) filter.targetType = targetType;

  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const logs = await AdminLog.find(filter).sort({ createdAt: -1 }).limit(limit);
  res.json({ success: true, logs });
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

  recordAdminLog({
    actor: req.adminActor,
    action: 'broadcast_send',
    targetType: 'broadcast',
    details: `${users.length} گیرنده — ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`
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