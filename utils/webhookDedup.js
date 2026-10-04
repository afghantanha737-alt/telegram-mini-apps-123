'use strict';
const TelegramWebhookUpdate = require('../models/TelegramWebhookUpdate');

async function claimWebhookUpdate(updateId, updateType = 'other', Model = TelegramWebhookUpdate) {
  const id = Number(updateId);
  if (!Number.isSafeInteger(id) || id < 0) return { claimed: false, invalid: true };
  try {
    await Model.create({ updateId: id, updateType, status: 'processing' });
    return { claimed: true };
  } catch (error) {
    if (error?.code === 11000) return { claimed: false, duplicate: true };
    throw error;
  }
}

async function finishWebhookUpdate(updateId, status, failureCode = '', Model = TelegramWebhookUpdate) {
  if (!['completed', 'failed'].includes(status)) throw new TypeError('Invalid webhook update status.');
  await Model.updateOne({ updateId: Number(updateId), status: 'processing' }, {
    $set: { status, completedAt: new Date(), failureCode: String(failureCode || '').slice(0, 80) }
  });
}

module.exports = { claimWebhookUpdate, finishWebhookUpdate };
