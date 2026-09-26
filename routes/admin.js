'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const multer = require('multer');
const Task = require('../models/Task');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const Settings = require('../models/Settings');
const { bot, notifyUser, broadcastToActiveUsers } = require('../utils/bot');
const { botText } = require('../utils/botMessages');
const { verifyTonTransaction } = require('../utils/tonVerify');
const { recordLedger } = require('../utils/ledger');
const { recordAdminLog } = require('../utils/adminLog');
const AdminLog = require('../models/AdminLog');
const TaskCompletion = require('../models/TaskCompletion');
const PointsLedger = require('../models/PointsLedger');
const { isValidAdminKey } = require('../utils/adminKey');
const RequiredChannel = require('../models/RequiredChannel');
const { membership, validateChannelRef, normalizeChannelInput } = require('../utils/membership');
const { isValidWeights, resolveWeights, checkSpinSettings, spinModel } = require('../utils/spin');
const { normalizeSponsorInput, marginInfo } = require('../utils/sponsor');

const MAX_REQUIRED_CHANNELS = 5;

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

function requireAdmin(req, res, next) {
  // تگ <img> نمی‌تواند هدر سفارشی بفرستد، پس برای مسیر نمایش تصویر
  // اجازه می‌دهیم کلید از query هم بیاید (؟key=...).
  const key = req.headers['x-admin-key'] || req.query.key;
  if (!isValidAdminKey(typeof key === 'string' ? key : '')) {
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
    const regex = new RegExp(escapeRegex(String(search).trim()), 'i');
    filter.$or = [{ title: regex }, { description: regex }, { chatId: regex }];
  }
  if (type) filter.type = type;
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;

  const tasks = await Task.find(filter).sort({ createdAt: -1 });

  // درآمد/هزینه‌ی هر تسک از روی «عکس لحظه‌ی تکمیل» (تغییر بعدی نرخ گزارش را خراب نمی‌کند)
  const perTask = await TaskCompletion.aggregate([
    { $match: { task: { $in: tasks.map(t => t._id) }, status: 'approved' } },
    { $group: { _id: '$task', joins: { $sum: 1 }, revenueUsd: { $sum: '$revenueUsd' }, costUsd: { $sum: '$costUsd' } } }
  ]);
  const statsByTask = new Map(perTask.map(row => [String(row._id), row]));

  const overall = await TaskCompletion.aggregate([
    { $match: { status: 'approved' } },
    {
      $group: {
        _id: null,
        revenueUsd: { $sum: '$revenueUsd' },
        allCostUsd: { $sum: '$costUsd' },
        sponsoredCostUsd: { $sum: { $cond: [{ $gt: ['$revenueUsd', 0] }, '$costUsd', 0] } },
        sponsoredJoins: { $sum: { $cond: [{ $gt: ['$revenueUsd', 0] }, 1, 0] } }
      }
    }
  ]);
  const o = overall[0] || { revenueUsd: 0, allCostUsd: 0, sponsoredCostUsd: 0, sponsoredJoins: 0 };

  res.json({
    success: true,
    tasks: tasks.map(t => {
      const row = statsByTask.get(String(t._id));
      return { ...t.toObject(), stats: { revenueUsd: row ? row.revenueUsd : 0, costUsd: row ? row.costUsd : 0 } };
    }),
    summary: {
      sponsoredRevenueUsd: o.revenueUsd,
      sponsoredCostUsd: o.sponsoredCostUsd,
      sponsoredProfitUsd: o.revenueUsd - o.sponsoredCostUsd,
      sponsoredJoins: o.sponsoredJoins,
      allTasksCostUsd: o.allCostUsd
    }
  });
});

