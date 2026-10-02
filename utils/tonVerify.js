'use strict';

/**
 * بررسی یک تراکنش روی شبکه‌ی TON از طریق TonCenter (Index API v3، عمومی و بدون نیاز به کلید
 * برای حجم درخواست کم). هدف این فایل جلوگیری از این است که ادمین صرفاً یک متن دلخواه به‌عنوان
 * «هش تراکنش» در دیتابیس ذخیره کند و سیستم بدون بررسی، آن را «پرداخت‌شده» اعلام کند.
 *
 * محدودیت مهم و صادقانه: اگر توکن، یک Jetton (توکن سفارشی روی TON، مثل GRAM) باشد نه خود TON،
 * مبلغ و آدرس واقعیِ گیرنده داخل payload پیام (که به‌صورت BOC/Cell کدگذاری شده) قرار دارد، نه در
 * فیلد ساده‌ی value پیام. رمزگشایی کامل Cell به یک کتابخانه‌ی اختصاصی TON (مثل @ton/core) نیاز دارد
 * که در این پروژه نصب نیست. به همین دلیل برای Jetton فقط «وجود و موفقیت تراکنش» به‌صورت خودکار
 * تایید می‌شود و تطبیق دقیق مبلغ/مقصد را باید ادمین از روی جزئیات خام تراکنش (که همراه پاسخ خطا
 * برگردانده می‌شود) به‌صورت دستی، از طریق یک Explorer مثل tonviewer.com، تایید کند.
 */

const TONCENTER_API = 'https://toncenter.com/api/v3';
const REQUEST_TIMEOUT_MS = 12000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/** انتهای یک آدرس TON را برای تطبیق تقریبی برمی‌گرداند (چون یک آدرس می‌تواند هم به فرم raw و هم فرم user-friendly باشد). */
function addressSuffix(address, length = 12) {
  return String(address || '').replace(/[^a-zA-Z0-9]/g, '').slice(-length);
}

/**
 * @param {Object} params
 * @param {string} params.txHash - هش تراکنشی که ادمین وارد کرده
 * @param {string} params.expectedAddress - آدرس کیف‌پول کاربر (مقصد مورد انتظار)
 * @param {number} params.expectedAmount - مبلغ برداشت مورد انتظار
 * @param {string} params.token - نماد توکن (مثلاً 'TON' یا 'GRAM')
 * @param {number} [params.toleranceRatio] - حداکثر اختلاف نسبی قابل‌قبول بین مبلغ تراکنش و مبلغ درخواستی
 */
async function verifyTonTransaction({ txHash, expectedAddress, expectedAmount, token, toleranceRatio = 0.02 }) {
  const hash = String(txHash || '').trim();
  if (hash.length < 10) {
    return { ok: false, reason: 'فرمت هش تراکنش نامعتبر به‌نظر می‌رسد (خیلی کوتاه است).' };
  }

  let result;
  try {
    result = await fetchJson(`${TONCENTER_API}/transactions?hash=${encodeURIComponent(hash)}&limit=1`);
  } catch (error) {
    const reason = error?.name === 'AbortError'
      ? 'اتصال به Explorer زمان زیادی طول کشید (timeout).'
      : `اتصال به Explorer برقرار نشد: ${error.message}`;
    return { ok: false, reason };
  }

  if (!result.ok) {
    return { ok: false, reason: `Explorer پاسخ نامعتبر داد (کد ${result.status}).` };
  }

  const tx = Array.isArray(result.data?.transactions) ? result.data.transactions[0] : null;
  if (!tx) {
    return { ok: false, reason: 'تراکنشی با این هش روی شبکه پیدا نشد.' };
  }

  const computeOk = tx.description?.compute_ph?.success !== false;
  const actionOk = tx.description?.action?.success !== false;
  if (!computeOk || !actionOk) {
    return { ok: false, reason: 'تراکنش روی شبکه اجرا شده ولی با خطا مواجه شده (ناموفق).', raw: tx };
  }

  const outMsgs = Array.isArray(tx.out_msgs) ? tx.out_msgs : [];
  const expectedSuffix = addressSuffix(expectedAddress);
  const matchingMsg = outMsgs.find(m => addressSuffix(m.destination).endsWith(expectedSuffix) && expectedSuffix.length > 0);

  const fromAddress = tx.account || tx.in_msg?.source || '';

  // مسیر ساده: خود توکن TON است (نه Jetton) — مبلغ داخل فیلد value پیام قابل‌خواندن است
  if (!token || token.toUpperCase() === 'TON') {
    if (!matchingMsg) {
      return { ok: false, reason: 'آدرس مقصد تراکنش با آدرس کاربر مطابقت ندارد.', raw: tx };
    }
    const sentTon = Number(matchingMsg.value || 0) / 1e9;
    if (expectedAmount) {
      const diffRatio = Math.abs(sentTon - expectedAmount) / expectedAmount;
      if (diffRatio > toleranceRatio) {
        return {
          ok: false,
          reason: `مبلغ تراکنش (${sentTon} TON) با مبلغ درخواست برداشت (${expectedAmount} TON) مطابقت ندارد.`,
          raw: tx
        };
      }
    }
    return { ok: true, reason: 'تراکنش TON با موفقیت روی زنجیره تایید شد.', fromAddress, raw: tx };
  }

  // مسیر Jetton (مثل GRAM): فقط وجود و موفقیت تراکنش خودکار تایید می‌شود؛
  // تطبیق دقیق مبلغ/مقصد چون داخل payload رمزنگاری‌شده است، نیاز به تایید دستی ادمین دارد.
  return {
    ok: true,
    requiresManualAmountCheck: true,
    reason: 'تراکنش پیدا و موفق است، اما چون توکن Jetton است مبلغ/مقصد دقیق را باید دستی تایید کنید.',
    fromAddress,
    raw: tx
  };
}

module.exports = { verifyTonTransaction };
