const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const User = require('../models/User');

const REFERRAL_BONUS = 50; // پوینت هدیه ازای هر رفرال تایید‌شده - قابل تغییر
const WAIT_MS = 24 * 60 * 60 * 1000; // ۲۴ ساعت

// بررسی می‌کنه آیا شرایط پرداخت پاداش رفرال برای این کاربر برقرار شده یا نه:
// ۱) همه‌ی تسک‌های فعال رو انجام داده باشه
// ۲) حداقل ۲۴ ساعت از زمان عضویتش (دعوت شدنش) گذشته باشه
// اگه شرایط برقرار بود، پاداش رو به دعوت‌کننده میده و دیگه دوباره تکرار نمیشه
async function checkAndAwardReferral(user) {
  if (!user.referredBy || user.referralBonusPaid) return;

  // شرط اول: ۲۴ ساعت از عضویت گذشته باشه
  if (Date.now() - user.createdAt.getTime() < WAIT_MS) return;

  // شرط دوم: همه‌ی تسک‌های فعلاً فعال رو انجام داده باشه
  const activeTasks = await Task.find({ active: true }).select('_id');
  if (activeTasks.length === 0) return; // اگه هیچ تسک فعالی نیست، نمیشه شرط رو سنجید

  const activeIds = activeTasks.map(t => t._id);
  const completedCount = await TaskCompletion.countDocuments({
    userId: user.telegramId,
    taskId: { $in: activeIds }
  });

  if (completedCount < activeTasks.length) return; // هنوز همه‌ی تسک‌ها رو انجام نداده

  const inviter = await User.findOne({ referralCode: user.referredBy });
  if (!inviter) return;

  inviter.points += REFERRAL_BONUS;
  await inviter.save();

  user.referralBonusPaid = true;
  await user.save();
}

module.exports = checkAndAwardReferral;