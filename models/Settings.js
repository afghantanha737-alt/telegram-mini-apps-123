'use strict';
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    rate: { type: Number, default: 0.0001 },
    minWithdrawPoints: { type: Number, default: 1000 },
    dailyCheckInPoints: { type: Number, default: 10 },
    streakBonusPoints: { type: Number, default: 2 }
  },
  { timestamps: true }
);

settingsSchema.statics.getGlobal = async function getGlobal() {
  let doc = await this.findOne({ key: 'global' });
  if (!doc) doc = await this.create({ key: 'global' });
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);