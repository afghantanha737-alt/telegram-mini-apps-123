'use strict';

const express = require('express');
const router = express.Router();
require('../utils/asyncHandler').wrapRouter(router);
const Settings = require('../models/Settings');
const { verifyInitData } = require('../utils/telegramAuth');

// Public gate endpoint: it must remain available before normal app authentication.
// When maintenance is disabled, the app is always allowed to continue.
router.get('/access', async (req, res) => {
  const settings = await Settings.getGlobal();
  const enabled = settings.maintenanceEnabled === true;
  if (!enabled) return res.json({ success: true, maintenance: false, allowed: true });

  const initData = req.get('X-Telegram-Init-Data') || req.query.initData || '';
  const verified = verifyInitData(initData, process.env.BOT_TOKEN);
  const telegramId = verified && verified.user && verified.user.id != null
    ? String(verified.user.id)
    : '';
  const allowed = telegramId.length > 0
    && Array.isArray(settings.maintenanceAllowedTelegramIds)
    && settings.maintenanceAllowedTelegramIds.map(String).includes(telegramId);

  if (allowed) return res.json({ success: true, maintenance: true, allowed: true });
  return res.status(423).json({ success: false, maintenance: true, allowed: false, message: 'Mini App در حال بروزرسانی است.' });
});

module.exports = router;
