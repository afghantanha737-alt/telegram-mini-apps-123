'use strict';
const express = require('express');
const router = express.Router();
const { requireTelegramAuth } = require('../utils/telegramAuth');
const Settings = require('../models/Settings');
const Withdrawal = require('../models/Withdrawal');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

router.get('/me', auth, async (req, res) => {
  const u = req.dbUser;
  const settings = await Settings.getGlobal();

  let canCheckIn = true;
  if (u.lastCheckIn) {
    canCheckIn = startOfDay(u.lastCheckIn).getTime() < startOfDay(new Date()).getTime();
  }

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
    minWithdrawPoints: settings.minWithdrawPoints
  });
});

router.post('/checkin', auth, async (req, res) => {
  const u = req.dbUser;
  const settings = await Settings.getGlobal();
  const today = startOfDay(new Date());

  if (u.lastCheckIn && startOfDay(u.lastCheckIn).getTime() === today.getTime()) {
    return res.status(400).json({ success: false, message: 'امروز قبلاً ورود روزانه ثبت شده است.' });
  }

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const wasYesterday = u.lastCheckIn && startOfDay(u.lastCheckIn).getTime() === yesterday.getTime();

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
    gotSpin
  });
});

router.post('/withdraw', auth, async (req, res) => {
  const u = req.dbUser;
  const settings = await Settings.getGlobal();
  const { points, address } = req.body || {};
  const amount = Math.floor(Number(points));

  if (!amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'مقدار پوینت نامعتبر است.' });
  }
  if (!address || String(address).trim().length < 6) {
    return res.status(400).json({ success: false, message: 'آدرس کیف پول نامعتبر است.' });
  }
  if (amount < settings.minWithdrawPoints) {
    return res.status(400).json({
      success: false,
      message: `حداقل مقدار برداشت ${settings.minWithdrawPoints} پوینت است.`
    });
  }
  if (amount > u.points) {
    return res.status(400).json({ success: false, message: 'موجودی کافی نیست.' });
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

router.get('/withdrawals', auth, async (req, res) => {
  const list = await Withdrawal.find({ user: req.dbUser._id }).sort({ createdAt: -1 }).limit(30);
  res.json({ success: true, withdrawals: list });
});

module.exports = router;