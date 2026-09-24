'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { requireTelegramAuth } = require('../utils/telegramAuth');
const { recordLedger } = require('../utils/ledger');
const Settings = require('../models/Settings');
const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const PointsLedger = require('../models/PointsLedger');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

/**
 * نکته مهم زمان‌بندی:
 * افغانستان UTC+4:30 است. یعنی ساعت 00:00 UTC دقیقاً برابر است با
 * ساعت 04:30 صبح به وقت کابل. پس به‌جای محاسبه‌ی پیچیده‌ی timezone،
 * کافی است "روز" را بر مبنای نیمه‌شب UTC حساب کنیم — این خودش دقیقاً
 * همان ریست ساعت 4:30 صبح افغانستان است.
 */
function utcDayKey(date) {
  const d = new Date(date);
  return Math.floor(d.getTime() / 86400000); // تعداد روزهای کامل از epoch (بر مبنای UTC)
}

function nextResetTimestamp() {
  const currentDayKey = utcDayKey(new Date());
  return (currentDayKey + 1) * 86400000; // شروع روز UTC بعدی، به میلی‌ثانیه
}

function truncateAddress(address) {
  const s = String(address || '');
  if (s.length <= 14) return s;
  return `${s.slice(0, 6)}…${s.slice(-6)}`;
}

// چرخ‌گردون: ۶ خانه
const SPIN_SEGMENTS = [
  { type: 'points', value: 20 },
  { type: 'points', value: 40 },
  { type: 'points', value: 60 },
  { type: 'points', value: 100 },
  { type: 'empty', value: 0 },
  { type: 'spin', value: 1 }
];

