'use strict';

const Task = require('../models/Task');

const VIP_ACTIVATION_REWARDS = Object.freeze({
  1: 50,
  2: 100,
  3: 175,
  4: 250,
  5: 350,
  6: 475,
  7: 625,
  8: 800,
  9: 1000,
  10: 1250
});

function vipActivationTaskDefinition(planNumber) {
  const n = Number(planNumber);
  const reward = VIP_ACTIVATION_REWARDS[n];
  if (!Number.isInteger(n) || !reward) throw new TypeError('Invalid VIP activation plan number');
  return {
    title: `Activate VIP ${n}`,
    description: `Purchase VIP ${n} to unlock this one-time reward.`,
    type: 'custom',
    verifyType: 'manual',
    chatId: '',
    url: '',
    reward,
    taskKind: 'vip_activation',
    vipPlanNumber: n,
    maxCompletions: null,
    isActive: true,
    isSpecialOfDay: false,
    isSponsored: false,
    expiresAt: null
  };
}

async function ensureVipActivationTasks() {
  const operations = Object.keys(VIP_ACTIVATION_REWARDS).map(planNumber => {
    const definition = vipActivationTaskDefinition(planNumber);
    return {
      updateOne: {
        filter: { taskKind: 'vip_activation', vipPlanNumber: definition.vipPlanNumber },
        update: { $setOnInsert: definition },
        upsert: true
      }
    };
  });
  await Task.bulkWrite(operations, { ordered: true });
}

module.exports = { VIP_ACTIVATION_REWARDS, vipActivationTaskDefinition, ensureVipActivationTasks };
