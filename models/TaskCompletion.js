'use strict';
const mongoose = require('mongoose');
const crypto = require('crypto');

const taskCompletionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    reward: { type: Number, required: true },
    status: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'approved'
    },
    // file_id تلگرامی اسکرین‌شات ارسالی کاربر (برای تسک‌های manual)
    proofFileId: { type: String, default: '' },
    // Screenshot uploaded by the user; excluded from ordinary queries/API responses.
    proofImage: { type: Buffer, select: false },
    proofMimeType: { type: String, enum: ['', 'image/jpeg', 'image/png', 'image/webp'], default: '' },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: '' },
    adminNote: { type: String, default: '' },
    // Latest Post Engagement keeps one per-user/task state and advances this sequence atomically.
    recurringClaimCount: { type: Number, default: 0, min: 0 },
    lastCompletedAt: { type: Date, default: null },
    nextAvailableAt: { type: Date, default: null },
    lastPostMessageId: { type: Number, default: null },
    lastReactionEventAt: { type: Date, default: null },
    // عکسِ لحظه‌ی تکمیل برای گزارش سود/زیان (تغییر نرخ/قیمت بعداً گزارش قبلی را خراب نمی‌کند)
    revenueUsd: { type: Number, default: 0 }, // دریافتی از تبلیغ‌دهنده برای همین تکمیل (فقط تسک اسپانسری)
    costUsd: { type: Number, default: 0 } // هزینه‌ی دلاریِ پاداشی که به کاربر داده شد
  },
  { timestamps: true }
);

// Historical data may contain multiple completion rows for the same user/task,
// so a unique compound index cannot be built safely during application startup.
// New rows use a deterministic _id to retain database-level concurrency safety.
taskCompletionSchema.statics.idForUserTask = function idForUserTask(userId, taskId) {
  const user = String(userId?._id || userId || '');
  const task = String(taskId?._id || taskId || '');
  if (!mongoose.isValidObjectId(user) || !mongoose.isValidObjectId(task)) {
    throw new TypeError('TaskCompletion requires valid user and task ObjectIds.');
  }
  const digest = crypto.createHash('sha256').update(`gramup:task-completion:${user}:${task}`).digest('hex');
  return new mongoose.Types.ObjectId(digest.slice(0, 24));
};
taskCompletionSchema.index({ user: 1, task: 1 }, { name: 'taskcompletion_user_task_lookup' });
taskCompletionSchema.index({ user: 1, status: 1, createdAt: -1 });
taskCompletionSchema.index({ task: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('TaskCompletion', taskCompletionSchema);
