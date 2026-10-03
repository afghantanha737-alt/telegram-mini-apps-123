'use strict';
const mongoose = require('mongoose');
const { DEFAULT_REFERRAL_LEVEL_RATES, DEFAULT_REFERRAL_INITIAL_REWARD_POINTS } = require('../utils/referralCore');

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    rate: { type: Number, default: 0.0001 },
    minWithdrawPoints: { type: Number, default: 1000 },
    dailyCheckInPoints: { type: Number, default: 10 },
    streakBonusPoints: { type: Number, default: 2 },
    gramUsdPrice: { type: Number, default: 0, min: 0 },
    spinCostPoints: { type: Number, default: 30, min: 1 },
    paidSpinWeights: { type: [Number], default: () => [30, 20, 8, 2, 30, 10] },
    dailyReminderEnabled: { type: Boolean, default: false },
    dailyReminderHourUtc: { type: Number, default: 15, min: 0, max: 23 },
    dailyReminderTimezone: { type: String, default: 'UTC' },
    dailyReminderLocalHour: { type: Number, default: 15, min: 0, max: 23 },
    dailyReminderAudience: { type: String, enum: ['all', 'active'], default: 'all' },
    dailyReminderMessage: { type: String, default: '' },
    dailyReminderLastRunAt: { type: Date, default: null },
    dailyReminderLastSentCount: { type: Number, default: 0 },
    dailyReminderLastStatus: { type: String, default: '' },
    dailyReminderLastError: { type: String, default: '' },
    weeklyLeaderboardEnabled: { type: Boolean, default: true },
    weeklyLeaderboardPrizes: { type: [Number], default: () => [500, 250, 100] },
    // TON Mainnet Gram Jetton deposits stay disabled until an administrator supplies verified project addresses.
    depositEnabled: { type: Boolean, default: false },
    depositNetwork: { type: String, enum: ['TON_MAINNET'], default: 'TON_MAINNET' },
    depositWalletAddress: { type: String, default: '' },
    gramJettonMasterAddress: { type: String, default: '' },
    minimumDepositGram: { type: Number, default: 1, min: 0 },
    // Fixed by the current referral policy; retained for backwards compatibility.
    referralInitialRewardPoints: { type: Number, default: DEFAULT_REFERRAL_INITIAL_REWARD_POINTS, min: 0, max: 1000000 },
    referralLevelRates: { type: [Number], default: () => [...DEFAULT_REFERRAL_LEVEL_RATES] }
  },
  { timestamps: true }
);

settingsSchema.statics.getGlobal = async function getGlobal() {
  let doc = await this.findOne({ key: 'global' });
  if (!doc) doc = await this.create({ key: 'global' });
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
