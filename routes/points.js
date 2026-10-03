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
const Deposit = require('../models/Deposit');
const { idempotencyTransactionId } = require('../utils/idempotency');
const {
  normalizeTonAddress,
  normalizeTonTxHash,
  amountToNanoGram,
  verifyNativeGramTransfer,
  createDepositReference
} = require('../utils/tonNativeDepositVerify');

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

function getDepositSettingsStatus(settings) {
  const depositWalletAddress = String(settings?.depositWalletAddress || '').trim();
  const minimumDepositGram = Number(settings?.minimumDepositGram);
  const ready = settings?.depositEnabled === true
    && settings?.depositNetwork === 'TON_MAINNET'
    && normalizeTonAddress(depositWalletAddress)
    && amountToNanoGram(minimumDepositGram) != null;
  return { ready: Boolean(ready), depositWalletAddress, minimumDepositGram };
}

// چرخ‌گردون: ۶ خانه
const crypto = require('crypto');

const { SPIN_SEGMENTS, resolveWeights, pickWeightedIndex } = require('../utils/spin');
const { notifyUser } = require('../utils/bot');
const { botText } = require('../utils/botMessages');
const { synthesizeHistory } = require('../utils/withdrawalStatus');
const { getLevel } = require('../utils/levels');
const { withMongoTransaction } = require('../utils/mongoTransaction');
const { executeIdempotently } = require('../utils/idempotency');

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
  let operation;
  const operationKey = String(req.get('Idempotency-Key') || '').trim();
  try {
    operation = await executeIdempotently({
      userId: req.dbUser._id,
      scope: 'spin',
      key: operationKey,
      body: { paid },
      execute: async session => {
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
        await recordLedgerRequired({ user: claimed._id, type: 'spin', amount: -cost, description: 'هزینه‌ی چرخاندن گردونه شانس', balanceAfter: claimed.points, sourceId: `spin:${claimed._id}:${operationKey}:cost`, transactionId: idempotencyTransactionId({ userId: claimed._id, scope: 'spin', key: operationKey, leg: 'cost' }), session });
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
        await recordLedgerRequired({ user: result._id, type: 'spin', amount: segment.value, description: 'برد از گردونه شانس', balanceAfter: result.points, sourceId: `spin:${result._id}:${operationKey}:reward`, transactionId: idempotencyTransactionId({ userId: result._id, scope: 'spin', key: operationKey, leg: 'reward' }), session });
      }
      return { body: {
        success: true,
        paid,
        segmentIndex,
        type: segment.type,
        value: segment.value,
        points: result.points,
        spinChances: result.spinChances,
        spinCostPoints: cost
      } };
      }
    });
  } catch (error) {
    if (error.code === 'INSUFFICIENT_BALANCE' || error.code === 'NO_SPINS') return res.status(400).json({ success: false, message: error.message, code: error.code });
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    throw error;
  }
  res.status(operation.status).json(operation.body);
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
    let operation;
    const operationKey = String(req.get('Idempotency-Key') || '').trim();
    try {
      operation = await executeIdempotently({
        userId: u._id,
        scope: 'exchange_points_to_gram',
        key: operationKey,
        body: { direction, points },
        execute: async session => {
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
        await recordLedgerRequired({ user: u._id, type: 'exchange_out', currency: 'points', amount: -points, description: 'تبدیل پوینت به GRAM', balanceAfter: result.points, sourceId: `exchange:${u._id}:${direction}:${operationKey}:out`, transactionId: idempotencyTransactionId({ userId: u._id, scope: 'exchange_points_to_gram', key: operationKey, leg: 'out' }), session });
        await recordLedgerRequired({ user: u._id, type: 'exchange_in', currency: 'gram', amount: gramGained, description: 'تبدیل پوینت به GRAM', balanceAfter: result.gramBalance, sourceId: `exchange:${u._id}:${direction}:${operationKey}:in`, transactionId: idempotencyTransactionId({ userId: u._id, scope: 'exchange_points_to_gram', key: operationKey, leg: 'in' }), session });
        return { body: {
          success: true,
          direction,
          message: `${points} پوینت به ${gramGained} GRAM تبدیل شد.`,
          points: result.points,
          gramBalance: result.gramBalance,
          gramGained
        } };
        }
      });
    } catch (error) {
      if (error.code === 'INSUFFICIENT_BALANCE') return res.status(400).json({ success: false, message: error.message, code: error.code });
      if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
      throw error;
    }
    return res.status(operation.status).json(operation.body);
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

  let operation;
  const operationKey = String(req.get('Idempotency-Key') || '').trim();
  try {
    operation = await executeIdempotently({
      userId: u._id,
      scope: 'exchange_gram_to_points',
      key: operationKey,
      body: { direction, gram },
      execute: async session => {
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
      await recordLedgerRequired({ user: u._id, type: 'exchange_out', currency: 'gram', amount: -gramSpent, description: 'تبدیل GRAM به پوینت', balanceAfter: result.gramBalance, sourceId: `exchange:${u._id}:${direction}:${operationKey}:out`, transactionId: idempotencyTransactionId({ userId: u._id, scope: 'exchange_gram_to_points', key: operationKey, leg: 'out' }), session });
      await recordLedgerRequired({ user: u._id, type: 'exchange_in', currency: 'points', amount: pointsGained, description: 'تبدیل GRAM به پوینت', balanceAfter: result.points, sourceId: `exchange:${u._id}:${direction}:${operationKey}:in`, transactionId: idempotencyTransactionId({ userId: u._id, scope: 'exchange_gram_to_points', key: operationKey, leg: 'in' }), session });
      return { body: {
        success: true,
        direction,
        message: `${gramSpent} GRAM به ${pointsGained} پوینت تبدیل شد.`,
        points: result.points,
        gramBalance: result.gramBalance,
        pointsGained
      } };
      }
    });
  } catch (error) {
    if (error.code === 'INSUFFICIENT_BALANCE') return res.status(400).json({ success: false, message: error.message, code: error.code });
    if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
    throw error;
  }

  res.status(operation.status).json(operation.body);
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

