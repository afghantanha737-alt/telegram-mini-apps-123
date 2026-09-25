'use strict';
const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: {
      type: String,
      enum: ['channel', 'group', 'link', 'custom'],
      default: 'link'
    },
    // 'telegram' => بررسی خودکار عضویت با ربات (نیاز به chatId)
    // 'manual'   => کاربر باید اسکرین‌شات بفرستد و ادمین تأیید کند
    verifyType: {
      type: String,
      enum: ['telegram', 'manual'],
      default: 'manual'
    },
    // آیدی عددی یا یوزرنیم کانال/گروه مقصد (فقط برای verifyType=telegram)
    // مثال: "@mychannel" یا "-1001234567890"
    chatId: { type: String, default: '' },
    url: { type: String, default: '' },
    reward: { type: Number, required: true, min: 0 },
    // null یعنی بدون محدودیت ظرفیت. اگر عدد باشد، فقط همین تعداد اول
    // که تسک را با موفقیت کامل می‌کنند پاداش می‌گیرند.
    maxCompletions: { type: Number, default: null, min: 1 },
    // تعداد تکمیل‌های موفق (approved) — به‌صورت atomic در routes/tasks.js افزایش می‌یابد
    completedCount: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },

    // ---- تسک اسپانسری (درآمد): تبلیغ‌دهنده برای هر عضو تاییدشده مبلغی می‌پردازد ----
    isSponsored: { type: Boolean, default: false },
    sponsorName: { type: String, default: '', trim: true },
    sponsorPriceUsd: { type: Number, default: 0, min: 0 }, // دریافتی از تبلیغ‌دهنده به‌ازای هر عضو (دلار) — به کاربر نمایش داده نمی‌شود
    sponsorBudgetUsd: { type: Number, default: 0, min: 0 }, // بودجه‌ی کل تبلیغ‌دهنده (دلار) — ظرفیت = بودجه ÷ قیمت
    // پایان زمانی کمپین (اختیاری؛ برای هر تسکی قابل استفاده است). null = بدون پایان
    expiresAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);