router.post('/tasks', async (req, res) => {
  const { title, description, type, url, reward, chatId, maxCompletions, force } = req.body || {};
  if (!title || !reward) {
    return res.status(400).json({ success: false, message: 'عنوان و مقدار پاداش الزامی است.' });
  }
  if (!chatId) {
    return res.status(400).json({ success: false, message: 'chatId (آیدی/یوزرنیم کانال یا گروه) الزامی است.' });
  }

  // اگر خالی/صفر/نامعتبر بود یعنی «بدون محدودیت ظرفیت»
  const parsedMax = Number(maxCompletions);
  let finalMaxCompletions = Number.isFinite(parsedMax) && parsedMax > 0 ? Math.floor(parsedMax) : null;

  // ---- تسک اسپانسری: ظرفیت از بودجه محاسبه می‌شود و سود/زیان قبل از ثبت بررسی می‌شود
  const sponsor = normalizeSponsorInput(req.body);
  if (sponsor.error) return res.status(400).json({ success: false, message: sponsor.error });
  const sp = sponsor.value;

  if (sp.isSponsored) {
    finalMaxCompletions = sp.maxCompletions;
    const settings = await Settings.getGlobal();
    const margin = marginInfo({
      reward: Number(reward), rate: settings.rate, gramUsdPrice: settings.gramUsdPrice,
      priceUsd: sp.sponsorPriceUsd, budgetUsd: sp.sponsorBudgetUsd
    });
    if (!margin.canCompute && !force) {
      return res.status(400).json({
        success: false, code: 'COST_UNKNOWN',
        message: 'قیمت دلاری GRAM در تنظیمات وارد نشده، پس سود/زیان این تسک قابل محاسبه نیست.'
      });
    }
    if (margin.isLoss && !force) {
      return res.status(400).json({
        success: false, code: 'LOSS_MAKING',
        message: `با این پاداش، هزینه‌ی هر عضو (${margin.costPerJoinUsd.toFixed(4)}$) از دریافتی‌تان (${sp.sponsorPriceUsd}$) بیشتر است و در هر عضو ${Math.abs(margin.profitPerJoinUsd).toFixed(4)}$ ضرر می‌کنید.`
      });
    }
  }

  const task = await Task.create({
    title, description, type, url, reward,
    verifyType: 'telegram',
    chatId,
    maxCompletions: finalMaxCompletions,
    isSponsored: sp.isSponsored,
    sponsorName: sp.sponsorName,
    sponsorPriceUsd: sp.sponsorPriceUsd,
    sponsorBudgetUsd: sp.sponsorBudgetUsd,
    expiresAt: sp.expiresAt
  });

  res.json({ success: true, task });

  recordAdminLog({
    actor: req.adminActor,
    action: 'task_create',
    targetType: 'task',
    targetId: task._id,
    details: sp.isSponsored
      ? `«${title}» — اسپانسر: ${sp.sponsorName} (${sp.sponsorPriceUsd}$ هر عضو، بودجه ${sp.sponsorBudgetUsd}$، ظرفیت ${finalMaxCompletions}) — پاداش ${reward} پوینت`
      : `«${title}» — پاداش ${reward} پوینت`
  });

  // اطلاع‌رسانی تسک جدید به همه‌ی کاربران فعال، هرکدام به زبان خودش؛ عمداً بدون await تا پاسخ به پنل ادمین معطل نماند
  broadcastToActiveUsers(User, u => botText('taskNew', u.language, title, reward, sp.isSponsored ? sp.sponsorName : ''))
    .catch(error => console.warn('Task broadcast failed:', error.message || error));
});

