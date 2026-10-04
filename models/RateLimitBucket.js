'use strict';
const mongoose = require('mongoose');

const rateLimitBucketSchema = new mongoose.Schema({
  _id: { type: String },
  count: { type: Number, required: true, default: 0 },
  resetAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }
}, { versionKey: false, timestamps: false });
rateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'rate_limit_expiry' });
module.exports = mongoose.model('RateLimitBucket', rateLimitBucketSchema);
