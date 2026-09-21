'use strict';
const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pointsSpent: { type: Number, required: true, min: 0 },
    cryptoAmount: { type: Number, required: true, min: 0 },
    address: { type: String, required: true }, // آدرس مقصد (کیف‌پول کاربر)
    network: { type: String, default: 'TON' },
    token: { type: String, default: 'GRAM' },
    fromAddress: { type: String, default: '' }, // آدرس فرستنده؛ از روی خود تراکنش استخراج می‌شود، نه ورودی دستی ادمین
    txHash: { type: String, default: null },
    verified: { type: Boolean, default: false }, // آیا مبلغ/مقصد به‌صورت خودکار روی زنجیره تایید شده یا فقط وجود/موفقیت تراکنش
    verificationNote: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'rejected', 'paid'],
      default: 'pending'
    },
    adminNote: { type: String, default: '' },
    paidAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