router.put('/tasks/:id', async (req, res) => {
  const body = req.body || {};
  const allowed = ['title', 'description', 'type', 'verifyType', 'chatId', 'url', 'reward', 'maxCompletions', 'isActive'];
  const update = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) update[key] = body[key];
  }

  // فیلدهای اسپانسری (ویرایش نام/قیمت/بودجه/پایان): با مقدارهای فعلی ادغام و دوباره اعتبارسنجی می‌شوند
  const sponsorKeys = ['isSponsored', 'sponsorName', 'sponsorPriceUsd', 'sponsorBudgetUsd', 'expiresAt'];
  if (sponsorKeys.some(key => Object.prototype.hasOwnProperty.call(body, key))) {
    const current = await Task.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: 'تسک پیدا نشد.' });
    const merged = {
      isSponsored: body.isSponsored !== undefined ? body.isSponsored : current.isSponsored,
      sponsorName: body.sponsorName !== undefined ? body.sponsorName : current.sponsorName,
      sponsorPriceUsd: body.sponsorPriceUsd !== undefined ? body.sponsorPriceUsd : current.sponsorPriceUsd,
      sponsorBudgetUsd: body.sponsorBudgetUsd !== undefined ? body.sponsorBudgetUsd : current.sponsorBudgetUsd,
      // تاریخ پایانِ قبلی اگر دست نخورده باشد دوباره «آینده بودن» چک نمی‌شود
      expiresAt: body.expiresAt !== undefined ? body.expiresAt : (current.expiresAt ? current.expiresAt.toISOString() : null)
    };
    const sponsor = normalizeSponsorInput(merged, body.expiresAt !== undefined ? new Date() : new Date(0));
    if (sponsor.error) return res.status(400).json({ success: false, message: sponsor.error });
    const sp = sponsor.value;

    if (sp.isSponsored) {
      const rewardNow = update.reward !== undefined ? Number(update.reward) : current.reward;
      const settings = await Settings.getGlobal();
      const margin = marginInfo({
        reward: rewardNow, rate: settings.rate, gramUsdPrice: settings.gramUsdPrice,
        priceUsd: sp.sponsorPriceUsd, budgetUsd: sp.sponsorBudgetUsd
      });
      if (margin.isLoss && !body.force) {
        return res.status(400).json({
          success: false, code: 'LOSS_MAKING',
          message: `با این تنظیمات در هر عضو ${Math.abs(margin.profitPerJoinUsd).toFixed(4)}$ ضرر می‌کنید.`
        });
      }
      if (sp.maxCompletions < current.completedCount) {
        return res.status(400).json({ success: false, message: `بودجه کمتر از تعداد عضوهای تاکنون (${current.completedCount}) است.` });
      }
      update.maxCompletions = sp.maxCompletions; // ظرفیت همیشه از بودجه ÷ قیمت
    }
    Object.assign(update, {
      isSponsored: sp.isSponsored,
      sponsorName: sp.sponsorName,
      sponsorPriceUsd: sp.sponsorPriceUsd,
      sponsorBudgetUsd: sp.sponsorBudgetUsd,
      expiresAt: sp.expiresAt
    });
  }
  if ('reward' in update) {
    update.reward = Number(update.reward);
    if (!Number.isFinite(update.reward) || update.reward < 0) {
      return res.status(400).json({ success: false, message: 'مقدار پاداش نامعتبر است.' });
    }
  }
  if ('maxCompletions' in update && update.maxCompletions !== null && update.maxCompletions !== '') {
    update.maxCompletions = Number(update.maxCompletions);
    if (!Number.isFinite(update.maxCompletions) || update.maxCompletions < 1) {
      return res.status(400).json({ success: false, message: 'ظرفیت تسک نامعتبر است.' });
    }
  } else if ('maxCompletions' in update) {
    update.maxCompletions = null;
  }
  let task;
  try {
    task = await Task.findByIdAndUpdate(req.params.id, { $set: update }, { new: true, runValidators: true });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'اطلاعات تسک نامعتبر است.' });
  }
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

  let withdrawal = await Withdrawal.findById(req.params.id);
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

  // یک TxID نباید برای دو برداشت متفاوت ثبت شود
  const duplicate = await Withdrawal.findOne({ txHash, status: 'paid', _id: { $ne: withdrawal._id } });
  if (duplicate) {
    return res.status(400).json({ success: false, message: 'این TxID قبلاً برای برداشت دیگری ثبت شده است.', code: 'DUPLICATE_TX' });
  }

  // atomic: فقط اگر هنوز pending باشد پرداخت‌شده می‌شود (جلوگیری از تایید/رد هم‌زمان)
  const paid = await Withdrawal.findOneAndUpdate(
    { _id: withdrawal._id, status: 'pending' },
    {
      $set: {
        status: 'paid',
        txHash,
        verified: !verification.requiresManualAmountCheck,
        verificationNote: verification.reason,
        fromAddress: verification.fromAddress || '',
        paidAt: new Date(),
        adminNote: (req.body && req.body.note) || withdrawal.adminNote
      }
    },
    { new: true }
  );
  if (!paid) {
    return res.status(400).json({ success: false, message: 'این درخواست قبلاً پردازش شده است.' });
  }
  withdrawal = paid;

  res.json({ success: true, withdrawal });

  recordAdminLog({
    actor: req.adminActor,
    action: 'withdrawal_approve',
    targetType: 'withdrawal',
    targetId: withdrawal._id,
    details: `${withdrawal.cryptoAmount} ${withdrawal.token} — TxID: ${txHash}`
  });

  // اطلاع‌رسانی به خود کاربر که پرداختش انجام شد
  const payeeUser = await User.findById(withdrawal.user, 'telegramId language');
  if (payeeUser) {
    notifyUser(
      payeeUser.telegramId,
      botText('withdrawalApproved', payeeUser.language, withdrawal.cryptoAmount, withdrawal.token, withdrawal.txHash)
    ).catch(() => {});
  }
});

