'use strict';
const { bot } = require('./bot');
const RequiredChannel = require('../models/RequiredChannel');
const core = require('./membershipCore');

const ttlSeconds = process.env.MEMBERSHIP_CACHE_TTL_SECONDS;
const CACHE_TTL_MS = ttlSeconds !== undefined && ttlSeconds !== '' && !Number.isNaN(Number(ttlSeconds))
  ? Math.max(0, Number(ttlSeconds)) * 1000
  : 30 * 1000;

function withTimeout(promise, ms) {
  promise.catch(() => {});
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Telegram request timed out')), ms))
  ]);
}

async function getChatMember(ref, userId) {
  if (!bot) throw new Error('BOT_TOKEN is not configured');
  return withTimeout(bot.getChatMember(ref, userId), 8000);
}

async function loadChannels() {
  return RequiredChannel.find({ isActive: true }).sort({ sortOrder: 1, createdAt: 1 }).lean();
}

/** وضعیت اتصال ربات به هر کانال را (فقط وقتی تغییر کرده یا کهنه شده) برای نمایش در پنل ادمین ذخیره می‌کند */
function recordChannelResult(channel, result) {
  const ok = result.state !== 'error';
  const reason = ok ? '' : String(result.reason || '').slice(0, 300);
  const last = channel.lastCheckAt ? new Date(channel.lastCheckAt).getTime() : 0;
  const stale = Date.now() - last > 10 * 60 * 1000;
  if (channel.lastCheckOk === ok && (channel.lastCheckError || '') === reason && !stale) return;

  // timestamps:false تا updatedAt عوض نشود و کش بی‌دلیل باطل نشود
  RequiredChannel.updateOne(
    { _id: channel._id },
    { $set: { lastCheckOk: ok, lastCheckError: reason, lastCheckAt: new Date() } },
    { timestamps: false }
  ).catch(() => {});
}

const service = core.createMembershipService({
  loadChannels,
  getChatMember,
  cacheTtlMs: CACHE_TTL_MS,
  onChannelResult: recordChannelResult
});

const requireMembership = core.createMembershipMiddleware(service);

/** ادمین: بررسی می‌کند کانال معتبر است و ربات در آن ادمین است (لازمه‌ی getChatMember) */
async function validateChannelRef(ref) {
  if (!bot) return { ok: false, reason: 'BOT_TOKEN تنظیم نشده است.' };
  try {
    const chat = await withTimeout(bot.getChat(ref), 10000);
    const me = await withTimeout(bot.getMe(), 10000);
    let botIsAdmin = false;
    let memberError = '';
    try {
      const member = await withTimeout(bot.getChatMember(chat.id, me.id), 10000);
      botIsAdmin = ['administrator', 'creator'].includes(member.status);
    } catch (error) {
      memberError = error.message || '';
    }
    return {
      ok: botIsAdmin,
      botIsAdmin,
      chat: { id: String(chat.id), title: chat.title || '', username: chat.username || '', type: chat.type },
      reason: botIsAdmin
        ? ''
        : `ربات ادمین این کانال/گروه نیست${memberError ? ` (${memberError})` : ''}. ربات را ادمین کنید تا بتواند عضویت کاربران را بررسی کند.`
    };
  } catch (error) {
    return { ok: false, reason: `کانال پیدا نشد یا در دسترس نیست: ${error.message}` };
  }
}

module.exports = {
  membership: service,
  requireMembership,
  withMembership: authMiddleware => core.withMembership(authMiddleware, requireMembership),
  toPublic: core.toPublic,
  validateChannelRef,
  normalizeChannelInput: core.normalizeChannelInput
};