// GET /api/points/me
router.get('/me', auth, async (req, res) => {
  const u = req.dbUser;
  const settings = await Settings.getGlobal();

  const canCheckIn = !u.lastCheckIn || utcDayKey(u.lastCheckIn) < utcDayKey(new Date());
  const minWithdrawGram = Number((settings.minWithdrawPoints * settings.rate).toFixed(6));

  // مجموع پوینتی که کاربر تا امروز «کسب» کرده (بدون احتساب تبدیل GRAM→پوینت و اصلاح دستی ادمین)
  const earnedAgg = await PointsLedger.aggregate([
    { $match: { user: u._id, currency: 'points', amount: { $gt: 0 }, type: { $nin: ['exchange_in', 'admin_adjust'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const totalEarnedPoints = earnedAgg.length ? earnedAgg[0].total : 0;

  res.json({
    success: true,
    totalEarnedPoints,
    gramUsdPrice: settings.gramUsdPrice || 0,
    points: u.points,
    gramBalance: u.gramBalance,
    rate: settings.rate,
    streak: u.streak,
    canCheckIn,
    spinChances: u.spinChances,
    totalCheckins: u.totalCheckins,
    firstName: u.firstName,
    minWithdrawGram,
    nextResetAt: nextResetTimestamp(),
    language: u.language
  });
});

// POST /api/points/checkin
router.post('/checkin', auth, async (req, res) => {
  const u = req.dbUser;
  const settings = await Settings.getGlobal();
  const todayKey = utcDayKey(new Date());

  if (u.lastCheckIn && utcDayKey(u.lastCheckIn) === todayKey) {
    return res.status(400).json({ success: false, message: 'امروز قبلاً ورود روزانه ثبت شده است.', code: 'ALREADY_CHECKED_IN' });
  }

  const wasYesterday = u.lastCheckIn && utcDayKey(u.lastCheckIn) === todayKey - 1;
  const newStreak = wasYesterday ? u.streak + 1 : 1;
  const bonus = Math.min(newStreak, 30) * settings.streakBonusPoints;
  const earned = settings.dailyCheckInPoints + bonus;
  const gotSpin = newStreak > 0 && newStreak % 7 === 0;

  const inc = { points: earned, totalCheckins: 1 };
  if (gotSpin) inc.spinChances = 1;

  // atomic: فقط اگر lastCheckIn هنوز همان مقداری باشد که خواندیم، اعمال می‌شود.
  // پس دو درخواست هم‌زمان نمی‌توانند هر دو پاداش روز را بگیرند.
  const updated = await User.findOneAndUpdate(
    { _id: u._id, lastCheckIn: u.lastCheckIn || null },
    { $set: { streak: newStreak, lastCheckIn: new Date() }, $inc: inc },
    { new: true }
  );
  if (!updated) {
    return res.status(400).json({ success: false, message: 'امروز قبلاً ورود روزانه ثبت شده است.', code: 'ALREADY_CHECKED_IN' });
  }

  recordLedger({
    user: updated._id,
    type: 'checkin',
    amount: earned,
    description: `ورود روزانه (استریک ${updated.streak})`,
    balanceAfter: updated.points
  }).catch(() => {});

  res.json({
    success: true,
    earned,
    points: updated.points,
    streak: updated.streak,
    spinChances: updated.spinChances,
    gotSpin,
    nextResetAt: nextResetTimestamp()
  });
});

// POST /api/points/spin — چرخاندن گردونه شانس
router.post('/spin', auth, async (req, res) => {
  // atomic: شانس فقط اگر واقعاً موجود باشد کم می‌شود؛ درخواست‌های هم‌زمان نمی‌توانند یک شانس را چندبار خرج کنند.
  const claimed = await User.findOneAndUpdate(
    { _id: req.dbUser._id, spinChances: { $gt: 0 } },
    { $inc: { spinChances: -1 } },
    { new: true }
  );
  if (!claimed) {
    return res.status(400).json({ success: false, message: 'شانس چرخ‌گردون نداری.', code: 'NO_SPINS' });
  }

  const segmentIndex = Math.floor(Math.random() * SPIN_SEGMENTS.length);
  const segment = SPIN_SEGMENTS[segmentIndex];

  let updated = claimed;
  if (segment.type === 'points') {
    updated = await User.findByIdAndUpdate(claimed._id, { $inc: { points: segment.value } }, { new: true });
  } else if (segment.type === 'spin') {
    updated = await User.findByIdAndUpdate(claimed._id, { $inc: { spinChances: 1 } }, { new: true }); // شانس دوباره
  }

  if (segment.type === 'points' && segment.value > 0) {
    recordLedger({
      user: updated._id,
      type: 'spin',
      amount: segment.value,
      description: 'برد از گردونه شانس',
      balanceAfter: updated.points
    }).catch(() => {});
  }

  res.json({
    success: true,
    segmentIndex,
    type: segment.type,
    value: segment.value,
    points: updated.points,
    spinChances: updated.spinChances
  });
});

const round6 = n => Number(Number(n).toFixed(6));

/**
 * POST /api/points/exchange — تبدیل دوطرفه پوینت <-> موجودی GRAM
 * (بر اساس نرخ فعلی؛ این مبلغ بعداً از طریق «برداشت» قابل خارج شدن است)
 * body: { direction: 'points_to_gram' | 'gram_to_points', amount }
 * برای سازگاری با نسخه‌ی قبلی، body.points هم به‌عنوان amount برای points_to_gram پذیرفته می‌شود.
 */
router.post('/exchange', auth, async (req, res) => {
  const u = req.dbUser;
  const settings = await Settings.getGlobal();
  const body = req.body || {};
  const direction = body.direction === 'gram_to_points' ? 'gram_to_points' : 'points_to_gram';

  if (!settings.rate || settings.rate <= 0) {
    return res.status(400).json({ success: false, message: 'نرخ تبدیل نامعتبر است.', code: 'INVALID_RATE' });
  }

  if (direction === 'points_to_gram') {
    const points = Math.floor(Number(body.amount != null ? body.amount : body.points) || 0);

    if (!Number.isFinite(points) || points <= 0) {
      return res.status(400).json({ success: false, message: 'مقدار پوینت نامعتبر است.', code: 'INVALID_AMOUNT' });
    }

    const gramGained = round6(points * settings.rate);

    // atomic: کسر و اضافه در یک عملیات، فقط اگر موجودی کافی باشد
    const updated = await User.findOneAndUpdate(
      { _id: u._id, points: { $gte: points } },
      { $inc: { points: -points, gramBalance: gramGained } },
      { new: true }
    );
    if (!updated) {
      return res.status(400).json({ success: false, message: 'موجودی پوینت کافی نیست.', code: 'INSUFFICIENT_BALANCE' });
    }

    recordLedger({ user: u._id, type: 'exchange_out', currency: 'points', amount: -points, description: 'تبدیل پوینت به GRAM', balanceAfter: updated.points }).catch(() => {});
    recordLedger({ user: u._id, type: 'exchange_in', currency: 'gram', amount: gramGained, description: 'تبدیل پوینت به GRAM', balanceAfter: updated.gramBalance }).catch(() => {});

    return res.json({
      success: true,
      direction,
      message: `${points} پوینت به ${gramGained} GRAM تبدیل شد.`,
      points: updated.points,
      gramBalance: updated.gramBalance,
      gramGained
    });
  }

  // direction === 'gram_to_points'
  const gram = round6(body.amount || 0);

  if (!Number.isFinite(gram) || gram <= 0) {
    return res.status(400).json({ success: false, message: 'مقدار GRAM نامعتبر است.', code: 'INVALID_AMOUNT' });
  }

  const pointsGained = Math.floor(gram / settings.rate);

  if (pointsGained <= 0) {
    return res.status(400).json({ success: false, message: 'مقدار GRAM برای تبدیل بسیار کم است.', code: 'INVALID_AMOUNT' });
  }

  const gramSpent = round6(pointsGained * settings.rate);

  const updated = await User.findOneAndUpdate(
    { _id: u._id, gramBalance: { $gte: gramSpent } },
    { $inc: { gramBalance: -gramSpent, points: pointsGained } },
    { new: true }
  );
  if (!updated) {
    return res.status(400).json({ success: false, message: 'موجودی GRAM کافی نیست.', code: 'INSUFFICIENT_BALANCE' });
  }

  recordLedger({ user: u._id, type: 'exchange_out', currency: 'gram', amount: -gramSpent, description: 'تبدیل GRAM به پوینت', balanceAfter: updated.gramBalance }).catch(() => {});
  recordLedger({ user: u._id, type: 'exchange_in', currency: 'points', amount: pointsGained, description: 'تبدیل GRAM به پوینت', balanceAfter: updated.points }).catch(() => {});

  res.json({
    success: true,
    direction,
    message: `${gramSpent} GRAM به ${pointsGained} پوینت تبدیل شد.`,
    points: updated.points,
    gramBalance: updated.gramBalance,
    pointsGained
  });
});

// POST /api/points/withdraw — برداشت از موجودی GRAM (نه مستقیم از پوینت)
router.post('/withdraw', auth, async (req, res) => {
  const u = req.dbUser;
  const settings = await Settings.getGlobal();
  const { gram, address } = req.body || {};
  const amount = round6(gram);
  const walletAddress = String(address || '').trim();
  const minWithdrawGram = round6(settings.minWithdrawPoints * settings.rate);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'مقدار GRAM نامعتبر است.', code: 'INVALID_AMOUNT' });
  }
  if (!/^[A-Za-z0-9_\-:+/=.]{6,120}$/.test(walletAddress)) {
    return res.status(400).json({ success: false, message: 'آدرس کیف پول نامعتبر است.', code: 'INVALID_ADDRESS' });
  }
  if (amount < minWithdrawGram) {
    return res.status(400).json({
      success: false,
      message: `حداقل مقدار برداشت ${minWithdrawGram} GRAM است.`,
      code: 'BELOW_MIN_WITHDRAW'
    });
  }

  // atomic: موجودی فقط در صورت کافی بودن کم می‌شود (جلوگیری از برداشت دوباره با درخواست هم‌زمان)
  const updated = await User.findOneAndUpdate(
    { _id: u._id, gramBalance: { $gte: amount } },
    { $inc: { gramBalance: -amount }, $set: { walletAddress } },
    { new: true }
  );
  if (!updated) {
    return res.status(400).json({ success: false, message: 'موجودی GRAM کافی نیست.', code: 'INSUFFICIENT_BALANCE' });
  }

  let withdrawal;
  try {
    withdrawal = await Withdrawal.create({
      user: u._id,
      pointsSpent: settings.rate > 0 ? Math.round(amount / settings.rate) : 0,
      cryptoAmount: amount,
      address: walletAddress
    });
  } catch (error) {
    // اگر ثبت درخواست شکست خورد، مبلغ کسرشده را برگردان تا کاربر ضرر نکند
    await User.findByIdAndUpdate(u._id, { $inc: { gramBalance: amount } });
    throw error;
  }

  recordLedger({
    user: u._id,
    type: 'withdraw',
    currency: 'gram',
    amount: -amount,
    description: `درخواست برداشت به ${truncateAddress(walletAddress)}`,
    balanceAfter: updated.gramBalance
  }).catch(() => {});

  res.json({
    success: true,
    message: 'درخواست برداشت ثبت شد و به‌زودی بررسی می‌شود.',
    gramBalance: updated.gramBalance,
    withdrawalId: withdrawal._id
  });
});

// GET /api/points/withdrawals
router.get('/withdrawals', auth, async (req, res) => {
  const list = await Withdrawal.find({ user: req.dbUser._id }).sort({ createdAt: -1 }).limit(30);
  res.json({ success: true, withdrawals: list });
});

/**
 * GET /api/points/history — تاریخچه‌ی شخصی کاربر: هر رویدادی که پوینت یا
 * GRAM او را تغییر داده (تسک، ورود روزانه، گردونه، پاداش رفرال، تبدیل، برداشت...).
 * صفحه‌بندی با cursor: برای گرفتن صفحه‌ی بعد، createdAt آخرین آیتم دریافتی
 * را به‌عنوان ?before=... بفرست.
 */
router.get('/history', auth, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50);
  const filter = { user: req.dbUser._id };

  const before = req.query.before ? new Date(req.query.before) : null;
  if (before && !Number.isNaN(before.getTime())) {
    filter.createdAt = { $lt: before };
  }

  const items = await PointsLedger.find(filter).sort({ createdAt: -1 }).limit(limit);

  res.json({
    success: true,
    history: items,
    hasMore: items.length === limit
  });
});

/**
 * GET /api/points/public-history — فید عمومیِ پرداخت‌های واقعاً انجام‌شده (وضعیت paid)،
 * برای شفافیت و اعتمادسازی. عمداً بدون اطلاعات هویتی کاربر (نه نام، نه یوزرنیم)؛
 * فقط آدرس‌ها (کوتاه‌شده)، مبلغ، هش تراکنش و تاریخ. نیازی به لاگین ندارد.
 */
router.get('/public-history', async (req, res) => {
  const list = await Withdrawal.find({ status: 'paid' })
    .sort({ paidAt: -1 })
    .limit(30)
    .select('cryptoAmount token network address fromAddress txHash verified paidAt');

  res.json({
    success: true,
    history: list.map(w => ({
      type: 'withdrawal',
      amount: w.cryptoAmount,
      token: w.token,
      network: w.network,
      toAddress: w.address,
      fromAddress: w.fromAddress,
      txHash: w.txHash,
      verified: w.verified,
      date: w.paidAt
    }))
  });
});

module.exports = router;