router.post('/withdrawals/:id/reject', async (req, res) => {
  const existing = await Withdrawal.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'رکورد پیدا نشد.' });

  // atomic: فقط درخواست pending رد می‌شود؛ پرداخت‌شده یا قبلاً ردشده دوباره پردازش نمی‌شود
  const withdrawal = await Withdrawal.findOneAndUpdate(
    { _id: existing._id, status: 'pending' },
    { $set: { status: 'rejected', adminNote: (req.body && req.body.note) || '' } },
    { new: true }
  );
  if (!withdrawal) {
    return res.status(400).json({ success: false, message: 'این درخواست قبلاً پردازش شده است و قابل رد کردن نیست.' });
  }

  // مبلغ در زمان درخواست از «موجودی GRAM» کسر شده، پس همان ارز برگردانده می‌شود
  const refunded = await User.findByIdAndUpdate(
    withdrawal.user,
    { $inc: { gramBalance: withdrawal.cryptoAmount } },
    { new: true }
  );
  if (refunded) {
    recordLedger({
      user: refunded._id,
      type: 'admin_adjust',
      currency: 'gram',
      amount: withdrawal.cryptoAmount,
      description: 'بازگشت GRAM بابت رد درخواست برداشت',
      balanceAfter: refunded.gramBalance
    }).catch(() => {});
  }

  res.json({ success: true, withdrawal });

  recordAdminLog({
    actor: req.adminActor,
    action: 'withdrawal_reject',
    targetType: 'withdrawal',
    targetId: withdrawal._id,
    details: withdrawal.adminNote ? `دلیل: ${withdrawal.adminNote}` : ''
  });

  // اطلاع‌رسانی رد شدن درخواست به کاربر (GRAM قبلاً در بالا برگردانده شده)
  const requesterUser = await User.findById(withdrawal.user, 'telegramId language');
  if (requesterUser) {
    notifyUser(
      requesterUser.telegramId,
      botText('withdrawalRejected', requesterUser.language, withdrawal.adminNote || '')
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
    const regex = new RegExp(escapeRegex(String(search).trim()), 'i');
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

/* -------------------- REQUIRED CHANNELS (عضویت اجباری) -------------------- */
function publicChannel(c) {
  return {
    _id: c._id,
    name: c.name,
    username: c.username,
    chatId: c.chatId,
    url: c.url,
    isActive: c.isActive,
    lastCheckOk: c.lastCheckOk,
    lastCheckError: c.lastCheckError,
    lastCheckAt: c.lastCheckAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  };
}

const channelRefOf = v => v.chatId || `@${v.username}`;

router.get('/required-channels', async (req, res) => {
  const list = await RequiredChannel.find().sort({ sortOrder: 1, createdAt: 1 });
  res.json({ success: true, channels: list.map(publicChannel), max: MAX_REQUIRED_CHANNELS });
});

router.post('/required-channels', async (req, res) => {
  const { value, error } = normalizeChannelInput(req.body);
  if (error) return res.status(400).json({ success: false, message: error });

  if ((await RequiredChannel.countDocuments()) >= MAX_REQUIRED_CHANNELS) {
    return res.status(400).json({ success: false, message: `حداکثر ${MAX_REQUIRED_CHANNELS} کانال اجباری مجاز است.` });
  }

  const dupFilter = [];
  if (value.username) dupFilter.push({ username: new RegExp(`^${escapeRegex(value.username)}$`, 'i') });
  if (value.chatId) dupFilter.push({ chatId: value.chatId });
  if (dupFilter.length && (await RequiredChannel.findOne({ $or: dupFilter }))) {
    return res.status(400).json({ success: false, message: 'این کانال قبلاً ثبت شده است.' });
  }

  const check = await validateChannelRef(channelRefOf(value));
  if (check.chat && !value.chatId) value.chatId = check.chat.id; // آیدی عددی پایدارتر از یوزرنیم است
  if (!check.ok && !(req.body && req.body.force)) {
    return res.status(400).json({
      success: false,
      code: 'CHANNEL_VALIDATION_FAILED',
      message: check.reason
    });
  }

  const channel = await RequiredChannel.create({
    ...value,
    lastCheckOk: check.ok,
    lastCheckError: check.ok ? '' : String(check.reason || '').slice(0, 300),
    lastCheckAt: new Date()
  });
  membership.clearCache();

  res.json({ success: true, channel: publicChannel(channel), warning: check.ok ? '' : check.reason });

  recordAdminLog({
    actor: req.adminActor,
    action: 'required_channel_create',
    targetType: 'required_channel',
    targetId: channel._id,
    details: `«${channel.name}» ${channel.username ? '@' + channel.username : channel.chatId}`
  });
});

router.put('/required-channels/:id', async (req, res) => {
  const existing = await RequiredChannel.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'کانال پیدا نشد.' });

  const body = req.body || {};
  const merged = {
    name: body.name !== undefined ? body.name : existing.name,
    username: body.username !== undefined ? body.username : existing.username,
    chatId: body.chatId !== undefined ? body.chatId : existing.chatId,
    url: body.url !== undefined ? body.url : existing.url,
    isActive: body.isActive !== undefined ? body.isActive : existing.isActive
  };
  const { value, error } = normalizeChannelInput(merged);
  if (error) return res.status(400).json({ success: false, message: error });

  const identityChanged = value.username.toLowerCase() !== (existing.username || '').toLowerCase() || value.chatId !== (existing.chatId || '');

  if (identityChanged) {
    const dupFilter = [];
    if (value.username) dupFilter.push({ username: new RegExp(`^${escapeRegex(value.username)}$`, 'i') });
    if (value.chatId) dupFilter.push({ chatId: value.chatId });
    if (dupFilter.length && (await RequiredChannel.findOne({ _id: { $ne: existing._id }, $or: dupFilter }))) {
      return res.status(400).json({ success: false, message: 'این کانال قبلاً ثبت شده است.' });
    }
  }

  let check = null;
  if (identityChanged) {
    check = await validateChannelRef(channelRefOf(value));
    if (check.chat && !value.chatId) value.chatId = check.chat.id;
    if (!check.ok && !body.force) {
      return res.status(400).json({ success: false, code: 'CHANNEL_VALIDATION_FAILED', message: check.reason });
    }
  }

  Object.assign(existing, value);
  if (check) {
    existing.lastCheckOk = check.ok;
    existing.lastCheckError = check.ok ? '' : String(check.reason || '').slice(0, 300);
    existing.lastCheckAt = new Date();
  }
  await existing.save();
  membership.clearCache();

  res.json({ success: true, channel: publicChannel(existing), warning: check && !check.ok ? check.reason : '' });

  recordAdminLog({
    actor: req.adminActor,
    action: 'required_channel_update',
    targetType: 'required_channel',
    targetId: existing._id,
    details: `«${existing.name}» ${existing.isActive ? 'فعال' : 'غیرفعال'}`
  });
});

