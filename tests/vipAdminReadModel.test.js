'use strict';

const assert = require('node:assert/strict');
const { effectiveVipStatus, toVipAdminRecord } = require('../utils/vipAdminReadModel');

const now = new Date('2026-10-05T00:00:00.000Z');

assert.equal(effectiveVipStatus({ status: 'active', endAt: '2026-10-06T00:00:00.000Z' }, now), 'active');
assert.equal(effectiveVipStatus({ status: 'active', endAt: '2026-10-04T23:59:59.000Z' }, now), 'expired');
assert.equal(effectiveVipStatus({ status: 'completed', endAt: '2026-10-06T00:00:00.000Z' }, now), 'expired');
assert.equal(effectiveVipStatus({ status: 'cancelled', endAt: '2026-10-06T00:00:00.000Z' }, now), 'cancelled');

const record = toVipAdminRecord({
  _id: 'subscription-1',
  user: { _id: 'mongo-user-1', telegramId: '700001', username: 'test_user', firstName: 'Test', lastName: 'Person' },
  planNumber: 2,
  pricePoints: 2000,
  monthlyRewardPercent: 6,
  durationDays: 30,
  dailyRewardAveragePoints: 4,
  totalRewardPoints: 120,
  claimedRewardPoints: 25,
  claimsCompleted: 6,
  startAt: '2026-10-04T00:00:00.000Z',
  endAt: '2026-10-07T00:00:00.000Z',
  createdAt: '2026-10-04T00:00:00.000Z',
  status: 'active'
}, now);

assert.equal(record.userId, '700001');
assert.equal(record.name, 'Test Person');
assert.equal(record.status, 'active');
assert.equal(record.purchaseAmountPoints, 2000);
assert.equal(record.totalExpectedEarningPoints, 120);
assert.equal(record.earnedToDatePoints, 25);
assert.equal(record.remainingEarningPoints, 95);
assert.equal(record.remainingDays, 2);

console.log('VIP admin read-model regression tests passed.');
