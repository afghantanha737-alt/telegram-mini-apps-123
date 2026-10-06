'use strict';

/**
 * متن‌های پیام‌های ربات (نه رابط کاربری وب) — با توجه به زبان انتخابی هر کاربر (user.language).
 * جدا از public/js/i18n.js نگه داشته شده چون این‌ها روی سرور اجرا می‌شوند، نه در مرورگر.
 */
const MESSAGES = {
  welcome: {
    fa: name => `سلام ${name} 👋\nبه Gramup خوش آمدی!\nبا انجام تسک‌ها، دعوت دوستان و ورود روزانه، پوینت جمع کن و به GRAM تبدیلش کن.`,
    ps: name => `سلام ${name} 👋\nGramup ته ښه راغلاست!\nد دندو ترسره کولو، ملګرو بلنې او ورځني ننوتلو سره پوائنټونه راټول کړئ او GRAM ته یې بدل کړئ.`,
    en: name => `Hi ${name} 👋\nWelcome to Gramup!\nComplete tasks, invite friends and check in daily to earn points and convert them to GRAM.`
  },
  taskNew: {
    fa: (title, reward, sponsorName) => `🎯 ${sponsorName ? 'تسک اسپانسری جدید' : 'تسک جدید'} اضافه شد!\n\n${title}${sponsorName ? `\nاسپانسر: ${sponsorName}` : ''}\nپاداش: ${reward} پوینت\n\nهمین حالا از تب «تسک‌ها» انجامش بده.`,
    ps: (title, reward, sponsorName) => `🎯 ${sponsorName ? 'نوې سپانسر شوې دنده' : 'نوې دنده'} اضافه شوه!\n\n${title}${sponsorName ? `\nسپانسر: ${sponsorName}` : ''}\nپاداش: ${reward} پوائنټ\n\nاوس مهال یې د «دندې» ټب څخه ترسره کړئ.`,
    en: (title, reward, sponsorName) => `🎯 ${sponsorName ? 'New sponsored task' : 'New task'} added!\n\n${title}${sponsorName ? `\nSponsor: ${sponsorName}` : ''}\nReward: ${reward} points\n\nDo it now from the Tasks tab.`
  },
  withdrawalApproved: {
    fa: (amount, token, txHash) => `✅ برداشت شما تایید و پرداخت شد!\n\nمبلغ: ${amount} ${token}\nTxID: ${txHash}\n\nمی‌تونی تراکنش رو تو تاریخچه‌ی کیف‌پولت هم ببینی.`,
    ps: (amount, token, txHash) => `✅ ستاسو ایستل تایید او تادیه شو!\n\nمقدار: ${amount} ${token}\nTxID: ${txHash}\n\nتاسو دا ټرانزکشن د خپل والټ تاریخچه کې هم لیدلی شئ.`,
    en: (amount, token, txHash) => `✅ Your withdrawal was approved and paid!\n\nAmount: ${amount} ${token}\nTxID: ${txHash}\n\nYou can also see it in your wallet history.`
  },
  withdrawalRejected: {
    fa: reason => `❌ درخواست برداشت شما رد شد و GRAM به موجودی حسابت برگشت.${reason ? `\nدلیل: ${reason}` : ''}`,
    ps: reason => `❌ ستاسو د ایستلو غوښتنه رد شوه او GRAM ستاسو حساب ته بیرته ورغلل.${reason ? `\nدلیل: ${reason}` : ''}`,
    en: reason => `❌ Your withdrawal request was rejected and the GRAM was refunded to your balance.${reason ? `\nReason: ${reason}` : ''}`
  },
  withdrawalSubmitted: {
    fa: (amount, token) => `💰 درخواست برداشت شما ثبت شد.\n\nمبلغ: ${amount} ${token}\nوضعیت: در انتظار بررسی\n\nدرخواست شما برای بررسی دستی ارسال شده است.`,
    ps: (amount, token) => `💰 ستاسو د ایستلو غوښتنه ثبت شوه.\n\nمقدار: ${amount} ${token}\nوضعیت: د کتنې په تمه\n\nستاسو غوښتنه د لاسي کتنې لپاره لیږل شوې.`,
    en: (amount, token) => `💰 Your withdrawal request was submitted.\n\nAmount: ${amount} ${token}\nStatus: Pending review\n\nYour request has been sent for manual review.`
  },
  withdrawalStatusApproved: {
    fa: amount => `✅ درخواست برداشت شما تأیید شد.\n\nمبلغ: ${amount}\n\nدرخواست شما برای پرداخت تأیید شده است.`,
    ps: amount => `✅ ستاسو د ایستلو غوښتنه تایید شوه.\n\nمقدار: ${amount}\n\nستاسو غوښتنه د تادیې لپاره تایید شوې ده.`,
    en: amount => `✅ Your withdrawal request was approved.\n\nAmount: ${amount}\n\nYour request has been approved for payment.`
  },
  withdrawalStatusProcessing: {
    fa: amount => `⏳ پرداخت برداشت شما در حال پردازش است.\n\nمبلغ: ${amount}\n\nپس از تکمیل پرداخت، وضعیت درخواست شما به‌روزرسانی خواهد شد.`,
    ps: amount => `⏳ ستاسو د ایستلو تادیه پروسس کیږي.\n\nمقدار: ${amount}\n\nد تادیې له بشپړیدو وروسته، ستاسو د غوښتنې حالت به تازه شي.`,
    en: amount => `⏳ Your withdrawal payment is being processed.\n\nAmount: ${amount}\n\nYour request status will update once payment is complete.`
  },
  withdrawalStatusCancelled: {
    fa: (amount, reason) => `⚠️ درخواست برداشت شما لغو شد.\n\nمبلغ: ${amount}${reason ? `\nدلیل: ${reason}` : ''}\n\nGRAM به موجودی حسابت برگشت.`,
    ps: (amount, reason) => `⚠️ ستاسو د ایستلو غوښتنه لغوه شوه.\n\nمقدار: ${amount}${reason ? `\nدلیل: ${reason}` : ''}\n\nGRAM ستاسو حساب ته بیرته ورغلل.`,
    en: (amount, reason) => `⚠️ Your withdrawal request was cancelled.\n\nAmount: ${amount}${reason ? `\nReason: ${reason}` : ''}\n\nThe GRAM was refunded to your balance.`
  },
  referralBonus: {
    fa: (name, points, balance) => `🎉 تبریک! ${name} تسک‌های لازم رو تکمیل کرد و ${points} پوینت پاداش دعوت به حسابت اضافه شد.\nموجودی فعلی: ${balance} پوینت.`,
    ps: (name, points, balance) => `🎉 مبارک شه! ${name} اړینې دندې بشپړې کړې او ${points} پوائنټ د بلنې ګټه ستاسو حساب ته اضافه شوه.\nاوسنی بیلانس: ${balance} پوائنټ.`,
    en: (name, points, balance) => `🎉 Congrats! ${name} completed the required tasks and you earned ${points} referral bonus points.\nCurrent balance: ${balance} points.`
  },
  referralInitial: {
    fa: (name, points) => `🎉 New Referral\n\nیک کاربر جدید از طریق لینک دعوت شما ثبت‌نام کرد.\n\n👤 کاربر: ${name}\n\n🎁 پاداش شما: ${points} Points\n\nموجودی Points شما به‌روزرسانی شد.`,
    ps: (name, points) => `🎉 New Referral\n\nیو نوی کاروونکی ستاسو د بلنې له لارې ثبت شو.\n\n👤 کاروونکی: ${name}\n\n🎁 ستاسو پاداش: ${points} Points\n\nستاسو د Points موجودي تازه شوه.`,
    en: (name, points) => `🎉 New Referral\n\nA new user registered through your referral link.\n\n👤 User: ${name}\n\n🎁 Your reward: ${points} Points\n\nYour Points balance was updated.`
  },
  dailyReminder: {
    fa: () => `⏰ یادت نره امروز وارد Gramup بشی و پاداش روزانه‌ت رو بگیری!\nاستریکت رو از دست نده — هر ۷ روز پیوسته یک شانس گردونه‌ی رایگان می‌گیری.`,
    ps: () => `⏰ مه هېروئ چې نن Gramup ته ننوځئ او خپله ورځنۍ ګټه ترلاسه کړئ!\nخپل پرله‌پسې ورځې مه ورکوئ — هره ۷ ورځې یو وړیا د ګردونې چانس ترلاسه کوئ.`,
    en: () => `⏰ Don't forget to check in on Gramup today and claim your daily reward!\nKeep your streak alive — every 7 days in a row earns a free spin.`
  },
  leaderboardReward: {
    fa: (rank, points) => `🏆 Weekly Challenge Reward\n\nتبریک! شما در Weekly Challenge این هفته مقام ${rank} را کسب کردید.\n\n🎁 جایزه شما: ${points} Points\n\nاین جایزه به حساب شما اضافه شد.`,
    ps: (rank, points) => `🏆 Weekly Challenge Reward\n\nمبارک شه! تاسو په Weekly Challenge کې ${rank} مقام ترلاسه کړ.\n\n🎁 ستاسو پاداش: ${points} Points\n\nدا پاداش ستاسو حساب ته اضافه شو.`,
    en: (rank, points) => `🏆 Weekly Challenge Reward\n\nCongratulations! You secured ${rank}${rank === 1 ? 'st' : rank === 2 ? 'nd' : 'rd'} place in this week's Weekly Challenge.\n\n🎁 Your reward: ${points} Points\n\nThis reward was added to your account.`
  },
  weeklyChallengeStart: {
    fa: () => `🎯 Weekly Challenge شروع شد!\n\nچالش هفتگی جدید آغاز شده است.\nهمین حالا وارد شوید و برای کسب رتبه و جایزه تلاش کنید.`,
    ps: () => `🎯 Weekly Challenge پیل شو!\n\nنوی اوونیزه ننګونه پیل شوې ده.\nهمدا اوس داخل شئ او د مقام او پاداش لپاره هڅه وکړئ.`,
    en: () => `🎯 Weekly Challenge has started!\n\nA new weekly challenge is now live.\nJoin now and compete for the leaderboard rewards.`
  }
};

function botText(key, lang, ...args) {
  const set = MESSAGES[key];
  if (!set) return '';
  const fn = set[lang] || set.fa;
  return fn(...args);
}

module.exports = { botText };
