'use strict';

const { weekKey } = require('./weeklyLeaderboard');

const TELEGRAM_ID_PATTERN = /^\d{1,20}$/;
const BATCH_SIZE = 20;
const DELAY_MS = 1100;

function isTestEnvironment(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
  const appEnv = String(env.APP_ENV || '').trim().toLowerCase();
  if (appEnv === 'production') return false;
  if (nodeEnv === 'test' || appEnv === 'test') return true;
  try {
    const hostname = new URL(String(env.APP_URL || '')).hostname.toLowerCase();
    return hostname === 'gramup-test.onrender.com' || hostname.endsWith('.gramup-test.onrender.com');
  } catch {
    return false;
  }
}

function shouldRunForWeek(now = new Date()) {
  return now instanceof Date && !Number.isNaN(now.getTime());
}

function eventKeyFor(week, userId) {
  return `weekly-challenge-start:${week}:${userId}`;
}

async function runWeeklyChallengeStartNotification(now = new Date()) {
  if (!isTestEnvironment()) return { sent: 0, skipped: 'non_test_environment' };
  if (!shouldRunForWeek(now)) return { sent: 0, skipped: 'invalid_time' };

  const User = require('../models/User');
  const { botText } = require('./botMessages');
  const { sendNotificationOnce } = require('./notificationDelivery');
  const currentWeek = weekKey(now);
  const candidates = await User.find({
    isBanned: false,
    telegramBlockedAt: null,
    telegramId: { $regex: TELEGRAM_ID_PATTERN }
  }).select('_id telegramId language').lean();

  let sent = 0;
  let duplicate = 0;
  let failed = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(user => sendNotificationOnce({
      eventKey: eventKeyFor(currentWeek, user._id),
      // The existing delivery schema is intentionally reused; eventKey identifies this new event.
      type: 'weekly_reward',
      user: user._id,
      telegramId: user.telegramId,
      text: botText('weeklyChallengeStart', user.language)
    })));
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value?.status === 'sent') sent += 1;
      else if (result.status === 'fulfilled' && result.value?.status === 'duplicate') duplicate += 1;
      else failed += 1;
    });
    if (i + BATCH_SIZE < candidates.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  return { weekKey: currentWeek, sent, duplicate, failed, total: candidates.length };
}

module.exports = { TELEGRAM_ID_PATTERN, eventKeyFor, isTestEnvironment, shouldRunForWeek, runWeeklyChallengeStartNotification };
