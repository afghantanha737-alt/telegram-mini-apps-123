const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // telegramId
  pointsAmount: { type: Number, required: true },
  walletAddress: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  processedAt: { type: Date, default: null }
});

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
