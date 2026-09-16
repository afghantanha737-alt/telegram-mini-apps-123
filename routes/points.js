'use strict';

const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { requireTelegramAuth } = require('../utils/telegramAuth');
const { applyPointsChange, operationError } = require('../utils/pointsLedger');
const Settings = require('../models/Settings');
const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const PointsLedger = require('../models/PointsLedger');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

function requestId(req, prefix) {
  const supplied = String(
    req.get('Idempotency-Key') ||
    req.body?.requestId ||
    req.body?.idempotencyKey ||
    ''
  ).trim();
  return `${prefix}:${supplied || crypto.randomUUID()}`.slice(0, 240);
}

function sendRouteError(res, error, fallback = 'خطای سرور رخ داد.') {
  console.error('Points route failed:', error);
  return res.status(error.statusCode || 500).json({
    success: false,
    code: error.code || 'SERVER_ERROR',
    message: error.statusCode ? error.message : fallback
  });
}

/**
 * افغانستان UTC+4:30 است؛ نیمه‌شب UTC همان ریست 04:30 کابل است.
 */
function utcDayKey(date) {
  return Math.floor(new Date(date).getTime() / 86400000);
}

function nextResetTimestamp() {
  return (utcDayKey(new Date()) + 1) * 86400000;
}

const SPIN_SEGMENTS = [
  { type: 'points', value: 10 },
  { type: 'points', value: 25 },
  { type: 'points', value: 50 },
  { type: 'points', value: 30 },
  { type: 'empty', value: 0 },
  { type: 'spin', value: 2 }
];

