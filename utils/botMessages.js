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
  referralBonus: {
    fa: (name, points, balance) => `🎉 تبریک! ${name} تسک‌های لازم رو تکمیل کرد و ${points} پوینت پاداش دعوت به حسابت اضافه شد.\nموجودی فعلی: ${balance} پوینت.`,
    ps: (name, points, balance) => `🎉 مبارک شه! ${name} اړینې دندې بشپړې کړې او ${points} پوائنټ د بلنې ګټه ستاسو حساب ته اضافه شوه.\nاوسنی بیلانس: ${balance} پوائنټ.`,
    en: (name, points, balance) => `🎉 Congrats! ${name} completed the required tasks and you earned ${points} referral bonus points.\nCurrent balance: ${balance} points.`
  },
  dailyReminder: {
    fa: () => `⏰ یادت نره امروز وارد Gramup بشی و پاداش روزانه‌ت رو بگیری!\nاستریکت رو از دست نده — هر ۷ روز پیوسته یک شانس گردونه‌ی رایگان می‌گیری.`,
    ps: () => `⏰ مه هېروئ چې نن Gramup ته ننوځئ او خپله ورځنۍ ګټه ترلاسه کړئ!\nخپل پرله‌پسې ورځې مه ورکوئ — هره ۷ ورځې یو وړیا د ګردونې چانس ترلاسه کوئ.`,
    en: () => `⏰ Don't forget to check in on Gramup today and claim your daily reward!\nKeep your streak alive — every 7 days in a row earns a free spin.`
  }
};

function botText(key, lang, ...args) {
  const set = MESSAGES[key];
  if (!set) return '';
  const fn = set[lang] || set.fa;
  return fn(...args);
}

module.exports = { botText };
