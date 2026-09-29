'use strict';

const WEEK_MS = 7 * 86400000;

function startOfUtcWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 Sunday, 1 Monday
  const daysSinceMonday = (day + 6) % 7;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - daysSinceMonday * 86400000;
  return new Date(start);
}

function endOfUtcWeek(date = new Date()) {
  return new Date(startOfUtcWeek(date).getTime() + WEEK_MS);
}

function weekKey(date = new Date()) {
  return startOfUtcWeek(date).toISOString().slice(0, 10);
}

module.exports = { startOfUtcWeek, endOfUtcWeek, weekKey };
