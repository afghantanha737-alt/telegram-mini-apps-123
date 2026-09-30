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
const WeeklyLeaderboardAward = require('../models/WeeklyLeaderboardAward');
const { isValidAdminKey } = require('../utils/adminKey');
const RequiredChannel = require('../models/RequiredChannel');
const { membership, validateChannelRef, normalizeChannelInput } = require('../utils/membership');
const { canTransition, requiresReason, shouldRefund, synthesizeHistory, isTerminal } = require('../utils/withdrawalStatus');
const { COMMON_TIMEZONES, isValidTimezone, targetUtcHour } = require('../utils/timezones');
const { sendTestReminder } = require('../utils/dailyReminder');
const { isValidWeights, resolveWeights, checkSpinSettings, spinModel } = require('../utils/spin');
const { normalizeSponsorInput, marginInfo } = require('../utils/sponsor');
const { startOfUtcWeek, endOfUtcWeek, weekKey } = require('../utils/weeklyLeaderboard');
const { createAdminSession, getAdminSession, revokeAdminSession, SESSION_TTL_MS } = require('../utils/adminSession');
const { buildDiscrepancy, isDiscrepant } = require('../utils/financialAudit');
const { snapshot: metricsSnapshot } = require('../utils/metrics');

const MAX_REQUIRED_CHANNELS = 5;

