'use strict';
const express = require('express');
const router = express.Router();
const { requireTelegramAuth, generateReferralCode } = require('../utils/telegramAuth');
const User = require('../models/User');

const auth = requireTelegramAuth(process.env.BOT_TOKEN);

// GET /api/auth/me — بوت اولیه کاربر + اعمال کد رفرال از URL (fallback وقتی startapp نداریم)
router.get('/me', auth, async (req, res) => {
  try {
    const u = req.dbUser;
    const refFromUrl = String(req.query.ref || '').trim();

    if (!u.referredBy && refFromUrl && refFromUrl !== u.referralCode) {
      const referrer = await User.findOne({ referralCode: refFromUrl }).select('_id telegramId referralIpHash isBanned');
      if (referrer && !referrer.isBanned && String(referrer._id) !== String(u._id)) {
        const update = { $set: { referredBy: referrer._id } };
        if (referrer.referralIpHash && referrer.referralIpHash === req.referralIpHash) {
          update.$addToSet = { referralRiskFlags: 'same_signup_ip' };
        }
        const linked = await User.findOneAndUpdate(
          { _id: u._id, referredBy: null },
          update,
          { new: true }
        );

        if (linked) {
          await User.findByIdAndUpdate(referrer._id, { $inc: { invitedCount: 1 } });
        }
      }
    }

    const current = await User.findById(u._id);
    res.json({
      success: true,
      telegramId: current.telegramId,
      firstName: current.firstName,
      lastName: current.lastName,
      username: current.username,
      photoUrl: current.photoUrl,
      points: current.points,
      referralCode: current.referralCode,
      language: current.language
    });
  } catch (error) {
    console.error('GET /api/auth/me failed:', error);
    res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'خطای سرور در ورود رخ داد.' });
  }
});

// PATCH /api/auth/language — تغییر زبان انتخابی کاربر
router.patch('/language', auth, async (req, res) => {
  try {
    const { language } = req.body || {};
    if (!['fa', 'ps', 'en'].includes(language)) {
      return res.status(400).json({ success: false, message: 'زبان نامعتبر است.' });
    }
    req.dbUser.language = language;
    await req.dbUser.save();
    res.json({ success: true, language });
  } catch (error) {
    console.error('PATCH /api/auth/language failed:', error);
    res.status(500).json({ success: false, code: 'SERVER_ERROR', message: 'تغییر زبان انجام نشد.' });
  }
});

module.exports = router;