// Native GRAM deposits use one project-controlled TON Mainnet wallet and a unique invoice comment.
router.get('/deposit/config', auth, async (req, res) => {
  const settings = await Settings.getGlobal();
  const config = getDepositSettingsStatus(settings);
  res.json({
    success: true,
    enabled: config.ready,
    network: 'TON_MAINNET',
    token: 'GRAM',
    depositWalletAddress: config.ready ? config.depositWalletAddress : '',
    minimumDepositGram: config.minimumDepositGram > 0 ? config.minimumDepositGram : null
  });
});

function publicDepositRecord(deposit) {
  return {
    _id: String(deposit._id),
    reference: deposit.reference,
    network: deposit.network,
    token: deposit.token,
    depositWalletAddress: deposit.depositAddressSnapshot,
    minimumDepositGram: deposit.minimumDepositSnapshot,
    amount: deposit.amount,
    txHash: deposit.txHash || deposit.submittedTxHash || '',
    status: deposit.status,
    createdAt: deposit.createdAt,
    verifiedAt: deposit.verifiedAt,
    creditedAt: deposit.creditedAt
  };
}

router.get('/deposits', auth, async (req, res) => {
  const deposits = await Deposit.find({ user: req.dbUser._id, assetType: 'native_gram' })
    .sort({ createdAt: -1 })
    .limit(30)
    .select('reference network token assetType depositAddressSnapshot minimumDepositSnapshot amount submittedTxHash txHash status createdAt verifiedAt creditedAt');
  res.json({ success: true, deposits: deposits.map(publicDepositRecord) });
});

