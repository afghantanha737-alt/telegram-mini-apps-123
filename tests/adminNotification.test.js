'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8');
const endpoint = source.slice(source.indexOf("router.post('/users/:id/test-weekly-reward-notification'"), source.indexOf('/* -------------------- REQUIRED CHANNELS', source.indexOf("router.post('/users/:id/test-weekly-reward-notification'")));

assert.match(endpoint, /if \(!isTestEnvironment\(\)\)/, 'test notification uses shared TEST guard');
assert.doesNotMatch(endpoint, /if \(!isTestDeleteEnvironment\(\)\)/, 'test notification does not use stale delete guard');
assert.match(endpoint, /sendNotificationOnce\(/, 'test notification uses existing delivery helper');
assert.match(endpoint, /status: delivery\.status[\s\S]*delivery: \$\{delivery\.status\}/, 'delivery status is returned on failure');
assert.match(endpoint, /botText\('leaderboardReward'/, 'test uses existing weekly reward message template');
assert.match(endpoint, /Telegram ID معتبر/, 'Telegram ID is validated');
assert.match(endpoint, /res\.json\(\{ success: true, status: delivery\.status/, 'success response requires sent delivery');

console.log('ALL PASS — Admin test notification TEST guard, delivery helper, Telegram validation and status reporting');
