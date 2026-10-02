'use strict';
const mongoose = require('mongoose');

/**
 * وضعیت reactionهای قابل‌شناسایی هر کاربر روی یک پست کانال.
 * این داده از message_reaction updates رسمی Telegram می‌آید؛ anonymous updates ذخیره نمی‌شوند.
 */
const taskReactionStateSchema = new mongoose.Schema({
  chatId: { type: String, required: true },
  messageId: { type: Number, required: true },
  telegramUserId: { type: String, required: true },
  reactionEmojis: { type: [String], default: [] },
  lastAddedReactionEmojis: { type: [String], default: [] },
  lastUpdateId: { type: Number, required: true },
  lastEventAt: { type: Date, required: true },
  lastVerifiedAt: { type: Date, default: null }
}, { timestamps: true });

taskReactionStateSchema.index({ chatId: 1, messageId: 1, telegramUserId: 1 }, { unique: true });
taskReactionStateSchema.index({ chatId: 1, messageId: 1 });

module.exports = mongoose.model('TaskReactionState', taskReactionStateSchema);
