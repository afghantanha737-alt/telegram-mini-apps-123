'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { hashNetworkIdentifier, assessReferralRisk } = require('../utils/referralRisk');
const AdminSession = require('../models/AdminSession');
const { createAdminSession, getAdminSession, revokeAdminSession } = require('../utils/adminSession');
const { createAdminSessionStore } = require('../utils/telegramAdmin');

(async () => {
  const ipHashA = hashNetworkIdentifier('203.0.113.10');
  assert.strictEqual(ipHashA, hashNetworkIdentifier('203.0.113.10'));
  assert.notStrictEqual(ipHashA, hashNetworkIdentifier('203.0.113.11'));
  assert.strictEqual(assessReferralRisk({ referrer: { signupIpHash: ipHashA }, signupIpHash: ipHashA }).score, 50);
  assert.ok(assessReferralRisk({ referrer: { isBanned: true }, signupIpHash: '' }).blocked);

  const records = new Map();
  const original = { create: AdminSession.create, findOneAndUpdate: AdminSession.findOneAndUpdate, deleteOne: AdminSession.deleteOne };
  AdminSession.create = async value => { records.set(value.tokenHash, { ...value }); return value; };
  AdminSession.findOneAndUpdate = (filter, update) => ({
    select() { return this; },
    async lean() {
      const doc = records.get(filter.tokenHash);
      if (!doc || !(doc.expiresAt > filter.expiresAt.$gt)) return null;
      Object.assign(doc, update.$set);
      return { adminId: doc.adminId, actor: doc.actor, expiresAt: doc.expiresAt };
    }
  });
  AdminSession.deleteOne = async filter => ({ deletedCount: records.delete(filter.tokenHash) ? 1 : 0 });
  try {
    const session = await createAdminSession('Tester');
    assert.strictEqual(typeof session.token, 'string');
    assert.notStrictEqual(records.keys().next().value, session.token, 'only the hash of a web session token is stored');
    assert.strictEqual((await getAdminSession(session.token)).actor, 'Tester');
    await revokeAdminSession(session.token);
    assert.strictEqual(await getAdminSession(session.token), null);
  } finally {
    AdminSession.create = original.create;
    AdminSession.findOneAndUpdate = original.findOneAndUpdate;
    AdminSession.deleteOne = original.deleteOne;
  }

  const conversations = new Map();
  const model = {
    async findOneAndUpdate(filter, update) {
      const current = conversations.get(filter.telegramId) || { telegramId: filter.telegramId };
      Object.assign(current, update.$set);
      conversations.set(filter.telegramId, current);
      return current;
    },
    async exists(filter) {
      const value = conversations.get(filter.telegramId);
      return Boolean(value && value.state === filter.state && value.expiresAt > filter.expiresAt.$gt);
    },
    async deleteOne(filter) {
      const value = conversations.get(filter.telegramId);
      if (value?.state === filter.state) conversations.delete(filter.telegramId);
    },
    findOneAndDelete(filter) {
      return { select() { return this; }, lean: async () => {
        const value = conversations.get(filter.telegramId);
        if (!value || value.state !== filter.state || value.expiresAt <= filter.expiresAt.$gt) return null;
        conversations.delete(filter.telegramId);
        return value;
      } };
    }
  };
  const store = createAdminSessionStore(() => 1000, model);
  await Promise.all([store.setAwaitingContent('42'), store.setAwaitingContent('42')]);
  assert.strictEqual(await store.isAwaitingContent('42'), true, 'shared conversation state survives concurrent first writes');
  await store.clearAwaitingContent('42');
  assert.strictEqual(await store.isAwaitingContent('42'), false);
  await store.setPendingConfirm('42', 10, 20);
  assert.strictEqual((await store.takePendingConfirm('42')).messageId, 20);
  assert.strictEqual(await store.takePendingConfirm('42'), null, 'confirmation state can be consumed once');

  console.log('ALL PASS — phase 2 security primitives, hashed persistent AdminSession, and shared Telegram admin conversation state');
})().catch(error => { console.error(error); process.exitCode = 1; });
