'use strict';
const crypto = require('crypto');
const DistributedJobLock = require('../models/DistributedJobLock');

async function withDistributedJobLock(key, work, { leaseMs = 10 * 60 * 1000, Model = DistributedJobLock } = {}) {
  const lockId = String(key || '').trim();
  if (!lockId || typeof work !== 'function') throw new TypeError('A lock key and work function are required.');
  const owner = crypto.randomUUID();
  const now = new Date();
  let result;
  try {
    const updated = await Model.collection.findOneAndUpdate(
      { _id: lockId, leaseUntil: { $lte: now } },
      { $set: { owner, leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true, returnDocument: 'after' }
    );
    result = updated?.value || updated;
  } catch (error) {
    if (error?.code === 11000) return { locked: false, result: undefined };
    throw error;
  }
  if (!result || result.owner !== owner) return { locked: false, result: undefined };

  const heartbeat = setInterval(() => {
    const renewedAt = new Date();
    Model.updateOne({ _id: lockId, owner }, { $set: { leaseUntil: new Date(renewedAt.getTime() + leaseMs), updatedAt: renewedAt } })
      .catch(error => console.error('Distributed job lock renewal failed:', error.message || error));
  }, Math.max(1000, Math.floor(leaseMs / 3)));
  if (heartbeat.unref) heartbeat.unref();
  try {
    return { locked: true, result: await work() };
  } finally {
    clearInterval(heartbeat);
    await Model.deleteOne({ _id: lockId, owner }).catch(error => {
      console.error('Distributed job lock release failed:', error.message || error);
    });
  }
}

module.exports = { withDistributedJobLock };
