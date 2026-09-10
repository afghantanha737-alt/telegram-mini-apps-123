'use strict';
const express = require('express');
const router = express.Router();
const { requireTelegramAuth, generateReferralCode } = require('../utils/telegramAuth');
const User = require('../models/User');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

// GET /api/auth/me — بوت اولیه کاربر + اعمال کد رفرال از URL (fallback وقتی startapp نداریم)
router.get('/me', auth, async (req, res) => {
  const u = req.dbUser;
  const refFromUrl = String(req.query.ref || '').trim();

  if (!u.referredBy && refFromUrl && refFromUrl !== u.referralCode) {
    const referrer = await User.findOne({ referralCode: refFromUrl });
    if (referrer && String(referrer._id) !== String(u._id)) {
      u.referredBy = referrer._id;
      await u.save();

      // پاداش اینجا داده نمی‌شود — فقط بعد از تکمیل حداقل تعداد تسک لازم
      // توسط همین کاربر (در routes/tasks.js) پرداخت می‌شود. این بلوک فقط
      // یک‌بار اجرا می‌شود چون بعد از اجرا u.referredBy دیگر خالی نیست،
      // پس رفرش/درخواست تکراری تأثیری روی referredBy یا شمارنده ندارد.
      await User.findByIdAndUpdate(referrer._id, { $inc: { invitedCount: 1 } });
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