'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { requireTelegramAuth, generateReferralCode } = require('../utils/telegramAuth');
const User = require('../models/User');
const { hashNetworkIdentifier, assessReferralRisk } = require('../utils/referralRisk');
const { linkReferral } = require('../utils/referralSystem');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

// GET /api/auth/me — بوت اولیه کاربر + اعمال کد رفرال از URL (fallback وقتی startapp نداریم)
router.get('/me', auth, async (req, res) => {
  let u = req.dbUser;
  const refFromUrl = String(req.query.ref || '').replace(/^ref_/, '').trim();

  // رفرال از طریق URL فقط برای حساب‌های تازه‌ساخته‌شده (۲۴ ساعت اول) پذیرفته می‌شود
  // تا کاربران قدیمی نتوانند بعداً برای خودشان دعوت‌کننده ثبت کنند.
  const isFreshAccount = u.createdAt && Date.now() - new Date(u.createdAt).getTime() < 24 * 60 * 60 * 1000;

  if (!u.referredBy && refFromUrl && refFromUrl !== u.referralCode && isFreshAccount) {
    const referrer = await User.findOne({ referralCode: refFromUrl }).select('_id telegramId isBanned signupIpHash');
    // جلوگیری از خودارجاعی و دور رفرال (A دعوت‌کننده‌ی B و B دعوت‌کننده‌ی A)
    const isCycle = referrer && referrer.referredBy && String(referrer.referredBy) === String(u._id);
    if (referrer && !referrer.isBanned && String(referrer._id) !== String(u._id) && !isCycle) {
      const risk = assessReferralRisk({ referrer, signupIpHash: hashNetworkIdentifier(req.ip) });
      await linkReferral({ referredUserId: u._id, referrerId: referrer._id, riskScore: risk.score, riskFlags: risk.flags, source: 'signup' });
      u = await User.findById(u._id);
    }
  }

  res.json({
    success: true,
    telegramId: u.telegramId,
    firstName: u.firstName,
    lastName: u.lastName,
    username: u.username,
    photoUrl: u.photoUrl,
    points: u.points,
    referralCode: u.referralCode,
    language: u.language
  });
});

// PATCH /api/auth/language — تغییر زبان انتخابی کاربر
router.patch('/language', auth, async (req, res) => {
  const { language } = req.body || {};
  if (!['fa', 'ps', 'en'].includes(language)) {
    return res.status(400).json({ success: false, message: 'زبان نامعتبر است.' });
  }
  req.dbUser.language = language;
  await req.dbUser.save();
  res.json({ success: true, language });
});

module.exports = router;