const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function pageParams(query, defaultLimit = 100, maxLimit = 300) {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const limit = Math.min(maxLimit, Math.max(1, Math.floor(Number(query.limit) || defaultLimit)));
  return { page, limit, skip: (page - 1) * limit };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

function requireAdmin(req, res, next) {
  const session = getAdminSession(req.headers['x-admin-session']);
  // x-admin-key برای سازگاری با نسخه‌های قدیمی نگه داشته شده، اما پنل جدید
  // بعد از login فقط session کوتاه‌مدت می‌فرستد و کلید اصلی را تکرار نمی‌کند.
  const legacyKey = req.headers['x-admin-key'];
  if (!session && !isValidAdminKey(typeof legacyKey === 'string' ? legacyKey : '')) {
    return res.status(403).json({ success: false, message: 'دسترسی غیرمجاز.' });
  }
  req.adminActor = session?.actor || String(req.headers['x-admin-name'] || '').trim() || 'ادمین';
  next();
}

// کلید اصلی فقط یک‌بار در لحظه ورود ارسال می‌شود و بعد از آن session کوتاه‌مدت استفاده می‌شود.
router.post('/login', async (req, res) => {
  const key = String(req.body?.key || '');
  if (!isValidAdminKey(key)) return res.status(403).json({ success: false, message: 'کلید ادمین نادرست است.' });
  const actor = String(req.body?.name || '').trim() || 'ادمین';
  const session = createAdminSession(actor);
  res.json({ success: true, sessionToken: session.token, expiresAt: session.expiresAt, ttlMs: SESSION_TTL_MS });
});

router.use(requireAdmin);

router.post('/logout', (req, res) => {
  revokeAdminSession(req.headers['x-admin-session']);
  res.json({ success: true });
});

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
  const { title, description, type, url, reward, chatId, maxCompletions, force, isSpecialOfDay } = req.body || {};
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
    isSpecialOfDay: isSpecialOfDay === true || isSpecialOfDay === 'true',
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
  const allowed = ['title', 'description', 'type', 'verifyType', 'chatId', 'url', 'reward', 'maxCompletions', 'isActive', 'isSpecialOfDay'];
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
/* -------------------- WEEKLY LEADERBOARD AWARDS -------------------- */
router.get('/weekly-leaderboard', async (req, res) => {
  const requestedKey = String(req.query.weekKey || '').trim();
  const currentKey = weekKey();
  const selectedKey = requestedKey || currentKey;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedKey)) {
    return res.status(400).json({ success: false, message: 'weekKey باید به شکل YYYY-MM-DD باشد.' });
  }
  const start = new Date(`${selectedKey}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return res.status(400).json({ success: false, message: 'هفته نامعتبر است.' });
  const end = new Date(start.getTime() + 7 * 86400000);
  const positiveTypes = ['task', 'checkin', 'spin', 'referral_bonus'];
  const settings = await Settings.getGlobal();
  const standings = await PointsLedger.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end }, currency: 'points', amount: { $gt: 0 }, type: { $in: positiveTypes } } },
    { $group: { _id: '$user', points: { $sum: '$amount' } } },
    { $sort: { points: -1, _id: 1 } },
    { $limit: 50 },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $match: { 'user.isBanned': false } }
  ]);
  const awards = await WeeklyLeaderboardAward.find({ weekKey: selectedKey }).populate('user', 'firstName username telegramId').sort({ rank: 1 }).lean();
  res.json({ success: true, weekKey: selectedKey, weekStart: start, weekEnd: end, isCurrentWeek: selectedKey === currentKey, prizes: settings.weeklyLeaderboardPrizes || [], standings: standings.map((row, index) => ({ rank: index + 1, points: row.points, user: row.user })), awards });
});

router.post('/weekly-leaderboard/:selectedWeekKey/pay', async (req, res) => {
  const selectedKey = String(req.params.selectedWeekKey || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedKey)) return res.status(400).json({ success: false, message: 'weekKey نامعتبر است.' });
  const start = new Date(`${selectedKey}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 7 * 86400000);
  if (Number.isNaN(start.getTime())) return res.status(400).json({ success: false, message: 'هفته نامعتبر است.' });
  if (end > new Date() && req.body?.force !== true) return res.status(409).json({ success: false, message: 'پرداخت جایزه تا پایان هفته امکان‌پذیر نیست؛ برای تست force=true ارسال کنید.' });

  const settings = await Settings.getGlobal();
  const prizes = (settings.weeklyLeaderboardPrizes || []).map(Number);
  const positiveTypes = ['task', 'checkin', 'spin', 'referral_bonus'];
  const standings = await PointsLedger.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end }, currency: 'points', amount: { $gt: 0 }, type: { $in: positiveTypes } } },
    { $group: { _id: '$user', points: { $sum: '$amount' } } },
    { $sort: { points: -1, _id: 1 } },
    { $limit: prizes.length },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    { $match: { 'user.isBanned': false } }
  ]);

  const results = [];
  for (let index = 0; index < standings.length; index += 1) {
    const rank = index + 1;
    const points = Math.floor(Number(prizes[index]) || 0);
    if (points <= 0) continue;
    const row = standings[index];
    const award = await WeeklyLeaderboardAward.findOneAndUpdate(
      { weekKey: selectedKey, rank },
      { $setOnInsert: { user: row._id, points, status: 'pending' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (award.status === 'paid') { results.push({ rank, status: 'already_paid', points }); continue; }
    const claimed = await WeeklyLeaderboardAward.findOneAndUpdate(
      { _id: award._id, status: { $in: ['pending', 'failed'] } },
      { $set: { status: 'processing', error: '' } },
      { new: true }
    );
    if (!claimed) { results.push({ rank, status: award.status, points }); continue; }
    try {
      const updatedUser = await User.findByIdAndUpdate(row._id, { $inc: { points } }, { new: true });
      if (!updatedUser) throw new Error('کاربر برنده پیدا نشد.');
      await recordLedger({ user: updatedUser._id, type: 'leaderboard_reward', amount: points, description: `جایزه رتبه ${rank} leaderboard هفته ${selectedKey}`, balanceAfter: updatedUser.points, sourceId: `weekly-leaderboard:${selectedKey}:${rank}` });
      await WeeklyLeaderboardAward.updateOne({ _id: claimed._id, status: 'processing' }, { $set: { status: 'paid', paidAt: new Date() } });
      if (row.user.telegramId) {
        notifyUser(row.user.telegramId, botText('leaderboardReward', row.user.language, rank, points, selectedKey)).catch(() => {});
      }
      results.push({ rank, status: 'paid', points, user: updatedUser._id });
    } catch (error) {
      await WeeklyLeaderboardAward.updateOne({ _id: claimed._id }, { $set: { status: 'failed', error: String(error.message || error) } });
      results.push({ rank, status: 'failed', points, error: String(error.message || error) });
    }
  }
  recordAdminLog({ actor: req.adminActor, action: 'weekly_leaderboard_pay', targetType: 'settings', details: `هفته ${selectedKey}: ${results.map(item => `${item.rank}:${item.status}`).join(', ')}` });
  res.json({ success: true, weekKey: selectedKey, results });
});

// گزارش فقط‌خواندنی برای پیدا کردن اختلاف بین موجودی فعلی و جمع Ledger.
// این endpoint هیچ موجودی را تغییر نمی‌دهد و برای کنترل قبل از پرداخت/برداشت است.
router.get('/financial-audit', async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  const [users, sums] = await Promise.all([
    User.find({}).select('telegramId firstName username points gramBalance').limit(10000).lean(),
    PointsLedger.aggregate([
      { $group: { _id: { user: '$user', currency: '$currency' }, total: { $sum: '$amount' } } },
      { $group: { _id: '$_id.user', values: { $push: { currency: '$_id.currency', total: '$total' } } } }
    ])
  ]);
  const byUser = new Map(sums.map(row => [String(row._id), Object.fromEntries(row.values.map(item => [item.currency, item.total]))]));
  const discrepancies = users.map(user => buildDiscrepancy(user, byUser.get(String(user._id)) || {})).filter(isDiscrepant).slice(0, limit);
  res.json({ success: true, checkedUsers: users.length, discrepancyCount: discrepancies.length, discrepancies, generatedAt: new Date().toISOString() });
});

