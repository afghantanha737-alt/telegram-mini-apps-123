'use strict';

const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const { requireTelegramAuth } = require('../utils/telegramAuth');
const { utcDayKey } = require('../utils/dayKey');

const router = express.Router();
const auth = requireTelegramAuth(process.env.BOT_TOKEN);

const MILESTONES = [
  { target: 5, reward: 10, field: 'reward5Awarded' },
  { target: 15, reward: 10, field: 'reward15Awarded' },
  { target: 30, reward: 20, field: 'reward30Awarded' }
];

const adsgramBlockId = String(process.env.ADSGRAM_BLOCK_ID || '').trim();
const adsgramRewardSecret = String(process.env.ADSGRAM_REWARD_SECRET || '').trim();
const adsgramDebug = String(process.env.ADSGRAM_DEBUG || '').toLowerCase() === 'true';
const tadsWidgetId = String(process.env.TADS_WIDGET_ID || '').trim();
const tadsWebhookSecret = String(process.env.TADS_WEBHOOK_SECRET || '').trim();
const tadsDebug = String(process.env.TADS_DEBUG || '').toLowerCase() === 'true';
const adsgramConfigured = /^\d+$/.test(adsgramBlockId) && Boolean(adsgramRewardSecret);
const tadsConfigured = Boolean(tadsWidgetId && tadsWebhookSecret);
const provider = tadsConfigured ? 'tads' : adsgramConfigured ? 'adsgram' : '';

function isValidSecret(value, expectedSecret) {
  if (!expectedSecret || typeof value !== 'string') return false;

  const expected = Buffer.from(expectedSecret);
  const received = Buffer.from(value);

  return expected.length === received.length &&
    crypto.timingSafeEqual(expected, received);
}

function emptyDailyAds(dayKey) {
  return {
    dayKey,
    watched: 0,
    reward5Awarded: false,
    reward15Awarded: false,
    reward30Awarded: false
  };
}

function getDailyAds(user) {
  const dayKey = utcDayKey();

  if (!user.dailyAds || user.dailyAds.dayKey !== dayKey) {
    return emptyDailyAds(dayKey);
  }

  return {
    dayKey,
    watched: Number(user.dailyAds.watched) || 0,
    reward5Awarded: Boolean(user.dailyAds.reward5Awarded),
    reward15Awarded: Boolean(user.dailyAds.reward15Awarded),
    reward30Awarded: Boolean(user.dailyAds.reward30Awarded)
  };
}

function serializeProgress(dailyAds) {
  return {
    watched: dailyAds.watched,
    milestones: MILESTONES.map(item => ({
      target: item.target,
      reward: item.reward,
      awarded: Boolean(dailyAds[item.field])
    }))
  };
}

router.get('/config', (req, res) => {
  res.json({
    success: true,
    enabled: Boolean(provider),
    provider,
    blockId: provider === 'adsgram' ? adsgramBlockId : '',
    widgetId: provider === 'tads' ? tadsWidgetId : '',
    debug: provider === 'tads' ? tadsDebug : adsgramDebug,
    milestones: MILESTONES.map(({ target, reward }) => ({ target, reward }))
  });
});

router.get('/me', auth, (req, res) => {
  res.json({
    success: true,
    ...serializeProgress(getDailyAds(req.dbUser))
  });
});

async function awardAd(telegramId) {
  let session;
  let response = { counted: false };

  session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const user = await User.findOne({ telegramId }).session(session);

      if (!user || user.isBanned) return;

      const dailyAds = getDailyAds(user);
      dailyAds.watched += 1;

      let earned = 0;

      for (const milestone of MILESTONES) {
        if (!dailyAds[milestone.field] && dailyAds.watched >= milestone.target) {
          dailyAds[milestone.field] = true;
          earned += milestone.reward;
        }
      }

      user.dailyAds = dailyAds;
      user.points += earned;

      await user.save({ session });

      response = {
        counted: true,
        watched: dailyAds.watched,
        earned,
        milestones: serializeProgress(dailyAds).milestones
      };
    });

    return response;
  } finally {
    await session.endSession();
  }
}

// AdsGram calls this URL after a real rewarded ad is completed.
router.get('/reward', async (req, res) => {
  if (!adsgramConfigured ||
      !isValidSecret(String(req.query.token || ''), adsgramRewardSecret)) {
    return res.sendStatus(401);
  }

  const telegramId = String(
    req.query.userid || req.query.userId || ''
  ).trim();

  if (!telegramId) return res.sendStatus(400);

  try {
    return res.json({
      success: true,
      ...(await awardAd(telegramId))
    });
  } catch (error) {
    console.error('AdsGram reward callback failed:', error);
    return res.sendStatus(500);
  }
});

// TADS sends this POST after a fullscreen ad view.
router.post('/tads-webhook', async (req, res) => {
  if (!tadsConfigured ||
      !isValidSecret(String(req.query.token || ''), tadsWebhookSecret)) {
    return res.sendStatus(401);
  }

  const payload = req.body || {};
  const telegramId = String(payload.telegram_id || '').trim();
  const widgetId = String(payload.widget_id || '').trim();

  if (!telegramId || widgetId !== tadsWidgetId) {
    return res.sendStatus(400);
  }

  try {
    return res.json({
      success: true,
      ...(await awardAd(telegramId))
    });
  } catch (error) {
    console.error('TADS reward webhook failed:', error);
    return res.sendStatus(500);
  }
});

module.exports = router;