'use strict';
const crypto = require('crypto');

/**
 * وزن شانس هر خانه برای «چرخش با پوینت» (به همان ترتیب SPIN_SEGMENTS؛ مجموع = ۱۰۰).
 * چرخش‌های رایگان استریک با شانس مساوی (هر خانه ۱/۶) انجام می‌شوند که میانگین بازده‌شان ≈ ۴۴ پوینت است؛
 * اگر چرخش با پوینت هم همان شانس مساوی داشت، هر چرخش ۳۰ پوینتی به‌طور میانگین ≈ ۱۴ پوینت سود می‌داد
 * و کاربران می‌توانستند بی‌نهایت پوینت (و در نهایت GRAM) تولید کنند.
 * با این وزن‌ها میانگین بازده هر چرخش پولی ≈ ۲۵٫۲ پوینت است (حدود ۱۶٪ به نفع سیستم در هزینه‌ی ۳۰).
 * (۲۰:۳۰٪ ، ۴۰:۲۰٪ ، ۶۰:۸٪ ، ۱۰۰:۲٪ ، پوچ:۳۰٪ ، شانس دوباره:۱۰٪ — شانس دوباره یک چرخش رایگان با شانس مساوی است)
 */
const PAID_SPIN_WEIGHTS = [30, 20, 8, 2, 30, 10];

function pickWeightedIndex(weights) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = crypto.randomInt(0, total);
  for (let i = 0; i < weights.length; i += 1) {
    if (roll < weights[i]) return i;
    roll -= weights[i];
  }
  return weights.length - 1;
}

module.exports = { PAID_SPIN_WEIGHTS, pickWeightedIndex };
