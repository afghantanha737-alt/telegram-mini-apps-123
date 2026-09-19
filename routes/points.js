'use strict';
const express = require('express');
const router = express.Router();
const { requireTelegramAuth } = require('../utils/telegramAuth');
const Settings = require('../models/Settings');
const Withdrawal = require('../models/Withdrawal');

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

// چرخ‌گردون: ۶ خانه
const SPIN_SEGMENTS = [
  { type: 'points', value: 2 },
  { type: 'points', value: 5 },
  { type: 'points', value: 15 },
  { type: 'points', value: 20 },
  { type: 'empty', value: 0 },
  { type: 'spin', value: 1 }
];

// GET /api/points/me
router.get('/me', auth, async (req, res) => {
  const u = req.dbUser;
  const settings = await Settings.getGlobal();

  const canCheckIn = !u.lastCheckIn || utcDayKey(u.lastCheckIn) < utcDayKey(new Date());

  res.json({
    success: true,
    points: u.points,
    estimatedCryptoValue: Number((u.points * settings.rate).toFixed(6)),
    rate: settings.rate,
    streak: u.streak,
    canCheckIn,
    spinChances: u.spinChances,
    totalCheckins: u.totalCheckins,
    firstName: u.firstName,
    minWithdrawPoints: settings.minWithdrawPoints,
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
  u.streak = wasYesterday ? u.streak + 1 : 1;

  const bonus = Math.min(u.streak, 30) * settings.streakBonusPoints;
  const earned = settings.dailyCheckInPoints + bonus;

  u.points += earned;
  u.totalCheckins += 1;
  u.lastCheckIn = new Date();

  let gotSpin = false;
  if (u.streak > 0 && u.streak % 7 === 0) {
    u.spinChances += 1;
    gotSpin = true;
  }

  await u.save();

  res.json({
    success: true,
    earned,
    points: u.points,
    streak: u.streak,
    spinChances: u.spinChances,
    gotSpin,
    nextResetAt: nextResetTimestamp()
  });
});

// POST /api/points/spin — چرخاندن گردونه شانس
router.post('/spin', auth, async (req, res) => {
  const u = req.dbUser;

  if (u.spinChances <= 0) {
    return res.status(400).json({ success: false, message: 'شانس چرخ‌گردون نداری.', code: 'NO_SPINS' });
  }

  u.spinChances -= 1;

  const segmentIndex = Math.floor(Math.random() * SPIN_SEGMENTS.length);
  const segment = SPIN_SEGMENTS[segmentIndex];

  if (segment.type === 'points') {
    u.points += segment.value;
  } else if (segment.type === 'spin') {
    u.spinChances += 1; // شانس دوباره: عملاً چیزی از دست نمی‌دهد
  }

  await u.save();

  res.json({
    success: true,
    segmentIndex,
    type: segment.type,
    value: segment.value,
    points: u.points,
    spinChances: u.spinChances
  });
});

// POST /api/points/withdraw
router.post('/withdraw', auth, async (req, res) => {
  const u = req.dbUser;
  const settings = await Settings.getGlobal();
  const { points, address } = req.body || {};
  const amount = Math.floor(Number(points));

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'مقدار پوینت نامعتبر است.', code: 'INVALID_AMOUNT' });
  }
  if (!address || String(address).trim().length < 6) {
    return res.status(400).json({ success: false, message: 'آدرس کیف پول نامعتبر است.', code: 'INVALID_ADDRESS' });
  }
  if (amount < settings.minWithdrawPoints) {
    return res.status(400).json({
      success: false,
      message: `حداقل مقدار برداشت ${settings.minWithdrawPoints} پوینت است.`,
      code: 'BELOW_MIN_WITHDRAW'
    });
  }
  if (amount > u.points) {
    return res.status(400).json({ success: false, message: 'موجودی کافی نیست.', code: 'INSUFFICIENT_BALANCE' });
  }

  u.points -= amount;
  u.walletAddress = String(address).trim();
  await u.save();

  const withdrawal = await Withdrawal.create({
    user: u._id,
    pointsSpent: amount,
    cryptoAmount: Number((amount * settings.rate).toFixed(6)),
    address: u.walletAddress
  });

  res.json({
    success: true,
    message: 'درخواست برداشت ثبت شد و به‌زودی بررسی می‌شود.',
    points: u.points,
    withdrawalId: withdrawal._id
  });
});

// GET /api/points/withdrawals
router.get('/withdrawals', auth, async (req, res) => {
  const list = await Withdrawal.find({ user: req.dbUser._id }).sort({ createdAt: -1 }).limit(30);
  res.json({ success: true, withdrawals: list });
});

module.exports = router;
