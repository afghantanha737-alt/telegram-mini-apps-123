'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayKey(value) {
  if (value == null || value === '') return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.floor(time / DAY_MS) : null;
}

function wasUtcYesterday(previous, current) {
  const previousKey = utcDayKey(previous);
  const currentKey = utcDayKey(current);
  return previousKey != null && currentKey != null && previousKey === currentKey - 1;
}

module.exports = { DAY_MS, utcDayKey, wasUtcYesterday };
