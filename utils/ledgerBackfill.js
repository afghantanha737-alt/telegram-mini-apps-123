'use strict';

const User = require('../models/User');
const PointsLedger = require('../models/PointsLedger');
const TaskCompletion = require('../models/TaskCompletion');
const Withdrawal = require('../models/Withdrawal');

/**
 * Existing balances cannot be reconstructed into every old individual event.
 * Preserve the recoverable events, then record an immutable opening snapshot
 * for users who have no prior ledger rows.
 */
async function backfillOpeningBalances() {
  const [users, ledgerUserIds, existingReferences, completions, withdrawals] = await Promise.all([
    User.find({}, '_id telegramId points gramBalance').lean(),
    PointsLedger.distinct('user'),
    PointsLedger.find({ referenceType: { $in: ['task_completion', 'withdrawal'] } })
      .select('referenceType referenceId unit delta')
      .lean(),
    TaskCompletion.find({ status: 'approved' }).populate('task', 'title').lean(),
    Withdrawal.find({}).lean()
  ]);

  const usersById = new Map(users.map(user => [String(user._id), user]));
  const knownUsers = new Set(ledgerUserIds.map(id => String(id)));
  const knownReferences = new Set(
    existingReferences.map(entry => {
      const unit = entry.unit === 'Gram' ? 'Gram' : 'Point';
      return `${entry.referenceType}:${entry.referenceId}:${unit}:${entry.delta}`;
    })
  );
  const operations = [];

  const addEntry = ({ user, delta, unit, type, referenceType, referenceId, operationId, idempotencyKey, description, metadata, createdAt }) => {
    if (!user || !Number.isFinite(delta) || !Number.isFinite(Math.abs(delta)) || Math.abs(delta) <= 0) return;
    operations.push({
      insertOne: {
        document: {
          user: user._id,
          telegramId: user.telegramId,
          delta,
          amount: Math.abs(delta),
          unit,
          direction: delta > 0 ? 'increase' : 'decrease',
          balanceAfter: unit === 'Gram' ? Number(user.gramBalance) || 0 : Number(user.points) || 0,
          pointsAfter: Number(user.points) || 0,
          gramAfter: Number(user.gramBalance) || 0,
          type,
          referenceType,
          referenceId: String(referenceId),
          operationId,
          idempotencyKey,
          status: 'completed',
          description,
          metadata: { ...metadata, source: 'ledger-backfill' },
          createdAt,
          updatedAt: createdAt
        }
      }
    });
  };

  for (const completion of completions) {
    const user = usersById.get(String(completion.user));
    const reward = Number(completion.reward);
    const referenceId = String(completion._id);
    const referenceKey = `task_completion:${referenceId}:Point:${reward}`;
    if (!user || !Number.isFinite(reward) || reward <= 0 || knownReferences.has(referenceKey)) continue;
    addEntry({
      user,
      delta: reward,
      unit: 'Point',
      type: 'task_reward',
      referenceType: 'task_completion',
      referenceId,
      operationId: `legacy-task:${referenceId}`,
      idempotencyKey: `legacy-task:${referenceId}`,
      description: completion.task?.title ? `Task reward: ${completion.task.title}` : 'Task reward',
      metadata: { taskId: completion.task?._id || completion.task || null, historical: true },
      createdAt: completion.createdAt
    });
    knownUsers.add(String(user._id));
    knownReferences.add(referenceKey);
  }

  for (const withdrawal of withdrawals) {
    const user = usersById.get(String(withdrawal.user));
    const amount = Number(withdrawal.cryptoAmount);
    const referenceId = String(withdrawal._id);
    const debitKey = `withdrawal:${referenceId}:Gram:${-amount}`;
    if (!user || !Number.isFinite(amount) || amount <= 0 || knownReferences.has(debitKey)) continue;
    addEntry({
      user,
      delta: -amount,
      unit: 'Gram',
      type: 'withdrawal_audit',
      referenceType: 'withdrawal',
      referenceId,
      operationId: `legacy-withdrawal:${referenceId}`,
      idempotencyKey: `legacy-withdrawal:${referenceId}:debit`,
      description: 'Gram withdrawal request',
      metadata: { amount, status: withdrawal.status, historical: true },
      createdAt: withdrawal.createdAt
    });
    knownUsers.add(String(user._id));
    knownReferences.add(debitKey);

    if (withdrawal.status === 'rejected') {
      const returnKey = `withdrawal:${referenceId}:Gram:${amount}`;
      if (!knownReferences.has(returnKey)) {
        addEntry({
          user,
          delta: amount,
          unit: 'Gram',
          type: 'withdrawal_audit',
          referenceType: 'withdrawal',
          referenceId,
          operationId: `legacy-withdrawal:${referenceId}:return`,
          idempotencyKey: `legacy-withdrawal:${referenceId}:return`,
          description: 'GRAM returned after rejected withdrawal',
          metadata: { amount, status: 'rejected', historical: true },
          createdAt: withdrawal.updatedAt || withdrawal.createdAt
        });
        knownReferences.add(returnKey);
      }
    }
  }

  operations.push(...users
    .filter(user => !knownUsers.has(String(user._id)))
    .map(user => ({
      insertOne: {
        document: {
          user: user._id,
          telegramId: user.telegramId,
          delta: Number(user.points) || 0,
          amount: Math.abs(Number(user.points) || 0),
          unit: 'Point',
          direction: (Number(user.points) || 0) === 0 ? 'neutral' : 'increase',
          balanceAfter: Number(user.points) || 0,
          pointsAfter: Number(user.points) || 0,
          gramAfter: Number(user.gramBalance) || 0,
          type: 'opening_balance',
          referenceType: 'migration',
          referenceId: String(user._id),
          operationId: `opening:${user._id}`,
          idempotencyKey: `opening:${user._id}`,
          status: 'completed',
          description: 'Opening balance',
          metadata: { source: 'ledger-backfill' }
        }
      }
    })));

  if (!operations.length) return 0;
  try {
    const result = await PointsLedger.bulkWrite(operations, { ordered: false });
    return result.insertedCount || operations.length;
  } catch (error) {
    const duplicateOnly = error.code === 11000 || error.writeErrors?.every(item => item.code === 11000);
    if (duplicateOnly) return 0;
    throw error;
  }
}

module.exports = backfillOpeningBalances;
