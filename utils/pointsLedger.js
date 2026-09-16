'use strict';

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
  metadata = {},
  extraUpdate = {},
  extraFilter = {},
  session
}) {
  if (!session) throw new Error('A MongoDB session is required for points changes.');

  const amount = Number(delta);
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw operationError('INVALID_POINTS_DELTA', 'مقدار تغییر امتیاز نامعتبر است.');
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
    throw operationError('USER_NOT_FOUND', 'کاربر پیدا نشد.');
  }

  const entry = {
    user: user._id,
    telegramId: user.telegramId,
    delta: amount,
    balanceAfter: user.points,
    type,
    referenceType,
    referenceId: referenceId ? String(referenceId) : '',
    status: 'completed',
    metadata
  };
  if (normalizedKey) entry.idempotencyKey = normalizedKey;

  const [ledger] = await PointsLedger.create([entry], { session });

  return { duplicate: false, ledger, user };
}

module.exports = { applyPointsChange, operationError };
