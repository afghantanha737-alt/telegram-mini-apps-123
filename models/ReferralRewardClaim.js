'use strict';
const mongoose = require('mongoose');

const referralRewardClaimSchema = new mongoose.Schema(
  {
    taskId: { type: String, required: true },
    claimedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

module.exports = referralRewardClaimSchema;
