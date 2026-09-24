'use strict';
const mongoose = require('mongoose');

/**
 * کانال/گروه‌های اجباری: کاربر برای استفاده از مینی‌اپ باید عضو همه‌ی موارد «فعال» باشد.
 * وضعیت عضویت هر کاربر هرگز اینجا ذخیره نمی‌شود — همیشه از خود تلگرام (getChatMember) پرسیده می‌شود.
 * فیلدهای lastCheck* فقط برای دیدن سلامت اتصال ربات در پنل ادمین هستند.
 */
const requiredChannelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    username: { type: String, default: '', trim: true }, // بدون @  (مثلاً GramUpOfficial)
    chatId: { type: String, default: '', trim: true }, // مثلاً -1001234567890 (اختیاری؛ اگر خالی باشد از username استفاده می‌شود)
    url: { type: String, required: true, trim: true }, // لینک عمومی/دعوت برای دکمه‌ی «عضویت»
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },

    lastCheckOk: { type: Boolean, default: null }, // آیا آخرین بار ربات توانست عضویت را بررسی کند؟
    lastCheckError: { type: String, default: '' },
    lastCheckAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('RequiredChannel', requiredChannelSchema);
