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
    // عکسِ لحظه‌ی تکمیل برای گزارش سود/زیان (تغییر نرخ/قیمت بعداً گزارش قبلی را خراب نمی‌کند)
    revenueUsd: { type: Number, default: 0 }, // دریافتی از تبلیغ‌دهنده برای همین تکمیل (فقط تسک اسپانسری)
    costUsd: { type: Number, default: 0 } // هزینه‌ی دلاریِ پاداشی که به کاربر داده شد
  },
  { timestamps: true }
);

// ایندکس تکی روی user/task عمداً تعریف نشده: mongoose هر بار بالا آمدن آن‌ها را می‌ساخت و cleanupStaleIndexes در server.js
// دوباره حذفشان می‌کرد (حلقه‌ی ساخت/حذف در هر دیپلوی). ایندکس ترکیبی زیر برای کوئری‌های برنامه کافی است.
taskCompletionSchema.index({ user: 1, task: 1 }, { unique: true });
taskCompletionSchema.index({ user: 1, status: 1, createdAt: -1 });
taskCompletionSchema.index({ task: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('TaskCompletion', taskCompletionSchema);
