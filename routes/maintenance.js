'use strict';

const express = require('express');
const router = express.Router();
const {
  getMaintenanceState,
  telegramIdFromInitData,
  isAllowedTelegramId
} = require('../utils/maintenance');

router.get('/access', async (req, res) => {
  const state = await getMaintenanceState();
  if (!state.enabled) {
    return res.json({ success: true, maintenance: false, allowed: true });
  }

  const telegramId = telegramIdFromInitData(req.get('X-Telegram-Init-Data'));
  const allowed = isAllowedTelegramId(state, telegramId);
  if (!allowed) {
    return res.status(423).json({ success: false, maintenance: true, allowed: false });
  }
  return res.json({ success: true, maintenance: true, allowed: true });
});

module.exports = router;
