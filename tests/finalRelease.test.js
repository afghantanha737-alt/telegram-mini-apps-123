'use strict';
const assert = require('assert');
const User = require('../models/User');
const Task = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const PointsLedger = require('../models/PointsLedger');
const AdminLog = require('../models/AdminLog');

function indexNames(model) {
  return model.schema.indexes().map(([fields]) => Object.keys(fields).join('_'));
}
assert.ok(indexNames(User).some(name => name.includes('referralRiskScore')));
assert.ok(indexNames(Task).some(name => name.includes('isActive')));
assert.ok(indexNames(TaskCompletion).some(name => name.includes('status')));
assert.ok(indexNames(PointsLedger).some(name => name.includes('sourceId')));
assert.ok(indexNames(AdminLog).some(name => name.includes('action')));
assert.strictEqual(require('../package.json').scripts.test.includes('tests/*.test.js'), true);
console.log('ALL PASS — final release indexes and npm test contract');
