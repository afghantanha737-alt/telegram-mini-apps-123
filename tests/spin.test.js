'use strict';
/** node tests/spin.test.js — منطق گردونه‌ی پولی و اعتبارسنجی تنظیمات ادمین */
const assert = require('assert');
const crypto = require('crypto');
const spin = require('../utils/spin');
const { DEFAULT_PAID_SPIN_WEIGHTS: DEF, SPIN_SEGMENTS } = spin;

const COST = 30;
const near = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

// --- محاسبه‌ی میانگین بازده
assert.ok(near(spin.freeSpinValue(), 44), 'بازده‌ی چرخش رایگان باید ۴۴ باشد');
assert.ok(near(spin.expectedPaidSpinReturn(DEF), 25.2), 'بازده‌ی پیش‌فرض ۲۵٫۲ است');
assert.ok(spin.expectedPaidSpinReturn(DEF) < COST);
console.log('PASS  میانگین بازده‌ی پیش‌فرض = 25.2 (کمتر از هزینه‌ی 30)');

// --- شانس مساوی (همان خطری که اصلاح شد) باید رد شود
const uniform = [1, 1, 1, 1, 1, 1];
assert.ok(near(spin.expectedPaidSpinReturn(uniform), 44));
assert.ok(spin.checkSpinSettings(uniform, COST).error, 'شانس مساوی با هزینه‌ی ۳۰ باید رد شود');
console.log('PASS  شانس مساوی (بازده 44 > هزینه 30) رد می‌شود');

// --- اعتبارسنجی ورودی
assert.ok(!spin.checkSpinSettings(DEF, COST).error);
assert.ok(spin.checkSpinSettings([0, 0, 0, 0, 0, 0], COST).error, 'مجموع صفر');
assert.ok(spin.checkSpinSettings([30, 20, 8, 2, 30], COST).error, 'تعداد کم');
assert.ok(spin.checkSpinSettings([30, 20, 8, 2, 30, 10.5], COST).error, 'عدد اعشاری');
assert.ok(spin.checkSpinSettings([30, 20, 8, 2, 30, -1], COST).error, 'عدد منفی');
assert.ok(spin.checkSpinSettings([30, 20, 8, 2, 30, 1001], COST).error, 'بیشتر از ۱۰۰۰');
assert.ok(spin.checkSpinSettings([30, 20, 8, 2, 30, NaN], COST).error, 'NaN');
// هزینه‌ی بالاتر، وزن‌های سخاوتمندتر را مجاز می‌کند؛ هزینه‌ی خیلی کم رد می‌شود
assert.ok(!spin.checkSpinSettings([25, 25, 15, 5, 20, 10], 50).error);
assert.ok(spin.checkSpinSettings(DEF, 20).error, 'هزینه‌ی ۲۰ با وزن پیش‌فرض ضرردهی است');
console.log('PASS  اعتبارسنجی وزن‌ها و هزینه');

// --- resolveWeights: داده‌ی خراب/ناموجود → پیش‌فرض
assert.deepStrictEqual(spin.resolveWeights(undefined), DEF);
assert.deepStrictEqual(spin.resolveWeights([]), DEF);
assert.deepStrictEqual(spin.resolveWeights([1, 2, 3]), DEF);
assert.deepStrictEqual(spin.resolveWeights([10, 10, 10, 10, 10, 50]), [10, 10, 10, 10, 10, 50]);
console.log('PASS  resolveWeights: مقدار ناموجود/خراب → پیش‌فرض');

// --- شبیه‌سازی: درصدها واقعاً رعایت می‌شوند و میانگین با محاسبه هم‌خوان است
const VALUES = SPIN_SEGMENTS.map(s => (s.type === 'points' ? s.value : 0));
function freeChain() {
  let won = 0, spins = 1;
  while (spins-- > 0) {
    const i = crypto.randomInt(0, SPIN_SEGMENTS.length);
    if (SPIN_SEGMENTS[i].type === 'spin') spins += 1; else won += VALUES[i];
  }
  return won;
}
function simulate(weights, n) {
  const counts = new Array(6).fill(0); let sum = 0;
  for (let k = 0; k < n; k += 1) {
    const i = spin.pickWeightedIndex(weights); counts[i] += 1; sum += VALUES[i];
    if (SPIN_SEGMENTS[i].type === 'spin') sum += freeChain();
  }
  return { counts, avg: sum / n };
}
const custom = [25, 25, 15, 5, 20, 10];
for (const weights of [DEF, custom]) {
  const N = 400000; const { counts, avg } = simulate(weights, N);
  const total = weights.reduce((a, b) => a + b, 0);
  counts.forEach((c, i) => assert.ok(Math.abs(c / N - weights[i] / total) < 0.006, `شانس خانه‌ی ${i} با وزن هم‌خوان نیست`));
  assert.ok(Math.abs(avg - spin.expectedPaidSpinReturn(weights)) < 0.7, 'شبیه‌سازی با محاسبه هم‌خوان نیست');
  console.log(`PASS  شبیه‌سازی ${JSON.stringify(weights)}: درصدها درست، میانگین ${avg.toFixed(2)} ≈ ${spin.expectedPaidSpinReturn(weights).toFixed(2)}`);
}
// وزن صفر یعنی آن خانه هرگز نمی‌آید
const noJackpot = [50, 30, 0, 0, 20, 0];
const z = simulate(noJackpot, 100000).counts;
assert.strictEqual(z[2] + z[3] + z[5], 0);
console.log('PASS  خانه با وزن صفر هرگز انتخاب نمی‌شود');
console.log('ALL PASS');
