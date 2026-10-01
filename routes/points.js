'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { requireTelegramAuth } = require('../utils/telegramAuth');
const { recordLedgerRequired } = require('../utils/ledger');
const Settings = require('../models/Settings');
const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const PointsLedger = require('../models/PointsLedger');

// احراز هویت تلگرام + بررسی عضویت فعلی در کانال‌های اجباری (روی هر درخواست محافظت‌شده)
const { withMembership } = require('../utils/membership');
const auth = withMembership(requireTelegramAuth(process.env.BOT_TOKEN));

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
const crypto = require('crypto');

const { SPIN_SEGMENTS, resolveWeights, pickWeightedIndex } = require('../utils/spin');
const { notifyUser } = require('../utils/bot');
const { botText } = require('../utils/botMessages');
const { synthesizeHistory } = require('../utils/withdrawalStatus');
const { getLevel } = require('../utils/levels');
const { withMongoTransaction } = require('../utils/mongoTransaction');
const { referralWithdrawalRestriction } = require('../utils/referralEligibility');

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
  const level = getLevel(totalEarnedPoints);
  const withdrawalProgress = minWithdrawGram > 0
    ? Math.min(100, Math.round((u.gramBalance / minWithdrawGram) * 100))
    : 0;
  const withdrawalRemainingGram = Math.max(0, round6(minWithdrawGram - u.gramBalance));

  res.json({
    success: true,
    totalEarnedPoints,
    level,
    withdrawalProgress,
    withdrawalRemainingGram,
    gramUsdPrice: settings.gramUsdPrice || 0,
    spinCostPoints: settings.spinCostPoints || 30,
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
  const settings = await Settings.getGlobal();
  const todayKey = utcDayKey(new Date());
  let result;
  try {
    result = await withMongoTransaction(async session => {
      const current = await User.findById(req.dbUser._id).session(session);
      if (!current) throw new Error('کاربر پیدا نشد.');
      if (current.lastCheckIn && utcDayKey(current.lastCheckIn) === todayKey) {
        const error = new Error('امروز قبلاً ورود روزانه ثبت شده است.');
        error.code = 'ALREADY_CHECKED_IN';
        throw error;
      }

      const wasYesterday = current.lastCheckIn && utcDayKey(current.lastCheckIn) === todayKey - 1;
      const newStreak = wasYesterday ? current.streak + 1 : 1;
      const bonus = Math.min(newStreak, 30) * settings.streakBonusPoints;
      const earned = settings.dailyCheckInPoints + bonus;
      const gotSpin = newStreak > 0 && newStreak % 7 === 0;
      const inc = { points: earned, totalCheckins: 1 };
      if (gotSpin) inc.spinChances = 1;

      const updated = await User.findOneAndUpdate(
        { _id: current._id, lastCheckIn: current.lastCheckIn || null },
        { $set: { streak: newStreak, lastCheckIn: new Date() }, $inc: inc },
        { new: true, session }
      );
      if (!updated) {
        const error = new Error('امروز قبلاً ورود روزانه ثبت شده است.');
        error.code = 'ALREADY_CHECKED_IN';
        throw error;
      }
      await recordLedgerRequired({
        user: updated._id,
        type: 'checkin',
        amount: earned,
        description: `ورود روزانه (استریک ${updated.streak})`,
        balanceAfter: updated.points,
        sourceId: `checkin:${updated._id}:${todayKey}`,
        session
      });
      return { updated, earned, gotSpin };
    });
  } catch (error) {
    if (error.code === 'ALREADY_CHECKED_IN') return res.status(400).json({ success: false, message: error.message, code: error.code });
    throw error;
  }

  res.json({
    success: true,
    earned: result.earned,
    points: result.updated.points,
    streak: result.updated.streak,
    spinChances: result.updated.spinChances,
    gotSpin: result.gotSpin,
    nextResetAt: nextResetTimestamp()
  });
});

