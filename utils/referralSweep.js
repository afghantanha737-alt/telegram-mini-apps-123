const User = require('../models/User');

/**
 * Referral Sweep
 *
 * این job برای اطمینان از صحت شمارنده invitedCount اجرا می‌شود.
 *
 * دلیل:
 * در شرایط concurrent ممکن است شمارنده Referral و تعداد واقعی
 * کاربران دارای referredBy برای مدت کوتاهی از هم فاصله بگیرند.
 *
 * این تابع:
 * - کاربران دارای Referral را پیدا می‌کند
 * - تعداد واقعی دعوت‌ها را محاسبه می‌کند
 * - invitedCount را با مقدار واقعی هماهنگ می‌کند
 *
 * توجه:
 * این عملیات فقط روی شمارنده Referral کار می‌کند و به points
 * یا موجودی کاربران دست نمی‌زند.
 */

let isRunning = false;

async function runReferralSweep() {
  if (isRunning) {
    console.log('Referral sweep already running, skipping...');
    return;
  }

  isRunning = true;

  try {
    console.log('Starting referral sweep...');

    const users = await User.find({
      isBanned: { $ne: true }
    })
      .select('_id invitedCount')
      .lean();

    let updated = 0;

    for (const user of users) {
      const realInvitedCount = await User.countDocuments({
        referredBy: user._id,
        isBanned: { $ne: true }
      });

      const currentCount = Number(user.invitedCount || 0);

      if (currentCount !== realInvitedCount) {
        await User.updateOne(
          { _id: user._id },
          {
            $set: {
              invitedCount: realInvitedCount
            }
          }
        );

        updated++;
      }
    }

    console.log(
      `Referral sweep completed. Checked: ${users.length}, Updated: ${updated}`
    );

    return {
      success: true,
      checked: users.length,
      updated
    };
  } catch (error) {
    console.error('Referral sweep error:', error);

    return {
      success: false,
      checked: 0,
      updated: 0,
      error: error.message
    };
  } finally {
    isRunning = false;
  }
}

module.exports = runReferralSweep;