'use strict';
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    rate: { type: Number, default: 0.0001 },
    minWithdrawPoints: { type: Number, default: 1000 },
    dailyCheckInPoints: { type: Number, default: 10 },
    streakBonusPoints: { type: Number, default: 2 },
    // قیمت هر ۱ GRAM به دلار؛ برای نمایش «≈ $ USD» در صفحه‌ی خانه. صفر = مخفی
    gramUsdPrice: { type: Number, default: 0, min: 0 },
    // هزینه‌ی یک بار چرخاندن گردونه با پوینت (علاوه بر شانس‌های رایگان استریک)
    spinCostPoints: { type: Number, default: 30, min: 1 },
    // وزن شانس ۶ خانه‌ی گردونه برای چرخش با پوینت (ترتیب: ۲۰، ۴۰، ۶۰، ۱۰۰، پوچ، شانس دوباره)
    paidSpinWeights: { type: [Number], default: () => [30, 20, 8, 2, 30, 10] },
    // یادآوری ورود روزانه: پیش‌فرض خاموش تا خودتان تصمیم بگیرید
    dailyReminderEnabled: { type: Boolean, default: false },
    dailyReminderHourUtc: { type: Number, default: 15, min: 0, max: 23 }
  },
  { timestamps: true }
);

settingsSchema.statics.getGlobal = async function getGlobal() {
  let doc = await this.findOne({ key: 'global' });
  if (!doc) doc = await this.create({ key: 'global' });
  return doc;
};

module.exports = mongoose.model('Settings', settingsSchema);