router.get('/ops-metrics', (req, res) => {
  res.json({ success: true, metrics: metricsSnapshot(), node: process.version, environment: process.env.NODE_ENV || 'production', timestamp: new Date().toISOString() });
});

router.get('/withdrawals', async (req, res) => {
  const status = req.query.status;
  const filter = status ? { status } : {};
  const { page, limit, skip } = pageParams(req.query, 100, 300);
  const [list, total] = await Promise.all([
    Withdrawal.find(filter)
      .populate('user', 'firstName username telegramId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Withdrawal.countDocuments(filter)
  ]);
  res.json({
    success: true,
    withdrawals: list.map(w => ({ ...w.toObject(), timeline: synthesizeHistory(w) })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
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
  if (!['pending', 'approved', 'processing'].includes(withdrawal.status)) {
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

  // atomic: از هر سه حالت غیرپایانی (pending/approved/processing) می‌توان پرداخت را نهایی کرد
  // (جلوگیری از تایید/رد هم‌زمان با شرط status فعلی)
  const paid = await Withdrawal.findOneAndUpdate(
    { _id: withdrawal._id, status: { $in: ['pending', 'approved', 'processing'] } },
    {
      $set: {
        status: 'paid',
        txHash,
        verified: !verification.requiresManualAmountCheck,
        verificationNote: verification.reason,
        fromAddress: verification.fromAddress || '',
        paidAt: new Date(),
        adminNote: (req.body && req.body.note) || withdrawal.adminNote
      },
      $push: { statusHistory: { status: 'paid', at: new Date(), note: (req.body && req.body.note) || '' } }
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
  // طبق مشخصات: رد کردن باید همیشه دلیل داشته باشد (سمت سرور چک می‌شود، نه فقط فرانت)
  const reason = String((req.body && req.body.note) || '').trim();
  if (!reason) {
    return res.status(400).json({ success: false, message: 'برای رد درخواست، وارد کردن دلیل الزامی است.' });
  }

  const existing = await Withdrawal.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'رکورد پیدا نشد.' });

  // atomic: فقط درخواستی که هنوز پرداخت/رد/لغو نشده رد می‌شود (pending، approved یا processing)
  const withdrawal = await Withdrawal.findOneAndUpdate(
    { _id: existing._id, status: { $in: ['pending', 'approved', 'processing'] } },
    {
      $set: { status: 'rejected', adminNote: reason },
      $push: { statusHistory: { status: 'rejected', at: new Date(), note: reason } }
    },
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
    details: `دلیل: ${reason}`
  });

  // اطلاع‌رسانی رد شدن درخواست به کاربر (GRAM قبلاً در بالا برگردانده شده)
  const requesterUser = await User.findById(withdrawal.user, 'telegramId language');
  if (requesterUser) {
    notifyUser(
      requesterUser.telegramId,
      botText('withdrawalRejected', requesterUser.language, reason)
    ).catch(() => {});
  }
});

/**
 * POST /api/admin/withdrawals/:id/status — تغییر وضعیت «فقط نمایشی» (approved/processing/cancelled)
 * برخلاف approve/reject بالا، این مسیر پولی جابه‌جا نمی‌کند مگر برای cancelled (بازگشت GRAM،
 * دقیقاً مثل reject). برای پرداخت نهایی همچنان باید از /approve با txHash استفاده کرد.
 */
router.post('/withdrawals/:id/status', async (req, res) => {
  const targetStatus = String((req.body && req.body.status) || '');
  const reason = String((req.body && req.body.note) || '').trim();

  if (!['approved', 'processing', 'cancelled'].includes(targetStatus)) {
    return res.status(400).json({ success: false, message: 'وضعیت درخواستی نامعتبر است.' });
  }
  if (requiresReason(targetStatus) && !reason) {
    return res.status(400).json({ success: false, message: 'برای لغو درخواست، وارد کردن دلیل الزامی است.' });
  }

  const existing = await Withdrawal.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'رکورد پیدا نشد.' });
  if (!canTransition(existing.status, targetStatus)) {
    return res.status(400).json({ success: false, message: `امکان تغییر وضعیت از «${existing.status}» به «${targetStatus}» وجود ندارد.` });
  }

  // atomic: فقط اگر وضعیت فعلی هنوز همان است که خواندیم اعمال می‌شود (جلوگیری از تغییر هم‌زمان)
  const update = {
    $set: { status: targetStatus },
    $push: { statusHistory: { status: targetStatus, at: new Date(), note: reason } }
  };
  if (targetStatus === 'cancelled') update.$set.adminNote = reason;

  const withdrawal = await Withdrawal.findOneAndUpdate(
    { _id: existing._id, status: existing.status },
    update,
    { new: true }
  );
  if (!withdrawal) {
    return res.status(400).json({ success: false, message: 'وضعیت این درخواست هم‌زمان توسط جای دیگری تغییر کرده؛ صفحه را رفرش کنید.' });
  }

  // لغو هم مثل رد، وجه را برمی‌گرداند (چون از لحظه‌ی درخواست کسر شده بود)
  if (shouldRefund(targetStatus)) {
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
        description: 'بازگشت GRAM بابت لغو درخواست برداشت',
        balanceAfter: refunded.gramBalance
      }).catch(() => {});
    }
  }

  res.json({ success: true, withdrawal: { ...withdrawal.toObject(), timeline: synthesizeHistory(withdrawal) } });

  recordAdminLog({
    actor: req.adminActor,
    action: `withdrawal_status_${targetStatus}`,
    targetType: 'withdrawal',
    targetId: withdrawal._id,
    details: reason ? `دلیل: ${reason}` : ''
  });

  const amountLabel = `${withdrawal.cryptoAmount} ${withdrawal.token}`;
  const notifiedUser = await User.findById(withdrawal.user, 'telegramId language');
  if (notifiedUser) {
    const key = targetStatus === 'approved' ? 'withdrawalStatusApproved'
      : targetStatus === 'processing' ? 'withdrawalStatusProcessing'
      : 'withdrawalStatusCancelled';
    const args = targetStatus === 'cancelled' ? [amountLabel, reason] : [amountLabel];
    notifyUser(notifiedUser.telegramId, botText(key, notifiedUser.language, ...args)).catch(() => {});
  }
});

