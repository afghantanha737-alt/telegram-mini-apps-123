'use strict';
const assert = require('assert');
const { buildDiscrepancy, isDiscrepant, round } = require('../utils/financialAudit');

const row = buildDiscrepancy(
  { _id: 'u1', telegramId: '10', firstName: 'Test', points: 120, gramBalance: 1.25 },
  { points: 100, gram: 1.25 }
);
assert.strictEqual(row.pointsDifference, 20);
assert.strictEqual(row.gramDifference, 0);
assert.strictEqual(isDiscrepant(row), true);
assert.strictEqual(isDiscrepant(buildDiscrepancy({ _id: 'u2', points: 10, gramBalance: 0 }, { points: 10, gram: 0 })), false);
assert.strictEqual(round(1.23456789), 1.234568);
console.log('ALL PASS — financial audit primitives');
