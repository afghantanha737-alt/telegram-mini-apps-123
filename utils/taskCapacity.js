'use strict';

function isTaskCapacityAvailable({ completedCount = 0, maxCompletions = null } = {}) {
  if (maxCompletions == null) return true;
  const completed = Number(completedCount) || 0;
  const maximum = Number(maxCompletions);
  return Number.isFinite(maximum) && maximum > 0 && completed < maximum;
}

function taskCapacityFilter(taskId, now = new Date()) {
  return {
    _id: taskId,
    isActive: true,
    $and: [
      { $or: [{ maxCompletions: null }, { $expr: { $lt: ['$completedCount', '$maxCompletions'] } }] },
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }
    ]
  };
}

module.exports = { isTaskCapacityAvailable, taskCapacityFilter };
