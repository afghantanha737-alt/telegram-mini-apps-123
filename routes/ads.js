'use strict';

const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const { requireTelegramAuth } = require('../utils/telegramAuth');
const { applyPointsChange } = require('../utils/pointsLedger');
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
const configuredCooldownSeconds = Number(process.env.ADS_COOLDOWN_SECONDS || 60);
const adsCooldownSeconds = Number.isFinite(configuredCooldownSeconds)
  ? Math.max(1, Math.floor(configuredCooldownSeconds))
  : 60;
const adsCooldownMs = adsCooldownSeconds * 1000;
const adsgramConfigured = /^\d+$/.test(adsgramBlockId) && Boolean(adsgramRewardSecret);
const tadsConfigured = Boolean(tadsWidgetId && tadsWebhookSecret);
const provider = tadsConfigured ? 'tads' : adsgramConfigured ? 'adsgram' : '';

function isValidSecret(value, expectedSecret) {
  if (!expectedSecret || typeof value !== 'string') return false;
  const expected = Buffer.from(expectedSecret);
  const received = Buffer.from(value);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function emptyDailyAds(dayKey) {
  return {
    dayKey,
    watched: 0,
    reward5Awarded: false,
    reward15Awarded: false,
    reward30Awarded: false,
    lastWatchedAt: null,
    processedEventIds: []
  };
}

function getDailyAds(user) {
  const dayKey = utcDayKey();
  if (!user.dailyAds || user.dailyAds.dayKey !== dayKey) return emptyDailyAds(dayKey);
  return {
    dayKey,
    watched: Number(user.dailyAds.watched) || 0,
    reward5Awarded: Boolean(user.dailyAds.reward5Awarded),
    reward15Awarded: Boolean(user.dailyAds.reward15Awarded),
    reward30Awarded: Boolean(user.dailyAds.reward30Awarded),
    lastWatchedAt: user.dailyAds.lastWatchedAt ? new Date(user.dailyAds.lastWatchedAt) : null,
    processedEventIds: Array.isArray(user.dailyAds.processedEventIds)
      ? user.dailyAds.processedEventIds.slice(-100)
      : []
  };
}

function getCooldownSeconds(dailyAds) {
  const lastWatchedAt = dailyAds.lastWatchedAt ? new Date(dailyAds.lastWatchedAt).getTime() : 0;
  if (!Number.isFinite(lastWatchedAt) || !lastWatchedAt) return 0;
  return Math.max(0, Math.ceil((adsCooldownMs - (Date.now() - lastWatchedAt)) / 1000));
}

function normalizeEventId(value, providerName) {
  const text = String(value || '').trim();
  return text ? `${providerName}:${text.slice(0, 240)}` : null;
}

function fallbackEventId(payload, providerName) {
  const cleanPayload = { ...payload };
  delete cleanPayload.token;
  const serialized = JSON.stringify(cleanPayload, Object.keys(cleanPayload).sort());
  const digest = crypto.createHash('sha256').update(serialized).digest('hex');
  return `${providerName}:hash:${digest}`;
}

function serializeProgress(dailyAds) {
  return {
    watched: dailyAds.watched,
    cooldownSeconds: getCooldownSeconds(dailyAds),
    milestones: MILESTONES.map(item => ({
      target: item.target,
      reward: item.reward,
      awarded: Boolean(dailyAds[item.field])
    }))
  };
}

router.get('/config', auth, (req, res) => {
  res.json({
    success: true,
    enabled: Boolean(provider),
    provider,
    blockId: provider === 'adsgram' ? adsgramBlockId : '',
    widgetId: provider === 'tads' ? tadsWidgetId : '',
    debug: provider === 'tads' ? tadsDebug : adsgramDebug,
    cooldownSeconds: adsCooldownSeconds,
    milestones: MILESTONES.map(({ target, reward }) => ({ target, reward }))
  });
});

router.get('/me', auth, (req, res) => {
  res.json({
    success: true,
    ...serializeProgress(getDailyAds(req.dbUser))
  });
});

async function awardAd(telegramId, eventId = null) {
  let session;
  let response = { counted: false };

  session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const user = await User.findOne({ telegramId }).session(session);
      if (!user || user.isBanned) {
        response = { counted: false, code: 'USER_NOT_FOUND' };
        return;
      }

      const dailyAds = getDailyAds(user);

      if (eventId && dailyAds.processedEventIds.includes(eventId)) {
        response = {
          counted: false,
          duplicate: true,
          watched: dailyAds.watched,
          cooldownSeconds: getCooldownSeconds(dailyAds),
          milestones: serializeProgress(dailyAds).milestones
        };
        return;
      }

      const retryAfterSeconds = getCooldownSeconds(dailyAds);
      if (retryAfterSeconds > 0) {
        response = {
          counted: false,
          code: 'AD_COOLDOWN',
          retryAfterSeconds,
          watched: dailyAds.watched,
          cooldownSeconds: retryAfterSeconds,
          milestones: serializeProgress(dailyAds).milestones
        };
        return;
      }

      dailyAds.watched += 1;
      dailyAds.lastWatchedAt = new Date();
      if (eventId) {
        dailyAds.processedEventIds = [...dailyAds.processedEventIds, eventId].slice(-100);
      }
      let earned = 0;

      for (const milestone of MILESTONES) {
        if (!dailyAds[milestone.field] && dailyAds.watched >= milestone.target) {
          dailyAds[milestone.field] = true;
          earned += milestone.reward;
        }
      }

      const updated = await applyPointsChange({
        userId: user._id,
        delta: earned,
        type: earned > 0 ? 'ad_reward' : 'ad_view',
        referenceType: 'ad',
        referenceId: eventId || `${telegramId}:${dailyAds.watched}`,
        idempotencyKey: `ad:${eventId || `${telegramId}:${dailyAds.watched}`}`,
        metadata: {
          provider: eventId?.split(':')[0] || 'unknown',
          watched: dailyAds.watched,
          earned,
          milestones: serializeProgress(dailyAds).milestones
        },
        extraUpdate: { $set: { dailyAds } },
        session
      });

      response = {
        counted: true,
        watched: dailyAds.watched,
        earned,
        points: updated.user.points,
        cooldownSeconds: adsCooldownSeconds,
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
  if (!adsgramConfigured || !isValidSecret(String(req.query.token || ''), adsgramRewardSecret)) {
    return res.sendStatus(401);
  }

  const telegramId = String(req.query.userid || req.query.userId || '').trim();
  if (!telegramId) return res.sendStatus(400);
   const eventId = normalizeEventId(
    req.query.event_id || req.query.eventId || req.query.reward_id || req.query.rewardId,
    'adsgram'
  ) || fallbackEventId({
    userid: telegramId,
    query: req.query
  }, 'adsgram');

  try {
    return res.json({ success: true, ...(await awardAd(telegramId, eventId)) });
  } catch (error) {
    console.error('AdsGram reward callback failed:', error);
    return res.sendStatus(500);
  }
});

// TADS sends this POST after a fullscreen ad view. The secret in the URL
// prevents arbitrary callers from crediting a Telegram user.
router.post('/tads-webhook', async (req, res) => {
  if (!tadsConfigured || !isValidSecret(String(req.query.token || ''), tadsWebhookSecret)) {
    return res.sendStatus(401);
  }

  const payload = req.body || {};
  const telegramId = String(
    payload.telegram_id || payload.telegramId || payload.user_id || payload.userId || payload.uid || ''
  ).trim();
  const widgetId = String(payload.widget_id || payload.widgetId || payload.wid || '').trim();
  if (!telegramId || widgetId !== tadsWidgetId) return res.sendStatus(400);
  const eventId = normalizeEventId(
    payload.event_id || payload.eventId || payload.view_id || payload.viewId || payload.request_id || payload.requestId,
    'tads'
  ) || fallbackEventId(payload, 'tads');

  try {
    return res.json({ success: true, ...(await awardAd(telegramId, eventId)) });
  } catch (error) {
    console.error('TADS reward webhook failed:', error);
    return res.sendStatus(500);
  }
});

module.exports = router;
