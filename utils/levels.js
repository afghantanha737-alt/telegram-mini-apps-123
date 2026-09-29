'use strict';

const LEVELS = Object.freeze([
  Object.freeze({ key: 'bronze', minPoints: 0, badge: '🥉', name: 'Bronze' }),
  Object.freeze({ key: 'silver', minPoints: 1000, badge: '🥈', name: 'Silver' }),
  Object.freeze({ key: 'gold', minPoints: 5000, badge: '🥇', name: 'Gold' })
]);

function getLevel(totalEarnedPoints) {
  const points = Math.max(0, Number(totalEarnedPoints) || 0);
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (points >= level.minPoints) current = level;
  }
  const next = LEVELS[LEVELS.indexOf(current) + 1] || null;
  return {
    ...current,
    totalEarnedPoints: points,
    nextMinPoints: next ? next.minPoints : null,
    pointsToNext: next ? Math.max(0, next.minPoints - points) : 0,
    progressPercent: next
      ? Math.min(100, Math.round(((points - current.minPoints) / (next.minPoints - current.minPoints)) * 100))
      : 100
  };
}

module.exports = { LEVELS, getLevel };
