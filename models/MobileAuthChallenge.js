'use strict';
const mongoose = require('mongoose');

const mobileAuthChallengeSchema = new mongoose.Schema({
  challengeId: { type: String, required: true, unique: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['pending', 'verified', 'consumed', 'expired'], default: 'pending', index: true },
  telegramId: { type: String, default: '', index: true },
  expiresAt: { type: Date, required: true },
  verifiedAt: { type: Date, default: null },
  consumedAt: { type: Date, default: null }
}, { timestamps: true });

mobileAuthChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('MobileAuthChallenge', mobileAuthChallengeSchema);
