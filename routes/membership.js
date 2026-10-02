'use strict';
const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const { requireTelegramAuth } = require('../utils/telegramAuth');
const { membership, toPublic } = require('../utils/membership');

// عمداً فقط احراز هویت (بدون gate) تا کاربری که هنوز عضو نشده بتواند وضعیتش را ببیند و بررسی کند
const auth = requireTelegramAuth(process.env.BOT_TOKEN);

async function respond(req, res) {
  // هویت کاربر فقط از initData امضاشده‌ی تلگرام می‌آید (req.dbUser)، نه از ورودی فرانت‌اند.
  // همیشه بررسی تازه از تلگرام (force) — هیچ‌وقت از کش استفاده نمی‌شود.
  let result;
  try {
    result = await membership.check(req.dbUser.telegramId, { force: true });
  } catch (error) {
    console.error('Membership check failed:', error);
    res.set('Cache-Control', 'no-store');
    return res.json({
      success: true,
      required: true,
      verified: false,
      unavailable: true,
      channels: []
    });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...toPublic(result) });
}

// GET /api/required-channels — لیست کانال‌های فعال + وضعیت واقعی و فعلی عضویت همین کاربر
router.get('/', auth, respond);

// POST /api/required-channels/check-membership — دکمه‌ی «بررسی عضویت»
router.post('/check-membership', auth, respond);

module.exports = router;