// POST /api/points/spin — چرخاندن گردونه شانس
// body.paid=true → با پوینت (هزینه‌ی spinCostPoints)؛ وگرنه از شانس‌های رایگان استریک
router.post('/spin', auth, async (req, res) => {
  const paid = Boolean(req.body && req.body.paid);
  const settings = await Settings.getGlobal();
  const cost = Math.max(1, Math.floor(settings.spinCostPoints || 30));
  const segmentIndex = paid ? pickWeightedIndex(resolveWeights(settings.paidSpinWeights)) : crypto.randomInt(0, SPIN_SEGMENTS.length);
  const segment = SPIN_SEGMENTS[segmentIndex];
  const spinId = String(req.get('Idempotency-Key') || crypto.randomUUID()).replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 120);
  let updated;
  try {
    updated = await withMongoTransaction(async session => {
      let claimed;
      if (paid) {
        claimed = await User.findOneAndUpdate(
          { _id: req.dbUser._id, points: { $gte: cost } },
          { $inc: { points: -cost } },
          { new: true, session }
        );
        if (!claimed) {
          const error = new Error(`برای چرخاندن گردونه حداقل ${cost} پوینت لازم است.`);
          error.code = 'INSUFFICIENT_BALANCE';
          throw error;
        }
        await recordLedgerRequired({ user: claimed._id, type: 'spin', amount: -cost, description: 'هزینه‌ی چرخاندن گردونه شانس', balanceAfter: claimed.points, sourceId: `spin:${spinId}:cost`, session });
      } else {
        claimed = await User.findOneAndUpdate(
          { _id: req.dbUser._id, spinChances: { $gt: 0 } },
          { $inc: { spinChances: -1 } },
          { new: true, session }
        );
        if (!claimed) {
          const error = new Error('شانس چرخ‌گردون نداری.');
          error.code = 'NO_SPINS';
          throw error;
        }
      }

      let result = claimed;
      if (segment.type === 'points') {
        result = await User.findByIdAndUpdate(claimed._id, { $inc: { points: segment.value } }, { new: true, session });
      } else if (segment.type === 'spin') {
        result = await User.findByIdAndUpdate(claimed._id, { $inc: { spinChances: 1 } }, { new: true, session });
      }
      if (!result) throw new Error('کاربر برای ثبت نتیجه Spin پیدا نشد.');
      if (segment.type === 'points' && segment.value > 0) {
        await recordLedgerRequired({ user: result._id, type: 'spin', amount: segment.value, description: 'برد از گردونه شانس', balanceAfter: result.points, sourceId: `spin:${spinId}:reward`, session });
      }
      return result;
    });
  } catch (error) {
    if (error.code === 'INSUFFICIENT_BALANCE' || error.code === 'NO_SPINS') return res.status(400).json({ success: false, message: error.message, code: error.code });
    throw error;
  }

  res.json({
    success: true,
    paid,
    segmentIndex,
    type: segment.type,
    value: segment.value,
    points: updated.points,
    spinChances: updated.spinChances,
    spinCostPoints: cost
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
    const referralRestriction = referralWithdrawalRestriction(u);
    if (referralRestriction) {
      return res.status(403).json({ success: false, message: referralRestriction, code: 'REFERRAL_ELIGIBILITY_PENDING' });
    }
    const points = Math.floor(Number(body.amount != null ? body.amount : body.points) || 0);

    if (!Number.isFinite(points) || points <= 0) {
      return res.status(400).json({ success: false, message: 'مقدار پوینت نامعتبر است.', code: 'INVALID_AMOUNT' });
    }

    const gramGained = round6(points * settings.rate);
    const exchangeId = String(req.get('Idempotency-Key') || crypto.randomUUID()).replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 120);
    let updated;
    try {
      updated = await withMongoTransaction(async session => {
        const result = await User.findOneAndUpdate(
          { _id: u._id, points: { $gte: points } },
          { $inc: { points: -points, gramBalance: gramGained } },
          { new: true, session }
        );
        if (!result) {
          const error = new Error('موجودی پوینت کافی نیست.');
          error.code = 'INSUFFICIENT_BALANCE';
          throw error;
        }
        await recordLedgerRequired({ user: u._id, type: 'exchange_out', currency: 'points', amount: -points, description: 'تبدیل پوینت به GRAM', balanceAfter: result.points, sourceId: `exchange:${exchangeId}:out`, session });
        await recordLedgerRequired({ user: u._id, type: 'exchange_in', currency: 'gram', amount: gramGained, description: 'تبدیل پوینت به GRAM', balanceAfter: result.gramBalance, sourceId: `exchange:${exchangeId}:in`, session });
        return result;
      });
    } catch (error) {
      if (error.code === 'INSUFFICIENT_BALANCE') return res.status(400).json({ success: false, message: error.message, code: error.code });
      throw error;
    }

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

  const exchangeId = String(req.get('Idempotency-Key') || crypto.randomUUID()).replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 120);
  let updated;
  try {
    updated = await withMongoTransaction(async session => {
      const result = await User.findOneAndUpdate(
        { _id: u._id, gramBalance: { $gte: gramSpent } },
        { $inc: { gramBalance: -gramSpent, points: pointsGained } },
        { new: true, session }
      );
      if (!result) {
        const error = new Error('موجودی GRAM کافی نیست.');
        error.code = 'INSUFFICIENT_BALANCE';
        throw error;
      }
      await recordLedgerRequired({ user: u._id, type: 'exchange_out', currency: 'gram', amount: -gramSpent, description: 'تبدیل GRAM به پوینت', balanceAfter: result.gramBalance, sourceId: `exchange:${exchangeId}:out`, session });
      await recordLedgerRequired({ user: u._id, type: 'exchange_in', currency: 'points', amount: pointsGained, description: 'تبدیل GRAM به پوینت', balanceAfter: result.points, sourceId: `exchange:${exchangeId}:in`, session });
      return result;
    });
  } catch (error) {
    if (error.code === 'INSUFFICIENT_BALANCE') return res.status(400).json({ success: false, message: error.message, code: error.code });
    throw error;
  }

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
  const referralRestriction = referralWithdrawalRestriction(u);
  if (referralRestriction) {
    return res.status(403).json({ success: false, message: referralRestriction, code: 'REFERRAL_ELIGIBILITY_PENDING' });
  }
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

  let updated;
  let withdrawal;
  try {
    ({ updated, withdrawal } = await withMongoTransaction(async session => {
      const nextUser = await User.findOneAndUpdate(
        { _id: u._id, gramBalance: { $gte: amount } },
        { $inc: { gramBalance: -amount }, $set: { walletAddress } },
        { new: true, session }
      );
      if (!nextUser) {
        const error = new Error('موجودی GRAM کافی نیست.');
        error.code = 'INSUFFICIENT_BALANCE';
        throw error;
      }

      const nextWithdrawal = await new Withdrawal({
        user: u._id,
        pointsSpent: settings.rate > 0 ? Math.round(amount / settings.rate) : 0,
        cryptoAmount: amount,
        address: walletAddress,
        statusHistory: [{ status: 'pending', at: new Date() }]
      }).save({ session });

      await recordLedgerRequired({
        user: u._id,
        type: 'withdraw',
        currency: 'gram',
        amount: -amount,
        description: `درخواست برداشت به ${truncateAddress(walletAddress)}`,
        balanceAfter: nextUser.gramBalance,
        sourceId: `withdrawal:${nextWithdrawal._id}`,
        session
      });
      return { updated: nextUser, withdrawal: nextWithdrawal };
    }));
  } catch (error) {
    if (error.code === 'INSUFFICIENT_BALANCE') return res.status(400).json({ success: false, message: error.message, code: error.code });
    throw error;
  }

  res.json({
    success: true,
    message: 'درخواست برداشت ثبت شد و به‌زودی بررسی می‌شود.',
    gramBalance: updated.gramBalance,
    withdrawalId: withdrawal._id
  });

  // اطلاع‌رسانی فوری ثبت درخواست (جدا از اطلاع‌رسانی تایید/رد که در پنل ادمین است)
  notifyUser(u.telegramId, botText('withdrawalSubmitted', u.language, amount, withdrawal.token || 'GRAM')).catch(() => {});
});

