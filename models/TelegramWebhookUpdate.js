'use strict';
const mongoose = require('mongoose');

const telegramWebhookUpdateSchema = new mongoose.Schema({
  updateId: { type: Number, required: true, min: 0 },
  updateType: { type: String, default: 'other', maxlength: 40 },
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing', required: true },
  receivedAt: { type: Date, default: Date.now, required: true },
  completedAt: { type: Date, default: null },
  failureCode: { type: String, default: '' }
}, { timestamps: true, minimize: false });

telegramWebhookUpdateSchema.index({ updateId: 1 }, { unique: true, name: 'telegram_update_id_unique' });
// Deliberately no TTL: deleting deduplication records would permit replayed updates.
module.exports = mongoose.model('TelegramWebhookUpdate', telegramWebhookUpdateSchema);