router.post('/deposits', auth, async (req, res) => {
  const settings = await Settings.getGlobal();
  const config = getDepositSettingsStatus(settings);
  if (!config.ready) {
    return res.status(503).json({ success: false, code: 'DEPOSIT_DISABLED', message: 'واریز GRAM روی TON Mainnet در حال حاضر فعال نیست.' });
  }

  // Close any unverified invoice from the former Jetton-only implementation. It is
  // never eligible for Native GRAM credit; changing status releases the legacy
  // one-pending-invoice-per-user unique index without altering balances.
  await Deposit.updateMany(
    { user: req.dbUser._id, status: 'pending', assetType: { $ne: 'native_gram' } },
    { $set: { status: 'rejected', verificationNote: 'legacy_jetton_deposit_disabled', verifiedAt: new Date() } }
  );
  const existing = await Deposit.findOne({ user: req.dbUser._id, assetType: 'native_gram', status: 'pending' }).sort({ createdAt: -1 });
  if (existing) return res.json({ success: true, deposit: publicDepositRecord(existing) });

  let deposit;
  try {
    deposit = await Deposit.create({
      user: req.dbUser._id,
      reference: createDepositReference(),
      network: 'TON_MAINNET',
      token: 'GRAM',
      assetType: 'native_gram',
      depositAddressSnapshot: config.depositWalletAddress,
      minimumDepositSnapshot: config.minimumDepositGram,
      status: 'pending'
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    deposit = await Deposit.findOne({ user: req.dbUser._id, assetType: 'native_gram', status: 'pending' }).sort({ createdAt: -1 });
    if (!deposit) throw error;
    return res.json({ success: true, deposit: publicDepositRecord(deposit) });
  }
  return res.status(201).json({ success: true, deposit: publicDepositRecord(deposit) });
});

router.post('/deposits/:id/verify', auth, async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(String(req.params.id || ''))) {
    return res.status(404).json({ success: false, message: 'درخواست Deposit پیدا نشد.' });
  }
  const deposit = await Deposit.findOne({ _id: req.params.id, user: req.dbUser._id, assetType: 'native_gram' });
  if (!deposit) return res.status(404).json({ success: false, message: 'درخواست Deposit پیدا نشد.' });
  if (deposit.status === 'confirmed') {
    const user = await User.findById(req.dbUser._id).select('gramBalance');
    return res.json({ success: true, alreadyConfirmed: true, status: 'confirmed', amount: deposit.amount, gramBalance: user?.gramBalance ?? 0, deposit: publicDepositRecord(deposit) });
  }
  if (deposit.status === 'rejected') {
    return res.status(409).json({ success: false, code: 'DEPOSIT_REJECTED', status: 'rejected', deposit: publicDepositRecord(deposit), message: 'این واریز با حداقل مبلغ لازم مطابقت ندارد و اعتباری اضافه نشده است.' });
  }

  const submittedHash = normalizeTonTxHash(req.body?.txHash);
  if (!submittedHash) {
    return res.status(400).json({ success: false, code: 'INVALID_TON_TX_HASH', message: 'Transaction ID باید hash معتبر TON (۶۴ رقم hexadecimal یا Base64 معادل آن) باشد.' });
  }

  let verification;
  try {
    verification = await verifyNativeGramTransfer({
      txHash: submittedHash,
      depositAddress: deposit.depositAddressSnapshot,
      reference: deposit.reference
    });
  } catch {
    return res.status(503).json({ success: false, code: 'TON_PROVIDER_UNAVAILABLE', message: 'TON Center در دسترس نیست؛ موجودی تغییر نکرده است. دوباره تلاش کنید.' });
  }

  if (verification.status === 'pending') {
    await Deposit.updateOne(
      { _id: deposit._id, user: req.dbUser._id, status: 'pending' },
      { $set: { submittedTxHash: submittedHash, verificationNote: verification.code || 'pending' } }
    );
    return res.status(202).json({
      success: true,
      status: 'pending',
      code: verification.code,
      message: 'تراکنش هنوز در TON Mainnet قابل تأیید نیست. چند لحظه بعد دوباره Check کنید؛ تا تأیید واقعی موجودی اضافه نمی‌شود.'
    });
  }
  if (verification.status !== 'verified') {
    return res.status(400).json({
      success: false,
      code: verification.code || 'DEPOSIT_VERIFICATION_FAILED',
      message: 'تراکنش Native GRAM، آدرس دریافت، Reference یا وضعیت نهایی Mainnet مطابقت ندارد؛ موجودی تغییر نکرد.'
    });
  }

  const minimumRaw = amountToNanoGram(deposit.minimumDepositSnapshot);
  const actualRaw = BigInt(verification.amountRaw);
  if (minimumRaw == null) {
    return res.status(503).json({ success: false, code: 'INVALID_DEPOSIT_SETTINGS', message: 'تنظیم حداقل Deposit با دقت ۹ رقم اعشار Native GRAM سازگار نیست؛ موجودی تغییر نکرد.' });
  }

  if (actualRaw < minimumRaw) {
    try {
      const rejected = await Deposit.findOneAndUpdate(
        { _id: deposit._id, user: req.dbUser._id, status: 'pending', txHashNormalized: { $exists: false } },
        { $set: {
          status: 'rejected', amount: verification.amount, amountRaw: verification.amountRaw,
          submittedTxHash: submittedHash, txHash: verification.txHash, txHashNormalized: verification.txHash,
          sourceAddress: verification.sourceAddress, verificationNote: 'below_minimum', verifiedAt: verification.confirmedAt
        } },
        { new: true }
      );
      if (!rejected) return res.status(409).json({ success: false, code: 'DEPOSIT_ALREADY_PROCESSED', message: 'این تراکنش قبلاً پردازش شده است.' });
      return res.status(400).json({ success: false, code: 'DEPOSIT_BELOW_MINIMUM', status: 'rejected', deposit: publicDepositRecord(rejected), message: 'مبلغ تأییدشده از حداقل Deposit کمتر است؛ هیچ GRAM به موجودی اضافه نشد.' });
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ success: false, code: 'DEPOSIT_TX_ALREADY_USED', message: 'این Transaction Hash قبلاً استفاده شده است.' });
      throw error;
    }
  }

  let outcome;
  try {
    await withMongoTransaction(async session => {
      const now = new Date();
      const claimed = await Deposit.findOneAndUpdate(
        { _id: deposit._id, user: req.dbUser._id, status: 'pending', txHashNormalized: { $exists: false } },
        { $set: {
          status: 'confirmed', amount: verification.amount, amountRaw: verification.amountRaw,
          submittedTxHash: submittedHash, txHash: verification.txHash, txHashNormalized: verification.txHash,
          sourceAddress: verification.sourceAddress, verificationNote: 'confirmed_native_gram_by_toncenter_v3_mainnet',
          verifiedAt: verification.confirmedAt, creditedAt: now
        } },
        { new: true, session }
      );

      if (!claimed) {
        const current = await Deposit.findById(deposit._id).session(session);
        if (current?.status === 'confirmed') {
          outcome = { alreadyConfirmed: true, deposit: current, gramBalance: null };
          return;
        }
        const conflict = new Error('DEPOSIT_ALREADY_PROCESSED');
        conflict.code = 'DEPOSIT_ALREADY_PROCESSED';
        throw conflict;
      }

      const updatedUser = await User.findByIdAndUpdate(
        req.dbUser._id,
        { $inc: { gramBalance: verification.amount } },
        { new: true, session }
      );
      if (!updatedUser) throw new Error('DEPOSIT_USER_NOT_FOUND');

      const ledgerResult = await recordLedgerRequired({
        user: updatedUser._id,
        type: 'deposit',
        currency: 'gram',
        amount: verification.amount,
        description: 'Deposit — Native GRAM on TON Mainnet',
        balanceAfter: updatedUser.gramBalance,
        sourceId: `deposit:${verification.txHash}`,
        transactionId: verification.txHash,
        session
      });
      if (!ledgerResult.created) throw new Error('DEPOSIT_LEDGER_ALREADY_EXISTS');
      outcome = { alreadyConfirmed: false, deposit: claimed, gramBalance: updatedUser.gramBalance };
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, code: 'DEPOSIT_TX_ALREADY_USED', message: 'این Transaction Hash قبلاً برای یک Deposit استفاده شده است.' });
    }
    if (error?.code === 'DEPOSIT_ALREADY_PROCESSED') {
      const current = await Deposit.findById(deposit._id);
      if (current?.status === 'confirmed') {
        const user = await User.findById(req.dbUser._id).select('gramBalance');
        return res.json({ success: true, alreadyConfirmed: true, status: 'confirmed', amount: current.amount, gramBalance: user?.gramBalance ?? 0, deposit: publicDepositRecord(current) });
      }
      return res.status(409).json({ success: false, code: error.code, message: 'این درخواست قبلاً پردازش شده است.' });
    }
    throw error;
  }

  if (outcome?.alreadyConfirmed) {
    const user = await User.findById(req.dbUser._id).select('gramBalance');
    return res.json({
      success: true,
      alreadyConfirmed: true,
      status: 'confirmed',
      amount: outcome.deposit.amount,
      gramBalance: user?.gramBalance ?? 0,
      deposit: publicDepositRecord(outcome.deposit)
    });
  }

  return res.json({
    success: true,
    alreadyConfirmed: Boolean(outcome?.alreadyConfirmed),
    status: 'confirmed',
    amount: verification.amount,
    gramBalance: outcome?.gramBalance,
    deposit: publicDepositRecord(outcome.deposit),
    message: 'واریز Native GRAM در TON Mainnet تأیید شد و موجودی افزایش یافت.'
  });
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

  const [ledgerItems, depositItems] = await Promise.all([
    PointsLedger.find(filter).sort({ createdAt: -1 }).limit(limit + 1).lean(),
    Deposit.find({
      user: req.dbUser._id,
      assetType: 'native_gram',
      status: { $in: ['pending', 'rejected', 'confirmed'] },
      ...(filter.createdAt ? { createdAt: filter.createdAt } : {})
    }).sort({ createdAt: -1 }).limit(limit + 1)
      .select('assetType amount submittedTxHash txHash status createdAt verifiedAt creditedAt')
      .lean()
  ]);
  const depositByHash = new Map(depositItems.filter(item => item.status === 'confirmed' && item.txHash)
    .map(item => [String(item.txHash).toLowerCase(), item]));
  const history = ledgerItems.map(item => {
    if (item.type !== 'deposit') return item;
    const linkedDeposit = depositByHash.get(String(item.transactionId || '').toLowerCase());
    return { ...item, status: 'confirmed', transactionAt: linkedDeposit?.verifiedAt || item.createdAt };
  });
  for (const item of depositItems) {
    if (item.status === 'confirmed') continue;
    history.push({
      _id: item._id,
      type: 'deposit',
      currency: 'gram',
      amount: item.amount,
      transactionId: item.txHash || item.submittedTxHash || '',
      status: item.status,
      description: '',
      createdAt: item.createdAt,
      transactionAt: item.verifiedAt || item.createdAt,
      verifiedAt: item.verifiedAt,
      creditedAt: item.creditedAt
    });
  }
  history.sort((a, b) => {
    const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return timeDiff || String(b._id).localeCompare(String(a._id));
  });
  const page = history.slice(0, limit);

  res.json({
    success: true,
    history: page,
    hasMore: history.length > limit || ledgerItems.length > limit || depositItems.length > limit
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
