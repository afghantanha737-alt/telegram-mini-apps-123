'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { requireTelegramAuth, generateReferralCode } = require('../utils/telegramAuth');
const User = require('../models/User');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

// GET /api/auth/me — بوت اولیه کاربر + اعمال کد رفرال از URL (fallback وقتی startapp نداریم)
router.get('/me', auth, async (req, res) => {
  const u = req.dbUser;
  const refFromUrl = String(req.query.ref || '').replace(/^ref_/, '').trim();

  // رفرال از طریق URL فقط برای حساب‌های تازه‌ساخته‌شده (۲۴ ساعت اول) پذیرفته می‌شود
  // تا کاربران قدیمی نتوانند بعداً برای خودشان دعوت‌کننده ثبت کنند.
  const isFreshAccount = u.createdAt && Date.now() - new Date(u.createdAt).getTime() < 24 * 60 * 60 * 1000;

  if (!u.referredBy && refFromUrl && refFromUrl !== u.referralCode && isFreshAccount) {
    const referrer = await User.findOne({ referralCode: refFromUrl });
    // جلوگیری از خودارجاعی و دور رفرال (A دعوت‌کننده‌ی B و B دعوت‌کننده‌ی A)
    const isCycle = referrer && referrer.referredBy && String(referrer.referredBy) === String(u._id);
    if (referrer && String(referrer._id) !== String(u._id) && !isCycle) {
      // atomic: فقط اگر هنوز referredBy خالی است ثبت می‌شود؛ پس شمارنده فقط یک‌بار زیاد می‌شود.
      // پاداش اینجا داده نمی‌شود — فقط بعد از تکمیل حداقل تعداد تسک (routes/tasks.js).
      const claimed = await User.findOneAndUpdate(
        { _id: u._id, referredBy: null },
        { $set: { referredBy: referrer._id } },
        { new: true }
      );
      if (claimed) {
        u.referredBy = claimed.referredBy;
        await User.findByIdAndUpdate(referrer._id, { $inc: { invitedCount: 1 } });
      }
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