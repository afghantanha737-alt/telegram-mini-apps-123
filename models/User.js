'use strict';
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: String, required: true, unique: true, index: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    photoUrl: { type: String, default: '' },

    points: { type: Number, default: 0, min: 0 },
    gramBalance: { type: Number, default: 0, min: 0 },
    streak: { type: Number, default: 0, min: 0 },
    totalCheckins: { type: Number, default: 0, min: 0 },
    lastCheckIn: { type: Date, default: null },
    spinChances: { type: Number, default: 0, min: 0 },

    dailyAds: {
      dayKey: { type: Number, default: null },
      watched: { type: Number, default: 0, min: 0 },
      reward5Awarded: { type: Boolean, default: false },
      reward15Awarded: { type: Boolean, default: false },
      reward30Awarded: { type: Boolean, default: false },
      lastWatchedAt: { type: Date, default: null },
      processedEventIds: { type: [String], default: [] }
    },

    referralCode: { type: String, required: true, unique: true, index: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referralIpHash: { type: String, default: '' },
    referralRiskFlags: { type: [String], default: [] },
    invitedCount: { type: Number, default: 0, min: 0 },
    // پاداش رفرال فقط یک‌بار و فقط بعد از تکمیل حداقل تعداد تسک لازم داده می‌شود
    referralBonusAwarded: { type: Boolean, default: false },
    referralBonusAwardedAt: { type: Date, default: null },

    walletAddress: { type: String, default: '' },
    language: { type: String, enum: ['fa', 'ps', 'en'], default: 'fa' },
    isBanned: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