// GET /api/points/withdrawals/:id — جزئیات و Timeline یک برداشت مشخص (فقط برای صاحب همان برداشت)
router.get('/withdrawals/:id', auth, async (req, res) => {
  const withdrawal = await Withdrawal.findOne({ _id: req.params.id, user: req.dbUser._id });
  if (!withdrawal) return res.status(404).json({ success: false, message: 'رکورد پیدا نشد.' });

  res.json({
    success: true,
    withdrawal: {
      _id: withdrawal._id,
      cryptoAmount: withdrawal.cryptoAmount,
      token: withdrawal.token,
      network: withdrawal.network,
      status: withdrawal.status,
      address: truncateAddress(withdrawal.address),
      txHash: withdrawal.txHash,
      adminNote: withdrawal.status === 'rejected' || withdrawal.status === 'cancelled' ? withdrawal.adminNote : '',
      createdAt: withdrawal.createdAt,
      paidAt: withdrawal.paidAt,
      timeline: synthesizeHistory(withdrawal)
    }
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
      // فقط آدرس کوتاه‌شده به بیرون داده می‌شود (مطابق سیاست حریم خصوصی)؛ آدرس کامل کیف‌پول کاربر عمومی نمی‌شود
      toAddress: truncateAddress(w.address),
      fromAddress: truncateAddress(w.fromAddress),
      txHash: w.txHash,
      verified: w.verified,
      date: w.paidAt
    }))
  });
});

module.exports = router;
