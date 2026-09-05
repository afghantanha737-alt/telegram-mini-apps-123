const User = require('../models/User');

/**
 * ثبت و پردازش Referral
 *
 * این تابع فقط زمانی Referral را ثبت می‌کند که:
 * - کاربر و معرف معتبر باشند
 * - کاربر خودش معرف خودش نباشد
 * - کاربر قبلاً معرف نداشته باشد
 * - کد Referral واقعاً متعلق به یک کاربر باشد
 *
 * خروجی:
 * {
 *   success: true/false,
 *   linked: true/false,
 *   inviter: User|null,
 *   reason: string
 * }
 */
async function processReferral(user, referralCode) {
  try {
    if (!user || !referralCode) {
      return {
        success: false,
        linked: false,
        inviter: null,
        reason: 'missing_data'
      };
    }

    const code = String(referralCode).trim();

    if (!code) {
      return {
        success: false,
        linked: false,
        inviter: null,
        reason: 'empty_code'
      };
    }

    // اگر کاربر قبلاً معرف دارد، دوباره قابل تغییر نیست.
    if (user.referredBy) {
      return {
        success: true,
        linked: false,
        inviter: null,
        reason: 'already_referred'
      };
    }

    // پیدا کردن صاحب Referral Code
    const inviter = await User.findOne({
      referralCode: code,
      isBanned: { $ne: true }
    });

    if (!inviter) {
      return {
        success: false,
        linked: false,
        inviter: null,
        reason: 'invalid_referral_code'
      };
    }

    // جلوگیری از self-referral
    if (
      String(inviter._id) === String(user._id) ||
      String(inviter.telegramId) === String(user.telegramId)
    ) {
      return {
        success: false,
        linked: false,
        inviter: null,
        reason: 'self_referral'
      };
    }

    /*
     * اتصال کاربر به معرف.
     *
     * شرط referredBy:null/وجود نداشتن باعث می‌شود
     * Referral بعد از اولین اتصال قابل تغییر نباشد.
     */
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: user._id,
        $or: [
          { referredBy: { $exists: false } },
          { referredBy: null },
          { referredBy: '' }
        ]
      },
      {
        $set: {
          referredBy: inviter._id
        }
      },
      {
        new: true
      }
    );

    // اگر همزمان درخواست دیگری Referral را ثبت کرده باشد
    if (!updatedUser) {
      return {
        success: true,
        linked: false,
        inviter: null,
        reason: 'already_referred'
      };
    }

    /*
     * شمارنده دعوت‌ها را اتمیک افزایش می‌دهیم.
     * این روش نسبت به read → modify → save در شرایط concurrent امن‌تر است.
     */
    await User.updateOne(
      { _id: inviter._id },
      {
        $inc: {
          invitedCount: 1
        }
      }
    );

    return {
      success: true,
      linked: true,
      inviter,
      reason: 'referral_linked'
    };
  } catch (error) {
    console.error('Referral processing error:', error);

    return {
      success: false,
      linked: false,
      inviter: null,
      reason: 'server_error'
    };
  }
}

/**
 * فقط بررسی می‌کند Referral Code معتبر است یا خیر.
 * هیچ تغییری در دیتابیس ایجاد نمی‌کند.
 */
async function validateReferralCode(referralCode) {
  try {
    if (!referralCode) return false;

    const code = String(referralCode).trim();

    if (!code) return false;

    const user = await User.findOne({
      referralCode: code,
      isBanned: { $ne: true }
    })
      .select('_id telegramId referralCode')
      .lean();

    return !!user;
  } catch (error) {
    console.error('Referral validation error:', error);
    return false;
  }
}

module.exports = processReferral;
module.exports.processReferral = processReferral;
module.exports.validateReferralCode = validateReferralCode;