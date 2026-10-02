'use strict';
/**
 * تست منطق عضویت اجباری (بدون نیاز به دیتابیس یا تلگرام واقعی):
 *   node tests/membership.test.js
 * یک «تلگرام جعلی» فقط برای تست به‌کار می‌رود؛ خود برنامه هیچ‌جا از داده‌ی جعلی استفاده نمی‌کند.
 */
const assert = require('assert');
const core = require('../utils/membershipCore');

const CH1 = { _id: 'c1', name: 'GramUp Official', username: 'GramUpOfficial', chatId: '', url: 'https://t.me/GramUpOfficial', updatedAt: 1 };
const CH2 = { _id: 'c2', name: 'GramUp News', username: 'GramUpNews', chatId: '', url: 'https://t.me/GramUpNews', updatedAt: 1 };

function makeWorld() {
  const world = {
    channels: [CH1, CH2],
    members: {}, // "ref|userId" -> status
    errors: {},  // ref -> Error
    calls: 0,
    now: 1000000
  };
  const getChatMember = async (ref, userId) => {
    world.calls += 1;
    if (world.errors[ref]) throw world.errors[ref];
    const status = world.members[`${ref}|${userId}`] || 'left';
    return { status, is_member: status === 'restricted' ? world.restrictedIsMember : undefined };
  };
  world.service = core.createMembershipService({
    loadChannels: async () => world.channels,
    getChatMember,
    cacheTtlMs: 30000,
    now: () => world.now
  });
  world.join = (ch, uid, status = 'member') => { world.members[`@${ch.username}|${uid}`] = status; };
  world.leave = (ch, uid) => { world.members[`@${ch.username}|${uid}`] = 'left'; };
  return world;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('TEST 1: کاربر بدون عضویت در هیچ کانالی → بلاک', async () => {
  const w = makeWorld();
  const r = await w.service.check(1, { force: true });
  assert.strictEqual(r.verified, false);
  assert.deepStrictEqual(r.results.map(x => x.state), ['not_joined', 'not_joined']);
});

test('TEST 2: فقط عضو کانال ۱ → کانال ۲ همچنان بلاک', async () => {
  const w = makeWorld(); w.join(CH1, 1);
  const r = await w.service.check(1, { force: true });
  assert.strictEqual(r.verified, false);
  assert.deepStrictEqual(r.results.map(x => x.state), ['joined', 'not_joined']);
});

test('TEST 3: عضو همه‌ی کانال‌ها → ورود آزاد', async () => {
  const w = makeWorld(); w.join(CH1, 1); w.join(CH2, 1, 'administrator');
  const r = await w.service.check(1, { force: true });
  assert.strictEqual(r.verified, true);
});

test('TEST 4: کاربر قدیمی (با موجودی) که عضو نیست → همان بلاک برای همه', async () => {
  const w = makeWorld(); // منطق عضویت به موجودی/سابقه‌ی کاربر وابسته نیست
  const r = await w.service.check(999, { force: true });
  assert.strictEqual(r.verified, false);
});

test('TEST 5: قبلاً تایید شده، بعد از کانال خارج شد → ورود بعدی (force) بلاک', async () => {
  const w = makeWorld(); w.join(CH1, 1); w.join(CH2, 1);
  assert.strictEqual((await w.service.check(1, { force: true })).verified, true);
  w.leave(CH2, 1);
  const r = await w.service.check(1, { force: true });
  assert.strictEqual(r.verified, false);
  assert.deepStrictEqual(r.results.map(x => x.state), ['joined', 'not_joined']);
});

test('TEST 6: دوباره عضو شد → بررسی موفق', async () => {
  const w = makeWorld(); w.join(CH1, 1);
  assert.strictEqual((await w.service.check(1, { force: true })).verified, false);
  w.join(CH2, 1);
  assert.strictEqual((await w.service.check(1, { force: true })).verified, true);
});

test('TEST 7: هیچ کانال فعالی نیست → ورود آزاد و بدون تماس با تلگرام', async () => {
  const w = makeWorld(); w.channels = [];
  const r = await w.service.check(1);
  assert.strictEqual(r.verified, true); assert.strictEqual(r.required, false); assert.strictEqual(w.calls, 0);
});

test('TEST 8: فقط یک کانال فعال → فقط همان لازم است', async () => {
  const w = makeWorld(); w.channels = [CH1]; w.join(CH1, 1);
  assert.strictEqual((await w.service.check(1, { force: true })).verified, true);
  assert.strictEqual(w.calls, 1);
});

test('TEST 9: دو کانال فعال → هر دو لازم است', async () => {
  const w = makeWorld(); w.join(CH2, 1);
  assert.strictEqual((await w.service.check(1, { force: true })).verified, false);
});

test('TEST 10: خطای تلگرام/تنظیمات → هرگز تایید نمی‌شود (fail-closed)', async () => {
  const w = makeWorld(); w.join(CH1, 1); w.join(CH2, 1);
  w.errors['@GramUpNews'] = new Error('ETELEGRAM: 400 Bad Request: chat not found');
  let r = await w.service.check(1, { force: true });
  assert.strictEqual(r.verified, false); assert.strictEqual(r.unavailable, true);
  assert.strictEqual(r.results[1].state, 'error'); assert.strictEqual(r.results[1].kind, 'config');
  w.errors['@GramUpNews'] = new Error('ETIMEDOUT');
  r = await w.service.check(1, { force: true });
  assert.strictEqual(r.verified, false); assert.strictEqual(r.results[1].kind, 'transient');
  // اگر یک کانال «عضو نیست» و دیگری خطا دارد: unavailable نیست، کاربر باید عضو شود
  const w2 = makeWorld(); w2.errors['@GramUpNews'] = new Error('chat not found');
  const r2 = await w2.service.check(1, { force: true });
  assert.strictEqual(r2.verified, false); assert.strictEqual(r2.unavailable, false);
});

test('وضعیت‌ها: left/kicked عضو نیست؛ creator/administrator/member عضو است؛ restricted فقط با is_member', async () => {
  assert.strictEqual(core.interpretMember({ status: 'left' }), 'not_joined');
  assert.strictEqual(core.interpretMember({ status: 'kicked' }), 'not_joined');
  assert.strictEqual(core.interpretMember({ status: 'creator' }), 'joined');
  assert.strictEqual(core.interpretMember({ status: 'administrator' }), 'joined');
  assert.strictEqual(core.interpretMember({ status: 'member' }), 'joined');
  assert.strictEqual(core.interpretMember({ status: 'restricted', is_member: true }), 'joined');
  assert.strictEqual(core.interpretMember({ status: 'restricted', is_member: false }), 'not_joined');
  assert.strictEqual(core.interpretMember({ status: 'weird' }), 'error');
  assert.strictEqual(core.interpretMember(null), 'error');
});

test('کش: فقط نتیجه‌ی تاییدشده و فقط کوتاه‌مدت؛ نتیجه‌ی منفی هرگز کش نمی‌شود', async () => {
  const w = makeWorld(); w.join(CH1, 1); w.join(CH2, 1);
  await w.service.check(1); const callsAfterFirst = w.calls;
  await w.service.check(1); assert.strictEqual(w.calls, callsAfterFirst); // از کش
  w.leave(CH2, 1);
  w.now += 31000; // بعد از TTL
  assert.strictEqual((await w.service.check(1)).verified, false); // دوباره از تلگرام پرسید
  // نتیجه‌ی منفی کش نمی‌شود: بلافاصله بعد از عضویت، تایید می‌شود
  w.join(CH2, 1);
  assert.strictEqual((await w.service.check(1)).verified, true);
});

test('کش با تغییر تنظیمات کانال‌ها خودکار باطل می‌شود', async () => {
  const w = makeWorld(); w.join(CH1, 1); w.join(CH2, 1);
  assert.strictEqual((await w.service.check(1)).verified, true);
  const CH3 = { _id: 'c3', name: 'New', username: 'NewChannel', chatId: '', url: 'https://t.me/NewChannel', updatedAt: 5 };
  w.channels = [CH1, CH2, CH3];
  assert.strictEqual((await w.service.check(1)).verified, false); // کانال جدید هنوز عضو نیست
});

test('درخواست‌های هم‌زمان یک کاربر یک بررسی مشترک دارند', async () => {
  const w = makeWorld(); w.join(CH1, 1); w.join(CH2, 1);
  await Promise.all([w.service.check(1, { force: true }), w.service.check(1, { force: true }), w.service.check(1, { force: true })]);
  assert.strictEqual(w.calls, 2); // ۲ کانال × ۱ بار
});

function fakeRes() {
  return { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
}

test('TEST 11: middleware روی API محافظت‌شده — بدون عضویت 403، با خطا 503، با عضویت عبور', async () => {
  const w = makeWorld();
  const mw = core.createMembershipMiddleware(w.service);
  const req = { dbUser: { telegramId: '7' } };

  let res = fakeRes(), passed = false;
  await mw(req, res, () => { passed = true; });
  assert.strictEqual(passed, false); assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.code, 'MEMBERSHIP_REQUIRED');
  assert.ok(res.body.channels.every(c => c.state === 'not_joined' && !('chatId' in c)));

  w.join(CH1, '7'); w.join(CH2, '7'); passed = false; res = fakeRes();
  await mw(req, res, () => { passed = true; });
  assert.strictEqual(passed, true);

  // بعد از خروج از کانال و گذشت TTL، API دوباره بسته می‌شود
  w.leave(CH1, '7'); w.now += 31000; passed = false; res = fakeRes();
  await mw(req, res, () => { passed = true; });
  assert.strictEqual(passed, false); assert.strictEqual(res.statusCode, 403);

  // خطای تنظیمات → 503 و عدم عبور
  const w2 = makeWorld(); w2.errors['@GramUpOfficial'] = new Error('chat not found'); w2.errors['@GramUpNews'] = new Error('chat not found');
  const mw2 = core.createMembershipMiddleware(w2.service);
  passed = false; res = fakeRes();
  await mw2({ dbUser: { telegramId: '8' } }, res, () => { passed = true; });
  assert.strictEqual(passed, false); assert.strictEqual(res.statusCode, 503); assert.strictEqual(res.body.code, 'MEMBERSHIP_UNAVAILABLE');

  // خطای دیتابیس (loadChannels) → fail-closed
  const broken = core.createMembershipService({ loadChannels: async () => { throw new Error('db down'); }, getChatMember: async () => ({ status: 'member' }) });
  const mw3 = core.createMembershipMiddleware(broken);
  passed = false; res = fakeRes();
  const origErr = console.error; console.error = () => {};
  await mw3({ dbUser: { telegramId: '9' } }, res, () => { passed = true; });
  console.error = origErr;
  assert.strictEqual(passed, false); assert.strictEqual(res.statusCode, 503);

  // هویت ناشناخته → 401
  res = fakeRes(); passed = false;
  await mw({ }, res, () => { passed = true; });
  assert.strictEqual(passed, false); assert.strictEqual(res.statusCode, 401);
});

test('withMembership: اول احراز هویت، بعد عضویت', async () => {
  const w = makeWorld(); w.join(CH1, '5'); w.join(CH2, '5');
  const requireMembership = core.createMembershipMiddleware(w.service);
  const authOk = async (req, res, next) => { req.dbUser = { telegramId: '5' }; next(); };
  const authFail = async (req, res) => res.status(401).json({ success: false });
  let passed = false;
  await core.withMembership(authOk, requireMembership)({}, fakeRes(), () => { passed = true; });
  await new Promise(r => setTimeout(r, 10));
  assert.strictEqual(passed, true);
  passed = false; const res = fakeRes();
  await core.withMembership(authFail, requireMembership)({}, res, () => { passed = true; });
  assert.strictEqual(passed, false); assert.strictEqual(res.statusCode, 401);
});

test('ورودی‌های ادمین: نرمال‌سازی و اعتبارسنجی', async () => {
  let r = core.normalizeChannelInput({ name: 'GramUp Official', username: '@GramUpOfficial' });
  assert.deepStrictEqual(r.value, { name: 'GramUp Official', username: 'GramUpOfficial', chatId: '', url: 'https://t.me/GramUpOfficial', isActive: true });
  r = core.normalizeChannelInput({ name: 'X', username: 'https://t.me/GramUpNews', isActive: false });
  assert.strictEqual(r.value.username, 'GramUpNews'); assert.strictEqual(r.value.isActive, false);
  r = core.normalizeChannelInput({ name: 'Private', chatId: '-1001234567890', url: 'https://t.me/+AbCdEf123' });
  assert.ok(r.value && r.value.chatId === '-1001234567890');
  assert.ok(core.normalizeChannelInput({ name: '', username: 'abcde' }).error);
  assert.ok(core.normalizeChannelInput({ name: 'a', username: '' , chatId: ''}).error);
  assert.ok(core.normalizeChannelInput({ name: 'a', username: 'ab' }).error);
  assert.ok(core.normalizeChannelInput({ name: 'a', chatId: 'abc' }).error);
  assert.ok(core.normalizeChannelInput({ name: 'a', username: 'abcde', url: 'javascript:alert(1)' }).error);
  assert.ok(core.normalizeChannelInput({ name: 'a', username: 'abcde', url: 'http://evil.com/x' }).error);
});

test('toPublic: chatId و اطلاعات داخلی به کاربر نشان داده نمی‌شود', async () => {
  const w = makeWorld(); w.channels = [{ ...CH1, chatId: '-100999' }]; w.join({ username: 'GramUpOfficial' }, 1);
  // ref از chatId ساخته می‌شود
  w.members['-100999|1'] = 'member';
  const r = await w.service.check(1, { force: true });
  const pub = core.toPublic(r);
  assert.strictEqual(pub.verified, true);
  assert.deepStrictEqual(Object.keys(pub.channels[0]).sort(), ['id', 'name', 'state', 'url', 'username']);
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log('PASS ', t.name); }
    catch (e) { failed += 1; console.log('FAIL ', t.name, '\n      ', e.message); }
  }
  console.log(`\n${tests.length - failed}/${tests.length} tests passed`);
  process.exit(failed ? 1 : 0);
})();
