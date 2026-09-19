'use strict';

const crypto = require('crypto');
const PointsLedger = require('../models/PointsLedger');
const User = require('../models/User');

function operationError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = [
    'ALREADY_CHECKED_IN',
    'ALREADY_DONE',
    'BELOW_MIN_WITHDRAW',
    'INSUFFICIENT_BALANCE',
    'INSUFFICIENT_POINTS',
    'INVALID_AMOUNT',
    'INVALID_ADDRESS',
    'INVALID_POINTS_DELTA',
    'INVALID_TASK_REWARD',
    'TASK_FULL'
  ].includes(code) ? 400 : 409;
  return error;
}

/**
 * Changes points and records the resulting balance in the same MongoDB
 * transaction. A reserved idempotency key makes safe retries possible.
 */
async function applyPointsChange({
  userId,
  delta,
  type,
  referenceType = '',
  referenceId = '',
  idempotencyKey = null,
  operationId = null,
  unit = 'Point',
  description = '',
  metadata = {},
  extraUpdate = {},
  extraFilter = {},
  additionalTransactions = [],
  recordPrimary = true,
  session
}) {
  if (!session) throw new Error('A MongoDB session is required for points changes.');

  const amount = Number(delta);
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw operationError('INVALID_POINTS_DELTA', 'مقدار تغییر امتیاز نامعتبر است.');
  }

  if (!['Point', 'Gram'].includes(unit)) {
    throw operationError('INVALID_LEDGER_UNIT', 'واحد تراکنش نامعتبر است.');
  }

  const normalizedKey = idempotencyKey ? String(idempotencyKey).trim().slice(0, 240) : '';
  if (normalizedKey) {
    const existing = await PointsLedger.findOne({ idempotencyKey: normalizedKey }).session(session);
    if (existing) {
      return {
        duplicate: true,
        ledger: existing,
        user: await User.findById(existing.user).session(session)
      };
    }
  }

  const filter = { _id: userId, ...extraFilter };
  if (amount < 0) filter.points = { $gte: Math.abs(amount) };

  const inc = { points: amount };
  if (extraUpdate.$inc) Object.assign(inc, extraUpdate.$inc);
  const update = { $inc: inc };
  if (extraUpdate.$set) update.$set = extraUpdate.$set;

  const user = await User.findOneAndUpdate(
    filter,
    update,
    { new: true, session, runValidators: true }
  );

  if (!user) {
    if (amount < 0) throw operationError('INSUFFICIENT_POINTS', 'موجودی پوینت کافی نیست.');
    if (Object.prototype.hasOwnProperty.call(extraFilter, 'gramBalance')) {
      throw operationError('INSUFFICIENT_BALANCE', 'موجودی GRAM کافی نیست.');
    }
    throw operationError('USER_NOT_FOUND', 'کاربر پیدا نشد.');
  }

  const entry = {
    user: user._id,
    telegramId: user.telegramId,
    delta: amount,
    amount: Math.abs(amount),
    unit,
    direction: amount === 0 ? 'neutral' : amount > 0 ? 'increase' : 'decrease',
    balanceAfter: unit === 'Gram' ? user.gramBalance : user.points,
    pointsAfter: user.points,
    gramAfter: user.gramBalance,
    type,
    referenceType,
    referenceId: referenceId ? String(referenceId) : '',
    operationId: String(operationId || normalizedKey || crypto.randomUUID()),
    status: 'completed',
    description: description || type,
    metadata
  };
  const entries = [];
  if (recordPrimary) {
    if (normalizedKey) entry.idempotencyKey = normalizedKey;
    entries.push(entry);
  }

  for (const item of additionalTransactions) {
    const transactionDelta = Number(item.delta);
    if (!Number.isFinite(transactionDelta)) {
      throw operationError('INVALID_LEDGER_DELTA', 'مقدار تراکنش نامعتبر است.');
    }
    if (!['Point', 'Gram'].includes(item.unit)) {
      throw operationError('INVALID_LEDGER_UNIT', 'واحد تراکنش نامعتبر است.');
    }
    const additionalEntry = {
      user: user._id,
      telegramId: user.telegramId,
      delta: transactionDelta,
      amount: Math.abs(transactionDelta),
      unit: item.unit,
      direction: transactionDelta === 0 ? 'neutral' : transactionDelta > 0 ? 'increase' : 'decrease',
      balanceAfter: item.balanceAfter ?? (item.unit === 'Gram' ? user.gramBalance : user.points),
      pointsAfter: user.points,
      gramAfter: user.gramBalance,
      type: item.type || type,
      referenceType: item.referenceType || referenceType,
      referenceId: item.referenceId ? String(item.referenceId) : (referenceId ? String(referenceId) : ''),
      operationId: String(item.operationId || operationId || normalizedKey || crypto.randomUUID()),
      status: 'completed',
      description: item.description || description || item.type || type,
      metadata: item.metadata || metadata
    };
    if (item.idempotencyKey) additionalEntry.idempotencyKey = String(item.idempotencyKey).slice(0, 240);
    entries.push(additionalEntry);
  }

  const ledgers = entries.length ? await PointsLedger.create(entries, { session }) : [];

  return { duplicate: false, ledger: ledgers[0] || null, ledgers, user };
}

module.exports = { applyPointsChange, operationError };