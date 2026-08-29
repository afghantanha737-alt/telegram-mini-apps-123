const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String, default: '' },
  firstName: { type: String, default: '' },
  points: { type: Number, default: 0 },
  referralCode: { type: String, required: true, unique: true },
  referredBy: { type: String, default: null }, // referralCode of the inviter
  walletAddress: { type: String, default: '' },
  lastCheckIn: { type: Date, default: null },
  streak: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);