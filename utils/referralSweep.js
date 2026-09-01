const User = require('../models/User');
const checkAndAwardReferral = require('./referralCheck');

// هر چند وقت یک‌بار روی همه‌ی کاربرانی که رفرال دارن و هنوز پاداششون پرداخت نشده چک می‌کنه
// این باعث میشه حتی اگه کاربر دعوت‌شده دوباره اپ رو باز نکنه، پاداش دعوت‌کننده بعد از ۲۴ ساعت پرداخت بشه
async function runReferralSweep() {
  try {
    const pendingUsers = await User.find({
      referredBy: { $ne: null },
      referralBonusPaid: false
    });

    for (const user of pendingUsers) {
      await checkAndAwardReferral(user);
    }
  } catch (err) {
    console.error('خطا در بررسی دوره‌ای پاداش رفرال:', err.message);
  }
}

module.exports = runReferralSweep;