router.delete('/required-channels/:id', async (req, res) => {
  const channel = await RequiredChannel.findByIdAndDelete(req.params.id);
  if (!channel) return res.status(404).json({ success: false, message: 'کانال پیدا نشد.' });
  membership.clearCache();
  res.json({ success: true });

  recordAdminLog({
    actor: req.adminActor,
    action: 'required_channel_delete',
    targetType: 'required_channel',
    targetId: channel._id,
    details: `«${channel.name}» حذف شد`
  });
});

// تست اتصال: آیا کانال معتبر است و ربات در آن ادمین است؟
router.post('/required-channels/:id/test', async (req, res) => {
  const channel = await RequiredChannel.findById(req.params.id);
  if (!channel) return res.status(404).json({ success: false, message: 'کانال پیدا نشد.' });

  const check = await validateChannelRef(channelRefOf(channel));
  await RequiredChannel.updateOne(
    { _id: channel._id },
    {
      $set: {
        lastCheckOk: check.ok,
        lastCheckError: check.ok ? '' : String(check.reason || '').slice(0, 300),
        lastCheckAt: new Date()
      }
    },
    { timestamps: false }
  );

  res.json({
    success: true,
    ok: check.ok,
    message: check.ok
      ? `✅ اتصال سالم است — «${(check.chat && check.chat.title) || channel.name}». ربات ادمین است و عضویت کاربران را می‌تواند بررسی کند.`
      : `❌ ${check.reason}`
  });
});

