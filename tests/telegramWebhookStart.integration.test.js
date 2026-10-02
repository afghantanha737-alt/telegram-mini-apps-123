'use strict';

const assert = require('assert');
const express = require('express');

// Test-only configuration; no real Telegram token or API request is used.
process.env.BOT_TOKEN = 'test-bot-token-not-real';
process.env.APP_URL = 'https://gramup.example/app';
process.env.TELEGRAM_WEBHOOK_SECRET = 'test_secret-123';

const { bot } = require('../utils/bot');
const User = require('../models/User');
const referralSystem = require('../utils/referralSystem');

const users = new Map();
const sentMessages = [];
const linkedReferrals = [];
User.findOne = async ({ telegramId }) => users.get(String(telegramId)) || null;
User.create = async values => {
  const user = { _id: `user-${values.telegramId}`, language: 'fa', ...values };
  users.set(String(user.telegramId), user);
  return user;
};
referralSystem.linkReferralByCode = async args => {
  linkedReferrals.push(args);
  return { linked: true };
};
bot.sendMessage = async (chatId, text, options) => {
  sentMessages.push({ chatId, text, options });
  return { message_id: sentMessages.length };
};

const telegramRouter = require('../routes/telegramWebhook');
const app = express();
app.use(express.json());
app.use('/api/telegram', telegramRouter);

(async () => {
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();
  const endpoint = `http://127.0.0.1:${port}/api/telegram/webhook`;
  const postUpdate = (update, secret = process.env.TELEGRAM_WEBHOOK_SECRET) => fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {})
    },
    body: JSON.stringify(update)
  });

  try {
    const first = await postUpdate({
      update_id: 1001,
      message: { message_id: 1, chat: { id: 111 }, from: { id: 111, first_name: 'New' }, text: '/start invite_CODE' }
    });
    assert.strictEqual(first.status, 200, 'successful /start update must receive HTTP 200');
    assert.strictEqual(users.has('111'), true, 'new Telegram user must be created');
    assert.strictEqual(sentMessages.length, 1, 'bot must send the Welcome message');
    assert.ok(sentMessages[0].text.includes('سلام New'), 'the bot sends the existing localized Welcome');
    assert.ok(sentMessages[0].text.includes('به Gramup خوش آمدی'));
    const firstUrl = sentMessages[0].options.reply_markup.inline_keyboard[0][0].web_app.url;
    assert.strictEqual(new URL(firstUrl).searchParams.get('ref'), 'invite_CODE');
    assert.strictEqual(linkedReferrals.length, 1, 'new-user referral start payload must be processed');
    assert.strictEqual(linkedReferrals[0].referralCode, 'invite_CODE');

    const returning = await postUpdate({
      update_id: 1002,
      message: { message_id: 2, chat: { id: 111 }, from: { id: 111, first_name: 'New' }, text: '/start another_CODE' }
    });
    assert.strictEqual(returning.status, 200);
    assert.strictEqual(sentMessages.length, 2, 'registered user must also receive Welcome on /start');
    assert.strictEqual(linkedReferrals.length, 1, 'repeated /start must not link or reward a second referral');
    const returningUrl = sentMessages[1].options.reply_markup.inline_keyboard[0][0].web_app.url;
    assert.strictEqual(new URL(returningUrl).searchParams.has('ref'), false, 'existing users must not receive a replacement referral payload');

    const denied = await postUpdate({
      update_id: 1003,
      message: { message_id: 3, chat: { id: 222 }, from: { id: 222 }, text: '/start' }
    }, 'wrong-secret');
    assert.strictEqual(denied.status, 401, 'invalid Telegram webhook secret must be rejected');
    assert.strictEqual(sentMessages.length, 2, 'unauthenticated webhook request must not send a message');

    bot.sendMessage = async () => { throw new Error('simulated send failure'); };
    const failed = await postUpdate({
      update_id: 1004,
      message: { message_id: 4, chat: { id: 333 }, from: { id: 333 }, text: '/start' }
    });
    assert.strictEqual(failed.status, 500, 'Telegram should retry /start if the Welcome could not be sent');

    console.log('ALL PASS — local Telegram webhook HTTP flow: secret → /start → Welcome/referral → 200; failure → retry');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