/* -------------------- USERS -------------------- */
/**
 * GET /api/admin/users?search=...&status=banned|active&sort=points|newest
 * جستجو روی نام/یوزرنیم/آیدی تلگرام، فیلتر روی وضعیت بن، مرتب‌سازی.
 */
router.get('/users', async (req, res) => {
  const { search, status, sort, risk } = req.query;
  const filter = {};

  if (search) {
    const regex = new RegExp(escapeRegex(String(search).trim()), 'i');
    filter.$or = [{ firstName: regex }, { lastName: regex }, { username: regex }, { telegramId: regex }, { referralCode: regex }];
  }
  if (status === 'banned') filter.isBanned = true;
  if (status === 'active') filter.isBanned = false;
  if (risk === 'flagged') filter.referralRiskScore = { $gte: 50 };

  const sortMap = { points: { points: -1 }, invited: { invitedCount: -1 }, newest: { createdAt: -1 }, oldest: { createdAt: 1 } };
  const sortBy = sortMap[sort] || sortMap.newest;

  const { page, limit, skip } = pageParams(req.query, 100, 300);
  const [users, total] = await Promise.all([
    User.find(filter).select('-__v').sort(sortBy).skip(skip).limit(limit).lean(),
    User.countDocuments(filter)
  ]);
  res.json({ success: true, users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
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

// بررسی دستی سیگنال ضدتقلب Referral.
router.post('/users/:id/referral-review', async (req, res) => {
  const action = String(req.body?.action || '').trim();
  if (!['approve', 'block'].includes(action)) return res.status(400).json({ success: false, message: 'action باید approve یا block باشد.' });
  const user = await User.findById(req.params.id).select('referredBy referralRiskScore referralRiskFlags referralRiskBlocked firstName username');
  if (!user) return res.status(404).json({ success: false, message: 'کاربر پیدا نشد.' });
  const updated = await User.findOneAndUpdate(
    { _id: user._id },
    { $set: {
      referralRiskBlocked: action === 'block',
      referralRiskScore: action === 'approve' ? 0 : Math.max(50, Number(user.referralRiskScore || 50)),
      referralRiskFlags: action === 'approve' ? [] : user.referralRiskFlags,
      referralRiskReviewedAt: new Date(),
      referralRiskReviewedBy: req.adminActor
    } },
    { new: true }
  );
  if (action === 'approve' && user.referredBy) {
    const approvedCount = await TaskCompletion.countDocuments({ user: user._id, status: 'approved' });
    if (approvedCount > 0) {
      await User.findOneAndUpdate(
        { _id: user.referredBy, activeReferralIds: { $ne: user._id } },
        { $addToSet: { activeReferralIds: user._id }, $inc: { activeInvitedCount: 1 } }
      );
    }
  }
  recordAdminLog({ actor: req.adminActor, action: `referral_risk_${action}`, targetType: 'user', targetId: user._id, details: user.firstName || user.username || '' });
  res.json({ success: true, user: updated });
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
    spinModel: spinModel(),
    timezones: COMMON_TIMEZONES
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
    dailyReminderLocalHour: v => Number.isInteger(v) && v >= 0 && v <= 23
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
  if (Object.prototype.hasOwnProperty.call(body, 'dailyReminderTimezone')) {
    const tz = String(body.dailyReminderTimezone || 'UTC');
    if (!isValidTimezone(tz)) {
      return res.status(400).json({ success: false, message: 'منطقه‌ی زمانی نامعتبر است.' });
    }
    changes.dailyReminderTimezone = tz;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'dailyReminderAudience')) {
    if (!['all', 'active'].includes(body.dailyReminderAudience)) {
      return res.status(400).json({ success: false, message: 'مخاطبان یادآوری نامعتبر است.' });
    }
    changes.dailyReminderAudience = body.dailyReminderAudience;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'dailyReminderMessage')) {
    const msg = String(body.dailyReminderMessage || '').trim();
    if (msg.length > 500) {
      return res.status(400).json({ success: false, message: 'متن یادآوری نباید بیشتر از ۵۰۰ کاراکتر باشد.' });
    }
    changes.dailyReminderMessage = msg;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'weeklyLeaderboardEnabled')) {
    changes.weeklyLeaderboardEnabled = body.weeklyLeaderboardEnabled === true || body.weeklyLeaderboardEnabled === 'true';
  }
  if (Object.prototype.hasOwnProperty.call(body, 'weeklyLeaderboardPrizes')) {
    const prizes = Array.isArray(body.weeklyLeaderboardPrizes) ? body.weeklyLeaderboardPrizes.map(Number) : null;
    if (!prizes || prizes.length < 3 || prizes.length > 10 || prizes.some(value => !Number.isInteger(value) || value < 0 || value > 100000000)) {
      return res.status(400).json({ success: false, message: 'جوایز leaderboard هفتگی باید ۳ تا ۱۰ عدد صحیح غیرمنفی باشد.' });
    }
    changes.weeklyLeaderboardPrizes = prizes;
  }

  const settings = await Settings.getGlobal();

  // ساعت واقعی اجرا (UTC) از روی «ساعت محلی + منطقه‌ی زمانی» محاسبه می‌شود، نه مستقیم از ادمین
  if (changes.dailyReminderLocalHour !== undefined || changes.dailyReminderTimezone !== undefined) {
    const localHour = changes.dailyReminderLocalHour !== undefined ? changes.dailyReminderLocalHour : settings.dailyReminderLocalHour;
    const timezone = changes.dailyReminderTimezone !== undefined ? changes.dailyReminderTimezone : settings.dailyReminderTimezone;
    changes.dailyReminderHourUtc = targetUtcHour(localHour, timezone);
  }

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
    spinModel: spinModel(),
    timezones: COMMON_TIMEZONES
  });

  recordAdminLog({
    actor: req.adminActor,
    action: 'settings_update',
    targetType: 'settings',
    details: Object.keys(changes).join(', ')
  });
});

