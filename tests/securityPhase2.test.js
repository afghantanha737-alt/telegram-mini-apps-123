'use strict';
const assert = require('assert');
const { hashNetworkIdentifier, assessReferralRisk } = require('../utils/referralRisk');
const { createAdminSession, getAdminSession, revokeAdminSession } = require('../utils/adminSession');

const ipHashA = hashNetworkIdentifier('203.0.113.10');
assert.strictEqual(ipHashA, hashNetworkIdentifier('203.0.113.10'));
assert.notStrictEqual(ipHashA, hashNetworkIdentifier('203.0.113.11'));
assert.strictEqual(assessReferralRisk({ referrer: { signupIpHash: ipHashA }, signupIpHash: ipHashA }).score, 50);
assert.ok(assessReferralRisk({ referrer: { isBanned: true }, signupIpHash: '' }).blocked);

const session = createAdminSession('Tester');
assert.strictEqual(getAdminSession(session.token).actor, 'Tester');
revokeAdminSession(session.token);
assert.strictEqual(getAdminSession(session.token), null);
console.log('ALL PASS — phase 2 security primitives');
