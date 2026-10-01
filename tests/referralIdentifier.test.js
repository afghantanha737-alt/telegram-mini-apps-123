'use strict';
const assert = require('assert');
const { createSignedReferralIdentifier, referralIdentifierQuery } = require('../utils/referralCore');

const secret = 'referral-test-secret';
const telegramId = '8977745850';
const signed = createSignedReferralIdentifier(telegramId, secret);
assert.match(signed, /^8977745850_[a-f0-9]{24}$/);
assert.deepStrictEqual(referralIdentifierQuery(signed, secret), { telegramId });
assert.deepStrictEqual(referralIdentifierQuery(`ref_${signed}`, secret), { telegramId });
assert.strictEqual(referralIdentifierQuery('8977745850', secret), null, 'unsigned numeric IDs must not be accepted');
assert.strictEqual(referralIdentifierQuery(signed.replace(/^\d+/, '8977745851'), secret), null, 'changing the Telegram ID invalidates its signature');
assert.strictEqual(referralIdentifierQuery(signed, 'different-secret'), null, 'signatures are server-secret-specific');
assert.deepStrictEqual(referralIdentifierQuery('r123abc9'), { referralCode: 'R123ABC9' });
assert.deepStrictEqual(referralIdentifierQuery('ref_r123abc9'), { referralCode: 'R123ABC9' });
assert.strictEqual(referralIdentifierQuery(''), null);
assert.strictEqual(referralIdentifierQuery('$where'), null);
assert.strictEqual(referralIdentifierQuery('bad-id with spaces'), null);
console.log('ALL PASS — signed Telegram-ID referral links and legacy codes');
