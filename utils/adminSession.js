'use strict';
const crypto = require('crypto');

const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

function createAdminSession(actor = 'ادمین') {
  const token = crypto.randomBytes(32).toString('hex');
  const adminId = `admin-session-${crypto.randomUUID()}`;
  sessions.set(token, { adminId, actor: String(actor || 'ادمین').trim() || 'ادمین', expiresAt: Date.now() + SESSION_TTL_MS });
  return { token, expiresAt: new Date(Date.now() + SESSION_TTL_MS) };
}

function getAdminSession(token) {
  if (!token || typeof token !== 'string') return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function revokeAdminSession(token) {
  if (typeof token === 'string') sessions.delete(token);
}

function cleanupAdminSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

module.exports = { createAdminSession, getAdminSession, revokeAdminSession, cleanupAdminSessions, SESSION_TTL_MS };
