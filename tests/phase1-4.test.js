'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { verifyInitData } = require('../utils/telegramAuth');
const { isTelegramDeliveryBlocked } = require('../utils/bot');
const Task = require('../models/Task');
const { recordLedgerRequired } = require('../utils/ledger');
const { withMongoTransaction } = require('../utils/mongoTransaction');

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
assert.ok(!packageJson.dependencies['node-telegram-bot-api'], 'legacy Telegram dependency must be removed');
assert.strictEqual(typeof recordLedgerRequired, 'function');
assert.strictEqual(typeof withMongoTransaction, 'function');
assert.strictEqual(Task.schema.path('verifyType').defaultValue, 'telegram');

const token = '123456:unit-test-token';
const authDate = Math.floor(Date.now() / 1000) + 600;
const params = new URLSearchParams({
  auth_date: String(authDate),
  user: JSON.stringify({ id: 123, first_name: 'Test' })
});
const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
assert.strictEqual(verifyInitData(`${params.toString()}&hash=${hash}`, token), null, 'future initData must be rejected');
assert.strictEqual(isTelegramDeliveryBlocked({ response: { statusCode: 403 }, message: 'Forbidden' }), true);
assert.strictEqual(isTelegramDeliveryBlocked({ response: { statusCode: 400 }, message: 'Bad Request' }), false);
console.log('ALL PASS — phase 1-4 financial, security and dependency contracts');
