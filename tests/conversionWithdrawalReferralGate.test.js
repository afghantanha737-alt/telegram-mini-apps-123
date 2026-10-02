'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pointsRoute = fs.readFileSync(path.join(__dirname, '../routes/points.js'), 'utf8');
const referralEligibility = require('../utils/referralEligibility');
const taskRoute = fs.readFileSync(path.join(__dirname, '../routes/tasks.js'), 'utf8');
const referralRoute = fs.readFileSync(path.join(__dirname, '../routes/referral.js'), 'utf8');

assert.ok(pointsRoute.includes("router.post('/exchange'"));
assert.ok(pointsRoute.includes("router.post('/withdraw'"));
assert.ok(!pointsRoute.includes('referralWithdrawalRestriction'));
assert.ok(!pointsRoute.includes('REFERRAL_ELIGIBILITY_PENDING'));

// Referral qualification still exists for referral activation/rewards and referral data.
assert.strictEqual(typeof referralEligibility.evaluateReferralEligibility, 'function');
assert.ok(taskRoute.includes('evaluateReferralEligibility'));
assert.ok(referralRoute.includes('referralEligibility'));

console.log('ALL PASS — Convert/Withdraw are independent of Referral eligibility; Referral system remains intact');
