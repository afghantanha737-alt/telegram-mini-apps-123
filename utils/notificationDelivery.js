'use strict';

const NotificationDelivery = require('../models/NotificationDelivery');
const { notifyUser } = require('./bot');

/**
 * Sends one Telegram notification for one immutable business event.
 * Only pending records may be claimed; sending/sent/unknown records are never retried automatically.
 */
async function sendNotificationOnce({ eventKey, type, user, telegramId, text }) {
  if (!eventKey || !type || !user || !telegramId || !text) return { status: 'skipped' };

  let delivery;
  try {
    delivery = await NotificationDelivery.findOneAndUpdate(
      { eventKey, status: 'pending' },
      { $set: { status: 'sending', type, user, telegramId }, $inc: { attempts: 1 } },
      { new: true }
    );
    if (!delivery) {
      delivery = await NotificationDelivery.create({
        eventKey,
        type,
        user,
        telegramId,
        status: 'sending',
        attempts: 1
      });
    }
  } catch (error) {
    if (error?.code === 11000) return { status: 'duplicate' };
    throw error;
  }

  const delivered = await notifyUser(telegramId, text);
  if (delivered) {
    await NotificationDelivery.updateOne(
      { _id: delivery._id, status: 'sending' },
      { $set: { status: 'sent', sentAt: new Date(), error: '' } }
    );
    return { status: 'sent' };
  }

  await NotificationDelivery.updateOne(
    { _id: delivery._id, status: 'sending' },
    { $set: { status: 'unknown', error: 'Telegram delivery did not confirm success.' } }
  );
  return { status: 'unknown' };
}

module.exports = { sendNotificationOnce };
