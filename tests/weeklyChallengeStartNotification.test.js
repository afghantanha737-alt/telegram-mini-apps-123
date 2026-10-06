'use strict';

const assert = require('assert');
const { weekKey } = require('../utils/weeklyLeaderboard');
const { botText } = require('../utils/botMessages');
const {
  TELEGRAM_ID_PATTERN,
  eventKeyFor,
  isTestEnvironment,
  shouldRunForWeek
} = require('../utils/weeklyChallengeStartNotification');

const now = new Date('2026-10-05T00:00:00.000Z');
assert.strictEqual(weekKey(now), '2026-10-05');
assert.strictEqual(shouldRunForWeek(now), true);
assert.strictEqual(shouldRunForWeek(new Date('invalid')), false);
assert.strictEqual(isTestEnvironment({ NODE_ENV: '', APP_ENV: 'test', APP_URL: '' }), true);
assert.strictEqual(isTestEnvironment({ NODE_ENV: 'production', APP_ENV: 'production', APP_URL: 'https://gramup-test.onrender.com' }), false);
assert.strictEqual(isTestEnvironment({ NODE_ENV: 'production', APP_ENV: '', APP_URL: 'https://gramup.onrender.com' }), false);
assert.strictEqual(eventKeyFor('2026-10-05', 'user-1'), 'weekly-challenge-start:2026-10-05:user-1');
assert.ok(TELEGRAM_ID_PATTERN.test('708528472'));
assert.ok(!TELEGRAM_ID_PATTERN.test('not-a-telegram-id'));
for (const lang of ['fa', 'ps', 'en']) {
  assert.ok(botText('weeklyChallengeStart', lang).includes('Weekly Challenge'));
}
console.log('ALL PASS — weekly challenge start notification contract');
