const mongoose = require('mongoose');

const taskCompletionSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // telegramId
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  pointsAwarded: { type: Number, required: true },
  completedAt: { type: Date, default: Date.now }
});

// هر کاربر فقط یک بار می‌تواند یک تسک مشخص را تکمیل کند
taskCompletionSchema.index({ userId: 1, taskId: 1 }, { unique: true });

module.exports = mongoose.model('TaskCompletion', taskCompletionSchema);
