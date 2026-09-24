'use strict';
/** node tests/spin.test.js — بازده‌ی مورد انتظار چرخش با پوینت باید کمتر از هزینه‌اش باشد */
const assert = require('assert');
const { PAID_SPIN_WEIGHTS, pickWeightedIndex } = require('../utils/spin');

const VALUES = [20, 40, 60, 100, 0, 0]; // هم‌ترتیب SPIN_SEGMENTS (خانه‌ی ششم = شانس رایگان دوباره)
const COST = 30;
assert.strictEqual(PAID_SPIN_WEIGHTS.length, 6);
assert.strictEqual(PAID_SPIN_WEIGHTS.reduce((a, b) => a + b, 0), 100);

// محاسبه‌ی دقیق
const total = 100;
const direct = PAID_SPIN_WEIGHTS.reduce((sum, w, i) => sum + (w / total) * VALUES[i], 0);
const freeSpinValue = (20 + 40 + 60 + 100) / 6 / (1 - 1 / 6); // چرخش رایگان: شانس مساوی + زنجیره‌ی شانس دوباره
const expected = direct + (PAID_SPIN_WEIGHTS[5] / total) * freeSpinValue;
console.log(`میانگین بازده‌ی هر چرخش پولی (محاسبه): ${expected.toFixed(2)} پوینت — هزینه: ${COST}`);
assert.ok(expected < COST, 'چرخش پولی نباید برای کاربر سودآور باشد');

// شبیه‌سازی
function freeChain() {
  let won = 0, spins = 1;
  while (spins-- > 0) {
    const i = require('crypto').randomInt(0, 6);
    if (i === 5) spins += 1; else won += VALUES[i];
  }
  return won;
}
const N = 600000; let sum = 0;
for (let n = 0; n < N; n += 1) {
  const i = pickWeightedIndex(PAID_SPIN_WEIGHTS);
  sum += VALUES[i];
  if (i === 5) sum += freeChain();
}
const avg = sum / N;
console.log(`میانگین شبیه‌سازی‌شده (${N} چرخش): ${avg.toFixed(2)} پوینت`);
assert.ok(Math.abs(avg - expected) < 0.6, 'شبیه‌سازی باید با محاسبه هم‌خوان باشد');
assert.ok(avg < COST);

// نمونه‌ی مقایسه: اگر شانس مساوی بود
const uniformAvg = (20 + 40 + 60 + 100) / 6 / (1 - 1 / 6);
console.log(`(اگر شانس مساوی بود میانگین ${uniformAvg.toFixed(1)} می‌شد → سود تضمینی ${(uniformAvg - COST).toFixed(1)} پوینت برای هر چرخش کاربر)`);
console.log('PASS');