router.get('/me', auth, async (req, res) => {
  try {
    const u = req.dbUser;
    const settings = await Settings.getGlobal();
    const canCheckIn = !u.lastCheckIn || utcDayKey(u.lastCheckIn) < utcDayKey(new Date());
    const minWithdrawGram = Number((settings.minWithdrawPoints * settings.rate).toFixed(6));

    res.json({
      success: true,
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
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post('/checkin', auth, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    let response;
    await session.withTransaction(async () => {
      const u = await User.findById(req.dbUser._id).session(session);
      if (!u) throw operationError('USER_NOT_FOUND', 'کاربر پیدا نشد.');

      const settings = await Settings.getGlobal();
      const todayKey = utcDayKey(new Date());
      if (u.lastCheckIn && utcDayKey(u.lastCheckIn) === todayKey) {
        throw operationError('ALREADY_CHECKED_IN', 'امروز قبلاً ورود روزانه ثبت شده است.');
      }

      const wasYesterday = u.lastCheckIn && utcDayKey(u.lastCheckIn) === todayKey - 1;
      const streak = wasYesterday ? u.streak + 1 : 1;
      const bonus = Math.min(streak, 30) * settings.streakBonusPoints;
      const earned = settings.dailyCheckInPoints + bonus;
      const gotSpin = streak > 0 && streak % 7 === 0;
      const updated = await applyPointsChange({
        userId: u._id,
        delta: earned,
        type: 'daily_checkin',
        referenceType: 'checkin',
        referenceId: `${u._id}:${todayKey}`,
        idempotencyKey: `checkin:${u._id}:${todayKey}`,
        metadata: { dayKey: todayKey, streak, gotSpin },
        extraUpdate: {
          $inc: { totalCheckins: 1, spinChances: gotSpin ? 1 : 0 },
          $set: { streak, lastCheckIn: new Date() }
        },
        session
      });
      response = {
        success: true,
        earned,
        points: updated.user.points,
        streak,
        spinChances: updated.user.spinChances,
        gotSpin,
        nextResetAt: nextResetTimestamp()
      };
    });
    res.json(response);
  } catch (error) {
    sendRouteError(res, error, 'ثبت ورود روزانه انجام نشد.');
  } finally {
    await session.endSession();
  }
});

router.post('/spin', auth, async (req, res) => {
  const segmentIndex = Math.floor(Math.random() * SPIN_SEGMENTS.length);
  const segment = SPIN_SEGMENTS[segmentIndex];
  const spinRequestId = requestId(req, 'spin');
  const session = await mongoose.startSession();
  try {
    let response;
    await session.withTransaction(async () => {
      const u = await User.findById(req.dbUser._id).session(session);
      if (!u) throw operationError('USER_NOT_FOUND', 'کاربر پیدا نشد.');

      const updated = await applyPointsChange({
        userId: u._id,
        delta: segment.type === 'points' ? segment.value : 0,
        type: 'spin_reward',
        referenceType: 'spin',
        referenceId: spinRequestId,
        idempotencyKey: spinRequestId,
        metadata: { segmentIndex, segmentType: segment.type, value: segment.value },
        extraFilter: { spinChances: { $gte: 1 } },
        extraUpdate: {
          $inc: { spinChances: segment.type === 'spin' ? 0 : -1 }
        },
        session
      });

      if (updated.duplicate) {
        response = {
          success: true,
          duplicate: true,
          segmentIndex,
          type: segment.type,
          value: segment.value,
          points: updated.user.points,
          spinChances: updated.user.spinChances
        };
        return;
      }

      response = {
        success: true,
        segmentIndex,
        type: segment.type,
        value: segment.value,
        points: updated.user.points,
        spinChances: updated.user.spinChances
      };
    });
    res.json(response);
  } catch (error) {
    if (!error.code && error.message === 'User not found') error.code = 'USER_NOT_FOUND';
    sendRouteError(res, error, 'چرخاندن گردونه انجام نشد.');
  } finally {
    await session.endSession();
  }
});

router.post('/exchange', auth, async (req, res) => {
  const points = Math.floor(Number(req.body?.points || 0));
  if (!points || points <= 0) {
    return res.status(400).json({ success: false, message: 'مقدار پوینت نامعتبر است.', code: 'INVALID_AMOUNT' });
  }

  const settings = await Settings.getGlobal();
  const gramGained = Number((points * settings.rate).toFixed(6));
  const exchangeRequestId = requestId(req, 'exchange');
  const session = await mongoose.startSession();
  try {
    let response;
    await session.withTransaction(async () => {
      const updated = await applyPointsChange({
        userId: req.dbUser._id,
        delta: -points,
        type: 'exchange',
        referenceType: 'exchange',
        referenceId: exchangeRequestId,
        idempotencyKey: exchangeRequestId,
        metadata: { points, rate: settings.rate, gramGained },
        extraUpdate: { $inc: { gramBalance: gramGained } },
        session
      });
      response = {
        success: true,
        message: `${points} پوینت به ${gramGained} GRAM تبدیل شد.`,
        points: updated.user.points,
        gramBalance: Number(updated.user.gramBalance.toFixed(6)),
        gramGained
      };
    });
    res.json(response);
  } catch (error) {
    sendRouteError(res, error, 'تبدیل پوینت انجام نشد.');
  } finally {
    await session.endSession();
  }
});

router.post('/withdraw', auth, async (req, res) => {
  const settings = await Settings.getGlobal();
  const { gram, address } = req.body || {};
  const amount = Number(gram);
  const walletAddress = String(address || '').trim();
  const minWithdrawGram = Number((settings.minWithdrawPoints * settings.rate).toFixed(6));

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ success: false, message: 'مقدار GRAM نامعتبر است.', code: 'INVALID_AMOUNT' });
  }
  if (walletAddress.length < 6 || walletAddress.length > 256) {
    return res.status(400).json({ success: false, message: 'آدرس کیف پول نامعتبر است.', code: 'INVALID_ADDRESS' });
  }
  if (amount < minWithdrawGram) {
    return res.status(400).json({
      success: false,
      message: `حداقل مقدار برداشت ${minWithdrawGram} GRAM است.`,
      code: 'BELOW_MIN_WITHDRAW'
    });
  }

  const withdrawalKey = requestId(req, 'withdrawal');
  const session = await mongoose.startSession();
  try {
    let response;
    await session.withTransaction(async () => {
      const existing = await Withdrawal.findOne({ requestId: withdrawalKey }).session(session);
      if (existing) {
        const current = await User.findById(req.dbUser._id).session(session);
        response = {
          success: true,
          duplicate: true,
          message: 'این درخواست برداشت قبلاً ثبت شده است.',
          gramBalance: current ? Number(current.gramBalance.toFixed(6)) : null,
          withdrawalId: existing._id
        };
        return;
      }

      const u = await User.findOneAndUpdate(
        { _id: req.dbUser._id, gramBalance: { $gte: amount } },
        { $inc: { gramBalance: -amount }, $set: { walletAddress } },
        { new: true, session, runValidators: true }
      );
      if (!u) throw operationError('INSUFFICIENT_BALANCE', 'موجودی GRAM کافی نیست.');

      const [withdrawal] = await Withdrawal.create([{
        user: u._id,
        requestId: withdrawalKey,
        pointsSpent: settings.rate > 0 ? Math.round(amount / settings.rate) : 0,
        cryptoAmount: amount,
        address: walletAddress
      }], { session });

      await applyPointsChange({
        userId: u._id,
        delta: 0,
        type: 'withdrawal_audit',
        referenceType: 'withdrawal',
        referenceId: withdrawal._id,
        idempotencyKey: `withdrawal:${withdrawalKey}`,
        metadata: { amount, address: walletAddress, status: 'pending' },
        session
      });

      response = {
        success: true,
        message: 'درخواست برداشت ثبت شد و به‌زودی بررسی می‌شود.',
        gramBalance: Number(u.gramBalance.toFixed(6)),
        withdrawalId: withdrawal._id
      };
    });
    res.json(response);
  } catch (error) {
    sendRouteError(res, error, 'ثبت درخواست برداشت انجام نشد.');
  } finally {
    await session.endSession();
  }
});

router.get('/withdrawals', auth, async (req, res) => {
  try {
    const list = await Withdrawal.find({ user: req.dbUser._id })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ success: true, withdrawals: list });
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.get('/ledger', auth, async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const before = req.query.before ? new Date(req.query.before) : null;
    const filter = { user: req.dbUser._id };
    if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };

    const entries = await PointsLedger.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, entries, nextBefore: entries.length ? entries[entries.length - 1].createdAt : null });
  } catch (error) {
    sendRouteError(res, error);
  }
});

module.exports = router;
