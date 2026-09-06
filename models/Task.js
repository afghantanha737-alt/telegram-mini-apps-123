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
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Task', taskSchema);