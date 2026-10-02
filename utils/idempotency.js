'use strict';

const crypto = require('crypto');
const IdempotencyOperation = require('../models/IdempotencyOperation');
const { withMongoTransaction } = require('./mongoTransaction');

const KEY_PATTERN = /^[A-Za-z0-9:_-]{8,120}$/;

function validateIdempotencyKey(value) {
  const key = String(value || '').trim();
  return KEY_PATTERN.test(key) ? key : null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function hashIdempotencyRequest(scope, body) {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ scope: String(scope), body: stableValue(body || {}) }))
    .digest('hex');
}

function idempotencyTransactionId({ userId, scope, key, leg }) {
  const identity = [String(userId), String(scope), String(key), String(leg)].join('|');
  return `IO-${crypto.createHash('sha256').update(identity).digest('hex')}`;
}

function keyReuseError() {
  const error = new Error('این Idempotency-Key قبلاً برای محتوای درخواست دیگری استفاده شده است.');
  error.code = 'IDEMPOTENCY_KEY_REUSED';
  error.statusCode = 409;
  return error;
}

function duplicateKeyError() {
  const error = new Error('این درخواست قبلاً در حال اجرا یا ثبت شده است.');
  error.code = 'IDEMPOTENCY_DUPLICATE';
  error.statusCode = 409;
  return error;
}

async function replayExisting({ userId, scope, key, requestHash }) {
  const existing = await IdempotencyOperation.findOne({ userId, scope, key }).lean();
  if (!existing) return null;
  if (existing.requestHash !== requestHash) throw keyReuseError();
  if (existing.status !== 'completed' || !existing.responseBody) throw duplicateKeyError();
  return { status: existing.responseStatus || 200, body: existing.responseBody, replayed: true };
}

/**
 * Stores the operation, balance mutation, ledger entries and replay response in
 * one Mongo transaction. An aborted transaction leaves no idempotency tombstone.
 */
async function executeIdempotently({ userId, scope, key: rawKey, body, execute }) {
  const key = validateIdempotencyKey(rawKey);
  if (!key) {
    const error = new Error('هدر Idempotency-Key معتبر و الزامی است.');
    error.code = 'IDEMPOTENCY_KEY_REQUIRED';
    error.statusCode = 400;
    throw error;
  }
  const requestHash = hashIdempotencyRequest(scope, body);
  const previous = await replayExisting({ userId, scope, key, requestHash });
  if (previous) return previous;

  try {
    const result = await withMongoTransaction(async session => {
      const operation = new IdempotencyOperation({ userId, scope, key, requestHash, status: 'processing' });
      try {
        await operation.save({ session });
      } catch (error) {
        if (error?.code === 11000) {
          const duplicate = duplicateKeyError();
          duplicate.cause = error;
          throw duplicate;
        }
        throw error;
      }

      const execution = await execute(session);
      if (!execution || !execution.body || !Number.isInteger(execution.status || 200)) {
        throw new Error('Idempotent operation did not return a valid response.');
      }
      operation.status = 'completed';
      operation.responseStatus = execution.status || 200;
      operation.responseBody = execution.body;
      operation.resourceId = execution.resourceId || null;
      operation.completedAt = new Date();
      await operation.save({ session });
      return { status: operation.responseStatus, body: operation.responseBody, replayed: false };
    });
    return result;
  } catch (error) {
    if (error.code === 'IDEMPOTENCY_DUPLICATE') {
      const replay = await replayExisting({ userId, scope, key, requestHash });
      if (replay) return replay;
    }
    throw error;
  }
}

module.exports = { validateIdempotencyKey, hashIdempotencyRequest, idempotencyTransactionId, executeIdempotently };
