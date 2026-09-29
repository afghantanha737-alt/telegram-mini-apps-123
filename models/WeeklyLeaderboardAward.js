'use strict';
const mongoose = require('mongoose');

const weeklyLeaderboardAwardSchema = new mongoose.Schema(
  {
    weekKey: { type: String, required: true },
    rank: { type: Number, required: true, min: 1 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    points: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'processing', 'paid', 'failed'], default: 'pending' },
    paidAt: { type: Date, default: null },
    error: { type: String, default: '' }
  },
  { timestamps: true }
);

weeklyLeaderboardAwardSchema.index({ weekKey: 1, rank: 1 }, { unique: true });
weeklyLeaderboardAwardSchema.index({ weekKey: 1, status: 1 });

module.exports = mongoose.model('WeeklyLeaderboardAward', weeklyLeaderboardAwardSchema);
