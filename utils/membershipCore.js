'use strict';

/**
 * منطق خالص (بدون وابستگی به دیتابیس/تلگرام) بررسی عضویت اجباری در کانال‌ها.
 * جدا نگه داشته شده تا بشود آن را مستقل تست کرد. اتصال به دیتابیس و ربات در utils/membership.js است.
 */

const JOINED_STATUSES = new Set(['creator', 'administrator', 'member']);
const NOT_JOINED_STATUSES = new Set(['left', 'kicked']);

/** وضعیت خام getChatMember → 'joined' | 'not_joined' | 'error' */
function interpretMember(member) {
  const status = member && member.status;
  if (JOINED_STATUSES.has(status)) return 'joined';
  // restricted: فقط اگر هنوز واقعاً عضو چت است (is_member=true) عضو حساب می‌شود
  if (status === 'restricted') return member.is_member === true ? 'joined' : 'not_joined';
  if (NOT_JOINED_STATUSES.has(status)) return 'not_joined';
  return 'error';
}

/** خطای API تلگرام → مشکل تنظیمات (config)، مشکل موقت (transient) یا «عضو نیست» */
function classifyError(error) {
  const raw = String((error && (error.message || error.description)) || error || '');
  if (/user not found|PARTICIPANT_ID_INVALID/i.test(raw)) {
    return { state: 'not_joined', reason: raw };
  }
  if (/chat not found|member list is inaccessible|not enough rights|bot is not a member|bot was kicked|CHAT_ADMIN_REQUIRED|channel_private/i.test(raw)) {
    return { state: 'error', kind: 'config', reason: raw };
  }
  return { state: 'error', kind: 'transient', reason: raw };
}

function channelRef(channel) {
  const chatId = String(channel.chatId || '').trim();
  if (chatId) return chatId;
  const username = String(channel.username || '').replace(/^@/, '').trim();
  return username ? `@${username}` : '';
}

async function checkChannel(channel, telegramUserId, getChatMember) {
  const ref = channelRef(channel);
  if (!ref) return { state: 'error', kind: 'config', reason: 'برای این کانال نه chatId و نه username ثبت شده است.' };
  try {
    const member = await getChatMember(ref, telegramUserId);
    const state = interpretMember(member);
    if (state === 'error') {
      return { state, kind: 'config', reason: `وضعیت ناشناخته از تلگرام: ${member && member.status}` };
    }
    return { state };
  } catch (error) {
    return classifyError(error);
  }
}

/**
 * عضویت فعلی کاربر را در همه‌ی کانال‌های داده‌شده از تلگرام می‌پرسد.
 * هیچ‌وقت خطا را به «عضو است» تبدیل نمی‌کند (fail-closed).
 */
async function evaluateMembership({ channels, telegramUserId, getChatMember, onChannelResult }) {
  const results = await Promise.all(
    channels.map(async channel => {
      const result = await checkChannel(channel, telegramUserId, getChatMember);
      if (onChannelResult) {
        try { onChannelResult(channel, result); } catch (e) { /* ignore */ }
      }
      return { channel, ...result };
    })
  );

  const required = channels.length > 0;
  const allJoined = results.every(r => r.state === 'joined');
  const anyNotJoined = results.some(r => r.state === 'not_joined');
  const anyError = results.some(r => r.state === 'error');
  const verified = !required || allJoined;

  return {
    required,
    verified,
    // «در دسترس نیست»: هیچ کانالی قطعاً عضو‌نشده نیست ولی حداقل یکی قابل بررسی نبود
    unavailable: !verified && anyError && !anyNotJoined,
    hasError: anyError,
    results
  };
}

function toPublic(evaluation) {
  return {
    required: evaluation.required,
    verified: evaluation.verified,
    unavailable: evaluation.unavailable,
    channels: evaluation.results.map(r => ({
      id: String(r.channel._id),
      name: r.channel.name,
      username: r.channel.username || '',
      url: r.channel.url,
      state: r.state // joined | not_joined | error
    }))
  };
}

/**
 * سرویس بررسی عضویت. کش فقط برای نتیجه‌ی «تایید شده» و فقط چند ثانیه است تا API تلگرام
 * با هر درخواست صدا زده نشود؛ نتیجه‌ی منفی هرگز کش نمی‌شود، و check با force=true همیشه تازه می‌پرسد.
 * کش با تغییر تنظیمات کانال‌ها خودکار باطل می‌شود (signature).
 */
