'use strict';
const assert = require('assert');
const { isTelegramDeliveryBlocked } = require('../utils/bot');

assert.strictEqual(isTelegramDeliveryBlocked({ response: { body: { error_code: 403 } } }), true);
assert.strictEqual(isTelegramDeliveryBlocked(new Error('ETELEGRAM: 403 Forbidden: bot was blocked by the user')), true);
assert.strictEqual(isTelegramDeliveryBlocked(new Error('ETELEGRAM: 429 Too Many Requests')), false);
assert.strictEqual(isTelegramDeliveryBlocked(new Error('network timeout')), false);
console.log('ALL PASS — Telegram blocked-user handling');
