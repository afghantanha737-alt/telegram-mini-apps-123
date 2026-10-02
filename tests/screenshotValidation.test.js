'use strict';

const assert = require('assert');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const { detectScreenshotMime, isValidScreenshot } = require('../utils/screenshotValidation');

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = Buffer.from('RIFF0000WEBP', 'ascii');

assert.strictEqual(detectScreenshotMime(jpeg), 'image/jpeg');
assert.strictEqual(detectScreenshotMime(png), 'image/png');
assert.strictEqual(detectScreenshotMime(webp), 'image/webp');
assert.strictEqual(detectScreenshotMime(Buffer.from('not an image')), null);
assert.strictEqual(isValidScreenshot(jpeg, 'image/jpeg'), true);
assert.strictEqual(isValidScreenshot(jpeg, 'image/png'), false);
assert.strictEqual(isValidScreenshot(Buffer.from('not an image'), 'image/jpeg'), false);
assert.ok(Task.schema.path('verifyType').enumValues.includes('manual'));
assert.strictEqual(TaskCompletion.schema.path('proofImage').options.select, false);
assert.ok(TaskCompletion.schema.path('submittedAt'));
assert.ok(TaskCompletion.schema.path('reviewedAt'));

console.log('ALL PASS — screenshot signature validation and manual task schema');
