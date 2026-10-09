'use strict';
const mongoose = require('mongoose');

const mobileSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null, index: true },
  lastUsedAt: { type: Date, default: null },
  userAgent: { type: String, default: '' }
}, { timestamps: true });

mobileSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('MobileSession', mobileSessionSchema);
