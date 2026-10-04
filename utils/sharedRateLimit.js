'use strict';
const crypto = require('crypto');
const RateLimitBucket = require('../models/RateLimitBucket');

function rateLimitKey(identity, scope) {
  return crypto.createHash('sha256').update(`${String(scope)}|${String(identity)}`).digest('hex');
}

async function consumeRateLimit(identity, scope, maxRequests, windowMs, nowMs = Date.now(), Model = RateLimitBucket) {
  const now = new Date(nowMs);
  const cutoff = new Date(nowMs - windowMs);
  const key = rateLimitKey(identity, scope);
  const expired = { $lte: [{ $ifNull: ['$resetAt', new Date(0)] }, cutoff] };
  const pipeline = [{ $set: {
    count: { $cond: [expired, 1, { $add: [{ $ifNull: ['$count', 0] }, 1] }] },
    resetAt: { $cond: [expired, now, '$resetAt'] },
    expiresAt: { $cond: [expired, new Date(nowMs + 2 * windowMs), '$expiresAt'] }
  } }];
  let bucket;
  try {
    const result = await Model.collection.findOneAndUpdate({ _id: key }, pipeline, { upsert: true, returnDocument: 'after' });
    bucket = result?.value || result;
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const result = await Model.collection.findOneAndUpdate({ _id: key }, pipeline, { returnDocument: 'after' });
    bucket = result?.value || result;
  }
  const count = Number(bucket?.count || 0);
  return { allowed: count <= maxRequests, count, resetAt: bucket?.resetAt || new Date(nowMs + windowMs) };
}

module.exports = { rateLimitKey, consumeRateLimit };
