'use strict';
const assert = require('assert');
const { requestId, snapshot } = require('../utils/metrics');

const first = requestId();
const second = requestId();
assert.ok(first.length >= 20);
assert.notStrictEqual(first, second);
const metrics = snapshot();
assert.ok(typeof metrics.uptimeSeconds === 'number');
assert.ok(typeof metrics.requests === 'number');
assert.ok(typeof metrics.memory.rss === 'number');
console.log('ALL PASS — operations metrics primitives');
