'use strict';
const crypto = require('crypto');

/**
 * چرخ‌گردون: ۶ خانه. ترتیب باید با SPIN_SEGMENTS_UI در public/js/app.js یکی باشد.
 */
const SPIN_SEGMENTS = [
  { type: 'points', value: 20 },
  { type: 'points', value: 40 },
  { type: 'points', value: 60 },
  { type: 'points', value: 100 },
  { type: 'empty', value: 0 },
  { type: 'spin', value: 1 }
];

/**
 * وزن شانس هر خانه برای «چرخش با پوینت» (به ترتیب SPIN_SEGMENTS). مقدار پیش‌فرض؛
 * ادمین می‌تواند از پنل (تنظیمات) تغییرش بدهد و در دیتابیس (Settings.paidSpinWeights) ذخیره می‌شود.
 * وزن‌ها عدد صحیح‌اند؛ درصد هر خانه = وزن ÷ مجموع وزن‌ها.
 *
 * چرخش‌های رایگان استریک همیشه شانس مساوی دارند (هر خانه ۱/۶) که میانگین بازده‌شان ۴۴ پوینت است.
 * اگر چرخش پولی هم همان شانس را داشت هر چرخش ۳۰ پوینتی به‌طور میانگین ۱۴ پوینت سود می‌داد؛
 * برای همین سرور اجازه نمی‌دهد وزن‌هایی ذخیره شوند که میانگین بازده را ≥ هزینه‌ی چرخش کنند.
 */
const DEFAULT_PAID_SPIN_WEIGHTS = [30, 20, 8, 2, 30, 10];
const MAX_WEIGHT = 1000;

function isValidWeights(weights) {
  if (!Array.isArray(weights) || weights.length !== SPIN_SEGMENTS.length) return false;
  if (!weights.every(w => Number.isInteger(w) && w >= 0 && w <= MAX_WEIGHT)) return false;
  return weights.reduce((sum, w) => sum + w, 0) > 0;
}

/** وزن‌های معتبر را برمی‌گرداند؛ اگر چیزی ذخیره نشده یا خراب بود، پیش‌فرض */
function resolveWeights(stored) {
  const list = stored ? Array.from(stored).map(Number) : null;
  return isValidWeights(list) ? list : DEFAULT_PAID_SPIN_WEIGHTS.slice();
}

function pickWeightedIndex(weights = DEFAULT_PAID_SPIN_WEIGHTS) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = crypto.randomInt(0, total);
  for (let i = 0; i < weights.length; i += 1) {
    if (roll < weights[i]) return i;
    roll -= weights[i];
  }
  return weights.length - 1;
}

/** میانگین بازده‌ی یک چرخش رایگان (شانس مساوی، با احتساب زنجیره‌ی «شانس دوباره») */
function freeSpinValue() {
  const n = SPIN_SEGMENTS.length;
  const respins = SPIN_SEGMENTS.filter(s => s.type === 'spin').length;
  const pointsSum = SPIN_SEGMENTS.filter(s => s.type === 'points').reduce((sum, s) => sum + s.value, 0);
  return pointsSum / n / (1 - respins / n);
}

/** میانگین پوینتی که یک چرخش پولی با این وزن‌ها به کاربر برمی‌گرداند */
function expectedPaidSpinReturn(weights) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let expected = 0;
  SPIN_SEGMENTS.forEach((segment, i) => {
    const p = weights[i] / total;
    if (segment.type === 'points') expected += p * segment.value;
    else if (segment.type === 'spin') expected += p * freeSpinValue();
  });
  return expected;
}

/**
 * اعتبارسنجی تنظیمات گردونه‌ی پولی قبل از ذخیره (توسط پنل ادمین صدا زده می‌شود).
 * اگر میانگین جایزه ≥ هزینه‌ی چرخش باشد، کاربران می‌توانند بی‌نهایت پوینت تولید کنند و ذخیره رد می‌شود.
 */
function checkSpinSettings(weights, cost) {
  if (!isValidWeights(weights)) {
    return { error: 'وزن شانس گردونه نامعتبر است: ۶ عدد صحیح بین ۰ تا ۱۰۰۰ لازم است و مجموعشان باید بیشتر از صفر باشد.' };
  }
  const expected = expectedPaidSpinReturn(weights);
  if (expected >= cost) {
    return {
      expected,
      error: `با این تنظیمات میانگین جایزه‌ی هر چرخش (${expected.toFixed(1)} پوینت) بیشتر یا برابر هزینه‌ی چرخش (${cost} پوینت) می‌شود و کاربران می‌توانند با چرخاندن پوینت تولید کنند. ذخیره نشد؛ هزینه را بیشتر یا شانس خانه‌های بزرگ را کمتر کنید.`
    };
  }
  return { expected };
}

/** اطلاعات لازم برای نمایش پیش‌نمایش در پنل ادمین */
function spinModel() {
  return {
    segments: SPIN_SEGMENTS.map(s => ({ type: s.type, value: s.value })),
    freeSpinValue: freeSpinValue(),
    defaultWeights: DEFAULT_PAID_SPIN_WEIGHTS.slice(),
    maxWeight: MAX_WEIGHT
  };
}

module.exports = {
  SPIN_SEGMENTS,
  DEFAULT_PAID_SPIN_WEIGHTS,
  isValidWeights,
  resolveWeights,
  pickWeightedIndex,
  freeSpinValue,
  expectedPaidSpinReturn,
  checkSpinSettings,
  spinModel
};