/**
 * POST /api/admin/daily-reminder/test — ارسال پیام یادآوری (با متن فعلی تنظیمات) به یک
 * آیدی عددی تلگرام مشخص، برای اینکه ادمین قبل از فعال کردن، پیام را واقعاً ببیند.
 * این اندپوینت خودِ Settings.dailyReminderEnabled را روشن نمی‌کند و شمارنده‌ها را تغییر نمی‌دهد.
 */
router.post('/daily-reminder/test', async (req, res) => {
  const telegramId = String((req.body && req.body.telegramId) || '').trim();
  const lang = ['fa', 'ps', 'en'].includes(req.body && req.body.lang) ? req.body.lang : 'fa';
  if (!telegramId || !/^\d{3,15}$/.test(telegramId)) {
    return res.status(400).json({ success: false, message: 'آیدی عددی تلگرام معتبر وارد کنید (فقط عدد).' });
  }
  const ok = await sendTestReminder(telegramId, lang);
  if (!ok) {
    return res.status(400).json({
      success: false,
      message: 'ارسال ناموفق بود. مطمئن شوید این آیدی درست است و قبلاً /start را به ربات زده.'
    });
  }
  res.json({ success: true, message: 'پیام آزمایشی ارسال شد.' });
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

  const { page, limit, skip } = pageParams(req.query, 100, 300);
  const [logs, total] = await Promise.all([
    AdminLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AdminLog.countDocuments(filter)
  ]);
  res.json({ success: true, logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
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
