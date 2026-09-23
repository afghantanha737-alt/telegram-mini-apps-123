'use strict';
const mongoose = require('mongoose');

/**
 * هر ردیف این کالکشن یک اکشن ادمین است (اضافه/ویرایش/حذف تسک، تایید/رد برداشت،
 * بن/آنبن کاربر، تغییر تنظیمات، ارسال پیام همگانی). چون پروژه یک ADMIN_KEY مشترک دارد
 * (نه حساب جداگانه برای هر ادمین)، فیلد actor از نامی می‌آید که ادمین موقع ورود
 * تایپ کرده (اختیاری، پیش‌فرض "ادمین")، نه یک سیستم احراز هویت کامل چندنفره.
 */
const adminLogSchema = new mongoose.Schema(
  {
    actor: { type: String, default: 'ادمین' },
    action: { type: String, required: true }, // مثلاً 'task_create', 'withdrawal_approve'
    targetType: { type: String, default: '' }, // 'task' | 'withdrawal' | 'user' | 'settings' | 'broadcast'
    targetId: { type: String, default: '' },
    details: { type: String, default: '' }
  },
  { timestamps: true }
);

adminLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminLog', adminLogSchema);
