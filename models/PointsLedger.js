'use strict';
const mongoose = require('mongoose');

/**
 * هر ردیف این کالکشن یک رویداد تغییر موجودی (پوینت یا GRAM) کاربر است.
 * هدف: صفحه‌ی «تاریخچه‌ی تراکنش‌ها» در پروفایل کاربر — که نشان می‌دهد
 * امتیازش دقیقاً از کجا آمده و کجا خرج شده، بدون نیاز به حدس زدن از
 * روی چند کالکشن جدا (Task/Withdrawal/...).
 */
const pointsLedgerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'task',            // پاداش تکمیل تسک
        'checkin',         // پاداش ورود روزانه
        'spin',            // برد پوینت از گردونه شانس
        'referral_bonus',  // پاداش دعوت دوست (وقتی دعوت‌شده به حد نصاب تسک برسد)
        'exchange_out',    // کسر شده در تبدیل (پوینت->GRAM یا GRAM->پوینت)
        'exchange_in',     // اضافه شده در تبدیل
        'withdraw',        // کسر GRAM بابت درخواست برداشت
        'admin_adjust'     // اصلاح دستی توسط ادمین (مثلاً بازگشت وجه بعد از رد برداشت)
      ],
      required: true
    },
    currency: { type: String, enum: ['points', 'gram'], default: 'points' },
    // مقدار با علامت: مثبت یعنی اضافه شدن، منفی یعنی کسر شدن
    amount: { type: Number, required: true },
    description: { type: String, default: '' },
    // موجودی همان ارز بلافاصله بعد از این رویداد (برای نمایش در UI، اختیاری)
    balanceAfter: { type: Number, default: null }
  },
  { timestamps: true }
);

pointsLedgerSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('PointsLedger', pointsLedgerSchema);
