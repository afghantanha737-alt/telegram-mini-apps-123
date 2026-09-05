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
    streak: { type: Number, default: 0, min: 0 },
    totalCheckins: { type: Number, default: 0, min: 0 },
    lastCheckIn: { type: Date, default: null },
    spinChances: { type: Number, default: 0, min: 0 },

    referralCode: { type: String, required: true, unique: true, index: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    invitedCount: { type: Number, default: 0, min: 0 },

    walletAddress: { type: String, default: '' },
    isBanned: { type: Boolean, default: false }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);