/* -------------------- SETTINGS -------------------- */
router.get('/settings', async (req, res) => {
  const settings = await Settings.getGlobal();
  res.json({
    success: true,
    settings: { ...settings.toObject(), paidSpinWeights: resolveWeights(settings.paidSpinWeights) },
    spinModel: spinModel()
  });
});

router.put('/settings', async (req, res) => {
  const body = req.body || {};
  const rules = {
    rate: v => v > 0,
    minWithdrawPoints: v => v >= 0,
    dailyCheckInPoints: v => v >= 0,
    streakBonusPoints: v => v >= 0,
    gramUsdPrice: v => v >= 0,
    spinCostPoints: v => v >= 1,
    dailyReminderHourUtc: v => Number.isInteger(v) && v >= 0 && v <= 23
  };

  const changes = {};
  for (const [key, isOk] of Object.entries(rules)) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = Number(body[key]);
    if (!Number.isFinite(value) || !isOk(value)) {
      return res.status(400).json({ success: false, message: `مقدار «${key}» نامعتبر است.` });
    }
    changes[key] = value;
  }

  // dailyReminderEnabled یک boolean است، نه یک عدد؛ جدا از قاعده‌ی بالا پردازش می‌شود
  if (Object.prototype.hasOwnProperty.call(body, 'dailyReminderEnabled')) {
    changes.dailyReminderEnabled = body.dailyReminderEnabled === true || body.dailyReminderEnabled === 'true';
  }

  const settings = await Settings.getGlobal();

  if (Object.prototype.hasOwnProperty.call(body, 'paidSpinWeights')) {
    const weights = Array.isArray(body.paidSpinWeights) ? body.paidSpinWeights.map(Number) : null;
    if (!isValidWeights(weights)) {
      return res.status(400).json({ success: false, message: 'وزن شانس گردونه نامعتبر است: ۶ عدد صحیح بین ۰ تا ۱۰۰۰ لازم است و مجموعشان باید بیشتر از صفر باشد.' });
    }
    changes.paidSpinWeights = weights;
  }

  // جلوی سودآور شدن چرخش پولی برای کاربران (تولید بی‌نهایت پوینت) را می‌گیرد
  if (changes.paidSpinWeights !== undefined || changes.spinCostPoints !== undefined) {
    const finalCost = changes.spinCostPoints !== undefined ? changes.spinCostPoints : (settings.spinCostPoints || 30);
    const finalWeights = changes.paidSpinWeights || resolveWeights(settings.paidSpinWeights);
    const check = checkSpinSettings(finalWeights, finalCost);
    if (check.error) return res.status(400).json({ success: false, message: check.error });
  }

  Object.assign(settings, changes);
  await settings.save();
  res.json({
    success: true,
    settings: { ...settings.toObject(), paidSpinWeights: resolveWeights(settings.paidSpinWeights) },
    spinModel: spinModel()
  });

  recordAdminLog({
    actor: req.adminActor,
    action: 'settings_update',
    targetType: 'settings',
    details: Object.keys(changes).join(', ')
  });
});

/* -------------------- STATS (داشبورد آمار) -------------------- */
/**
 * GET /api/admin/stats — خلاصه‌ی امروز + روند ۷ روز اخیر، برای داشبورد گرافیکی.
 */
router.get('/stats', async (req, res) => {
  const now = new Date();
  // همه‌چیز بر پایه‌ی روز UTC است (همان مبنای ریست روزانه و $dateToString در MongoDB)،
  // تا نمودار به منطقه‌ی زمانی سرور وابسته نباشد.
  const DAY_MS = 86400000;
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = new Date(startOfToday.getTime() - 6 * DAY_MS); // شامل خود امروز = ۷ روز

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
      const d = new Date(startOfToday.getTime() - i * DAY_MS);
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