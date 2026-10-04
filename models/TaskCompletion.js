'use strict';
const mongoose = require('mongoose');

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

// Legacy rows may lack user/task. Exclude those malformed historical rows from
// uniqueness enforcement while preserving one completion per valid ObjectId pair.
taskCompletionSchema.index(
  { user: 1, task: 1 },
  {
    name: 'taskcompletion_user_task_unique_objectids',
    unique: true,
    partialFilterExpression: {
      user: { $type: 'objectId' },
      task: { $type: 'objectId' }
    }
  }
);
taskCompletionSchema.index({ user: 1, status: 1, createdAt: -1 });
taskCompletionSchema.index({ task: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('TaskCompletion', taskCompletionSchema);
