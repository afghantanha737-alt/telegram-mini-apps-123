'use strict';

const mongoose = require('mongoose');

const vipPlanSchema = new mongoose.Schema({
  planNumber: { type: Number, required: true, min: 1, max: 10, unique: true, index: true },
  pricePoints: { type: Number, required: true, min: 0, max: 100000000 },
  monthlyRewardPercent: { type: Number, required: true, min: 0, max: 100 },
  durationDays: { type: Number, required: true, min: 1, max: 3650 },
  enabled: { type: Boolean, default: false, index: true },
  comingSoon: { type: Boolean, default: true }
}, { timestamps: true });

vipPlanSchema.index({ enabled: 1, comingSoon: 1, planNumber: 1 });

const DEFAULT_VIP_PLANS = [
  { planNumber: 1, pricePoints: 1000, monthlyRewardPercent: 5, durationDays: 30, enabled: true, comingSoon: false },
  { planNumber: 2, pricePoints: 2000, monthlyRewardPercent: 8, durationDays: 30, enabled: true, comingSoon: false },
  { planNumber: 3, pricePoints: 3000, monthlyRewardPercent: 10, durationDays: 30, enabled: true, comingSoon: false },
  ...Array.from({ length: 7 }, (_, index) => ({
    planNumber: index + 4,
    pricePoints: 0,
    monthlyRewardPercent: 0,
    durationDays: 30,
    enabled: false,
    comingSoon: true
  }))
];

vipPlanSchema.statics.ensureDefaults = async function ensureDefaults() {
  await this.bulkWrite(DEFAULT_VIP_PLANS.map(plan => ({
    updateOne: {
      filter: { planNumber: plan.planNumber },
      update: { $setOnInsert: plan },
      upsert: true
    }
  })), { ordered: true });
};

module.exports = mongoose.model('VipPlan', vipPlanSchema);
