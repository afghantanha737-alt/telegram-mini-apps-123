'use strict';
const crypto = require('crypto');
const AdminSession = require('../models/AdminSession');
const SESSION_TTL_MS = 30 * 60 * 1000;
const hashToken = token => crypto.createHash('sha256').update(String(token)).digest('hex');

async function createAdminSession(actor = 'ادمین') {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const adminId = `admin-session-${crypto.randomUUID()}`;
  await AdminSession.create({ tokenHash: hashToken(token), adminId, actor: String(actor || 'ادمین').trim() || 'ادمین', expiresAt });
  return { token, expiresAt };
}

async function getAdminSession(token) {
  if (!token || typeof token !== 'string') return null;
  const now = new Date();
  const session = await AdminSession.findOneAndUpdate(
    { tokenHash: hashToken(token), expiresAt: { $gt: now } },
    { $set: { expiresAt: new Date(now.getTime() + SESSION_TTL_MS) } },
    { new: true }
  ).select('adminId actor expiresAt').lean();
  return session || null;
}

async function revokeAdminSession(token) {
  if (typeof token === 'string' && token) await AdminSession.deleteOne({ tokenHash: hashToken(token) });
}

async function cleanupAdminSessions() {
  const result = await AdminSession.deleteMany({ expiresAt: { $lte: new Date() } });
  return result.deletedCount || 0;
}

module.exports = { createAdminSession, getAdminSession, revokeAdminSession, cleanupAdminSessions, SESSION_TTL_MS };
