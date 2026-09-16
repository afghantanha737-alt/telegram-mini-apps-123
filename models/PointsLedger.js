'use strict';

const mongoose = require('mongoose');

const pointsLedgerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    telegramId: { type: String, required: true, index: true },
    delta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    type: {
      type: String,
      enum: [
        'ad_view',
        'ad_reward',
        'task_reward',
        'daily_checkin',
        'spin_reward',
        'exchange',
        'referral_bonus',
        'withdrawal_audit',
        'admin_adjustment',
        'opening_balance'
      ],
      required: true,
      index: true
    },
    referenceType: { type: String, default: '' },
    referenceId: { type: String, default: '' },
    idempotencyKey: { type: String, default: undefined },
    status: { type: String, enum: ['pending', 'completed'], default: 'completed' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

pointsLedgerSchema.index({ user: 1, createdAt: -1 });
pointsLedgerSchema.index({ referenceType: 1, referenceId: 1 });
pointsLedgerSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('PointsLedger', pointsLedgerSchema);
