'use strict';
const assert = require('assert');
const { getLevel } = require('../utils/levels');
const { startOfUtcWeek, endOfUtcWeek, weekKey } = require('../utils/weeklyLeaderboard');

assert.strictEqual(getLevel(0).key, 'bronze');
assert.strictEqual(getLevel(999).key, 'bronze');
assert.strictEqual(getLevel(1000).key, 'silver');
assert.strictEqual(getLevel(5000).key, 'gold');
assert.strictEqual(getLevel(2500).pointsToNext, 2500);
assert.strictEqual(getLevel(8000).progressPercent, 100);

const date = new Date('2026-09-30T12:00:00Z');
assert.strictEqual(startOfUtcWeek(date).toISOString(), '2026-09-28T00:00:00.000Z');
assert.strictEqual(endOfUtcWeek(date).toISOString(), '2026-10-05T00:00:00.000Z');
assert.strictEqual(weekKey(date), '2026-09-28');
console.log('ALL PASS — levels and weekly leaderboard dates');
