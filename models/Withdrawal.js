'use strict';
const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pointsSpent: { type: Number, required: true, min: 0 },
    cryptoAmount: { type: Number, required: true, min: 0 },
    address: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'paid'],
      default: 'pending'
    },
    adminNote: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Withdrawal', withdrawalSchema);