function createMembershipService({ loadChannels, getChatMember, cacheTtlMs = 30000, now = Date.now, onChannelResult }) {
  const cache = new Map();
  const inflight = new Map();

  const signature = channels =>
    channels
      .map(c => `${c._id}:${c.chatId || ''}:${c.username || ''}:${c.updatedAt ? new Date(c.updatedAt).getTime() : ''}`)
      .join('|');

  function prune() {
    if (cache.size < 5000) return;
    const t = now();
    for (const [key, entry] of cache.entries()) {
      if (t - entry.at >= cacheTtlMs) cache.delete(key);
    }
  }

  async function check(telegramUserId, { force = false } = {}) {
    const channels = await loadChannels();
    if (!channels.length) {
      return { required: false, verified: true, unavailable: false, hasError: false, results: [] };
    }

    const sig = signature(channels);
    const key = String(telegramUserId);

    if (!force && cacheTtlMs > 0) {
      const hit = cache.get(key);
      if (hit && hit.sig === sig && now() - hit.at < cacheTtlMs) return hit.result;
    }

    const flightKey = `${key}|${sig}`;
    if (inflight.has(flightKey)) return inflight.get(flightKey);

    const promise = (async () => {
      try {
        const result = await evaluateMembership({ channels, telegramUserId, getChatMember, onChannelResult });
        if (result.verified && cacheTtlMs > 0) {
          prune();
          cache.set(key, { sig, at: now(), result });
        } else {
          cache.delete(key);
        }
        return result;
      } finally {
        inflight.delete(flightKey);
      }
    })();

    inflight.set(flightKey, promise);
    return promise;
  }

  return { check, clearCache: () => cache.clear() };
}

const MSG_REQUIRED = 'برای ادامه باید در همه‌ی کانال‌های اجباری عضو شوید.';
const MSG_UNAVAILABLE = 'در حال حاضر بررسی عضویت ممکن نیست. لطفاً دوباره تلاش کنید.';

/** middleware اجباری: بعد از احراز هویت اجرا می‌شود (req.dbUser لازم است) */
function createMembershipMiddleware(service) {
  return async function requireMembership(req, res, next) {
    try {
      const telegramId = req.dbUser && req.dbUser.telegramId;
      if (!telegramId) {
        return res.status(401).json({ success: false, message: 'کاربر شناسایی نشد.' });
      }
      const result = await service.check(telegramId);
      if (result.verified) return next();

      const payload = toPublic(result);
      if (result.unavailable) {
        return res.status(503).json({ success: false, code: 'MEMBERSHIP_UNAVAILABLE', message: MSG_UNAVAILABLE, ...payload });
      }
      return res.status(403).json({ success: false, code: 'MEMBERSHIP_REQUIRED', message: MSG_REQUIRED, ...payload });
    } catch (error) {
      console.error('Membership middleware error:', error);
      // fail-closed: اگر نتوانستیم بررسی کنیم، اجازه‌ی عبور نمی‌دهیم
      return res.status(503).json({
        success: false,
        code: 'MEMBERSHIP_UNAVAILABLE',
        message: MSG_UNAVAILABLE,
        required: true,
        verified: false,
        unavailable: true,
        channels: []
      });
    }
  };
}

/** احراز هویت تلگرام + بررسی عضویت را در یک middleware ترکیب می‌کند */
function withMembership(authMiddleware, requireMembership) {
  return function authAndMembership(req, res, next) {
    authMiddleware(req, res, err => {
      if (err) return next(err);
      requireMembership(req, res, next);
    });
  };
}

/* ---------- ورودی‌های ادمین ---------- */
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
const CHAT_ID_RE = /^-?\d{5,20}$/;
const URL_RE = /^https:\/\/(t|telegram)\.me\/[A-Za-z0-9_+\-/]{2,100}$/;

function normalizeChannelInput(body) {
  const input = body || {};
  const name = String(input.name || '').trim();
  let username = String(input.username || '').trim();
  const chatId = String(input.chatId || '').trim();
  let url = String(input.url || '').trim();

  username = username.replace(/^https?:\/\/(t|telegram)\.me\//i, '').replace(/^@/, '').replace(/\/+$/, '');

  if (!name) return { error: 'نام کانال الزامی است.' };
  if (name.length > 80) return { error: 'نام کانال بیش از حد طولانی است.' };
  if (!username && !chatId) return { error: 'حداقل یوزرنیم یا آیدی عددی کانال را وارد کنید.' };
  if (username && !USERNAME_RE.test(username)) return { error: 'یوزرنیم کانال نامعتبر است (مثلاً GramUpOfficial).' };
  if (chatId && !CHAT_ID_RE.test(chatId)) return { error: 'آیدی عددی کانال نامعتبر است (مثلاً -1001234567890).' };
  if (!url && username) url = `https://t.me/${username}`;
  if (!url) return { error: 'لینک کانال الزامی است.' };
  if (!URL_RE.test(url)) return { error: 'لینک باید با https://t.me/ شروع شود.' };

  const active = input.isActive;
  const isActive = active === undefined ? true : active === true || active === 'true' || active === 1 || active === '1';

  return { value: { name, username, chatId, url, isActive } };
}

module.exports = {
  interpretMember,
  classifyError,
  channelRef,
  evaluateMembership,
  toPublic,
  createMembershipService,
  createMembershipMiddleware,
  withMembership,
  normalizeChannelInput
};
