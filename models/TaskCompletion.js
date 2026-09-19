'use strict';
const mongoose = require('mongoose');

const taskCompletionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    reward: { type: Number, required: true },
    status: {
      type: String,
      enum: ['approved', 'pending', 'rejected'],
      default: 'approved'
    },
    // file_id تلگرامی اسکرین‌شات ارسالی کاربر (برای تسک‌های manual)
    proofFileId: { type: String, default: '' },
    adminNote: { type: String, default: '' }
  },
  { timestamps: true }
);

taskCompletionSchema.index({ user: 1, task: 1 }, { unique: true });

module.exports = mongoose.model('TaskCompletion', taskCompletionSchema);
