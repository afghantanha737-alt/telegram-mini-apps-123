'use strict';

const crypto = require('crypto');

const TONCENTER_BASE = 'https://toncenter.com/api/v3';
const REQUEST_TIMEOUT_MS = 12000;
const PUBLIC_API_MIN_INTERVAL_MS = 1100;
let lastPublicRequestAt = 0;
let publicRequestTail = Promise.resolve();
const masterCache = new Map();

function crc16Xmodem(buffer) {
  let crc = 0;
  for (const byte of buffer) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function normalizeTonAddress(value) {
  const text = String(value || '').trim();
  const raw = text.match(/^(-?\d+):([a-f\d]{64})$/i);
  if (raw) {
    const workchain = Number(raw[1]);
    if (!Number.isInteger(workchain) || workchain < -1 || workchain > 0) return null;
    return `${workchain}:${raw[2].toLowerCase()}`;
  }

  if (!/^[a-z\d+/_-]{48}$/i.test(text)) return null;
  const encoded = text.replace(/-/g, '+').replace(/_/g, '/');
  let bytes;
  try { bytes = Buffer.from(encoded, 'base64'); } catch { return null; }
  if (bytes.length !== 36) return null;
  const tag = bytes[0] & 0x7f;
  const testOnly = (bytes[0] & 0x80) !== 0;
  if ((tag !== 0x11 && tag !== 0x51) || testOnly) return null;
  const expectedChecksum = crc16Xmodem(bytes.subarray(0, 34));
  const actualChecksum = (bytes[34] << 8) | bytes[35];
  if (expectedChecksum !== actualChecksum) return null;
  const workchain = bytes.readInt8(1);
  if (workchain < -1 || workchain > 0) return null;
  return `${workchain}:${bytes.subarray(2, 34).toString('hex')}`;
}

function normalizeTonTxHash(value) {
  const text = String(value || '').trim().replace(/^0x/i, '');
  return /^[a-f\d]{64}$/i.test(text) ? text.toLowerCase() : null;
}

function amountToUnits(value, decimals) {
  const places = Number(decimals);
  const amount = Number(value);
  if (!Number.isInteger(places) || places < 0 || places > 30 || !Number.isFinite(amount) || amount <= 0) return null;
  const fixed = amount.toFixed(places + 1);
  const [whole, fraction = ''] = fixed.split('.');
  if (Number(fraction[places] || 0) !== 0) return null;
  const precisionFraction = fraction.slice(0, places);
  try {
    const units = BigInt(`${whole}${precisionFraction.padEnd(places, '0') || ''}`);
    return units > 0n ? units : null;
  } catch { return null; }
}

function unitsToNumber(value, decimals) {
  let raw;
  try { raw = BigInt(String(value)); } catch { return null; }
  if (raw <= 0n || raw > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const places = Number(decimals);
  if (!Number.isInteger(places) || places < 0 || places > 30) return null;
  const scale = 10n ** BigInt(places);
  const whole = raw / scale;
  const remainder = raw % scale;
  const fraction = places ? remainder.toString().padStart(places, '0').replace(/0+$/, '') : '';
  const parsed = Number(fraction ? `${whole}.${fraction}` : String(whole));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function collectTextValues(value, out = [], depth = 0) {
  if (depth > 8 || value == null) return out;
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectTextValues(item, out, depth + 1));
    return out;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (['text', 'comment', 'value'].includes(key.toLowerCase()) && typeof child === 'string') out.push(child);
      else collectTextValues(child, out, depth + 1);
    }
  }
  return out;
}

function hasExactReference(transfer, reference) {
  const expected = String(reference || '').trim();
  if (!expected) return false;
  return collectTextValues(transfer?.decoded_forward_payload).some(text => text.trim() === expected);
}

function findDecimals(value, depth = 0) {
  if (depth > 8 || value == null) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDecimals(item, depth + 1);
      if (found != null) return found;
    }
    return null;
  }
  if (typeof value !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(value, 'decimals')) {
    const decimals = Number(value.decimals);
    if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 30) return decimals;
  }
  for (const child of Object.values(value)) {
    const found = findDecimals(child, depth + 1);
    if (found != null) return found;
  }
  return null;
}

function findSymbol(value, depth = 0) {
  if (depth > 8 || value == null) return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSymbol(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value !== 'object') return '';
  if (typeof value.symbol === 'string') return value.symbol.trim();
  for (const child of Object.values(value)) {
    const found = findSymbol(child, depth + 1);
    if (found) return found;
  }
  return '';
}

async function sleep(ms) {
  if (ms > 0) await new Promise(resolve => setTimeout(resolve, ms));
}

async function withPublicRateLimit(work) {
  const previous = publicRequestTail;
  let release;
  publicRequestTail = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    await sleep(PUBLIC_API_MIN_INTERVAL_MS - (Date.now() - lastPublicRequestAt));
    return await work();
  } finally {
    lastPublicRequestAt = Date.now();
    release();
  }
}

async function tonCenterGet(path, params, { fetchImpl = globalThis.fetch, apiKey = process.env.TONCENTER_API_KEY } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('TON_PROVIDER_UNAVAILABLE');
  const url = new URL(`${TONCENTER_BASE}${path}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const headers = { accept: 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;
  const request = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url.toString(), { method: 'GET', headers, signal: controller.signal });
      if (!response.ok) throw new Error('TON_PROVIDER_UNAVAILABLE');
      return await response.json();
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('TON_PROVIDER_TIMEOUT');
      if (error?.message === 'TON_PROVIDER_UNAVAILABLE') throw error;
      throw new Error('TON_PROVIDER_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  };
  return apiKey ? request() : withPublicRateLimit(request);
}

async function getJettonMasterInfo(masterAddress, options = {}) {
  const normalizedMaster = normalizeTonAddress(masterAddress);
  if (!normalizedMaster) throw new Error('INVALID_JETTON_MASTER_ADDRESS');
  const cached = masterCache.get(normalizedMaster);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const result = await tonCenterGet('/jetton/masters', {
    address: normalizedMaster,
    limit: 10
  }, options);
  const masters = Array.isArray(result?.jetton_masters) ? result.jetton_masters : [];
  const master = masters.find(item => normalizeTonAddress(item?.address) === normalizedMaster);
  if (!master) throw new Error('JETTON_MASTER_NOT_FOUND');

  const metadata = result?.metadata || {};
  const matchingMetadata = Object.entries(metadata).find(([address]) => normalizeTonAddress(address) === normalizedMaster)?.[1];
  const metadataCandidates = [matchingMetadata, ...Object.values(metadata), master.jetton_content, master].filter(Boolean);
  let decimals = null;
  let symbol = '';
  for (const item of metadataCandidates) {
    if (decimals == null) decimals = findDecimals(item);
    if (!symbol) symbol = findSymbol(item);
  }
  if (decimals == null) throw new Error('JETTON_DECIMALS_UNAVAILABLE');
  const value = { decimals, symbol };
  masterCache.set(normalizedMaster, { value, expiresAt: Date.now() + 10 * 60 * 1000 });
  return value;
}

function parseTimestamp(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

async function verifyGramJettonTransfer({ txHash, depositAddress, jettonMaster, reference, decimals }, options = {}) {
  const normalizedHash = normalizeTonTxHash(txHash);
  const normalizedDeposit = normalizeTonAddress(depositAddress);
  const normalizedMaster = normalizeTonAddress(jettonMaster);
  if (!normalizedHash || !normalizedDeposit || !normalizedMaster || !reference) {
    return { status: 'mismatch', code: 'INVALID_DEPOSIT_DETAILS' };
  }

  const txResponse = await tonCenterGet('/transactions', { hash: normalizedHash, limit: 1 }, options);
  const transactions = Array.isArray(txResponse?.transactions) ? txResponse.transactions : [];
  const tx = transactions.find(item => normalizeTonTxHash(item?.hash) === normalizedHash);
  if (!tx) return { status: 'pending', code: 'TON_TRANSACTION_NOT_INDEXED' };

  const description = tx.description || {};
  if (description.aborted === true || description.compute_ph?.success === false || description.action?.success === false) {
    return { status: 'mismatch', code: 'TON_TRANSACTION_FAILED' };
  }
  if (description.aborted !== false) return { status: 'pending', code: 'TON_TRANSACTION_NOT_FINAL' };

  const txNow = parseTimestamp(tx.now);
  const start = txNow == null ? undefined : Math.max(0, txNow - 300);
  const end = txNow == null ? undefined : txNow + 300;
  const transfersResponse = await tonCenterGet('/jetton/transfers', {
    owner_address: normalizedDeposit,
    jetton_master: normalizedMaster,
    direction: 'in',
    start_utime: start,
    end_utime: end,
    limit: 1000,
    sort: 'desc'
  }, options);
  const transfers = Array.isArray(transfersResponse?.jetton_transfers) ? transfersResponse.jetton_transfers : [];
  const txTraceId = String(tx.trace_id || '').toLowerCase();
  const transfer = transfers.find(item => {
    const eventHash = normalizeTonTxHash(item?.transaction_hash);
    const sameHash = eventHash === normalizedHash;
    const sameTrace = txTraceId && String(item?.trace_id || '').toLowerCase() === txTraceId;
    return (sameHash || sameTrace)
      && normalizeTonAddress(item?.destination) === normalizedDeposit
      && normalizeTonAddress(item?.jetton_master) === normalizedMaster;
  });
  if (!transfer) return { status: 'pending', code: 'JETTON_TRANSFER_NOT_INDEXED' };
  if (transfer.transaction_aborted !== false) {
    return transfer.transaction_aborted === true
      ? { status: 'mismatch', code: 'JETTON_TRANSFER_ABORTED' }
      : { status: 'pending', code: 'JETTON_TRANSFER_NOT_FINAL' };
  }
  if (!hasExactReference(transfer, reference)) return { status: 'mismatch', code: 'DEPOSIT_REFERENCE_MISMATCH' };

  let amountRaw;
  try { amountRaw = BigInt(String(transfer.amount)); } catch { return { status: 'mismatch', code: 'INVALID_JETTON_AMOUNT' }; }
  if (amountRaw <= 0n) return { status: 'mismatch', code: 'INVALID_JETTON_AMOUNT' };
  const amount = unitsToNumber(amountRaw, decimals);
  if (amount == null) return { status: 'mismatch', code: 'JETTON_AMOUNT_OUT_OF_RANGE' };

  return {
    status: 'verified',
    txHash: normalizedHash,
    amountRaw: amountRaw.toString(),
    amount,
    decimals: Number(decimals),
    sourceAddress: normalizeTonAddress(transfer.source) || '',
    confirmedAt: new Date((parseTimestamp(transfer.transaction_now) || txNow || Math.floor(Date.now() / 1000)) * 1000)
  };
}

function createDepositReference() {
  return `GRAMUP:${crypto.randomBytes(20).toString('hex').toUpperCase()}`;
}

module.exports = {
  TONCENTER_BASE,
  normalizeTonAddress,
  normalizeTonTxHash,
  amountToUnits,
  unitsToNumber,
  collectTextValues,
  hasExactReference,
  getJettonMasterInfo,
  verifyGramJettonTransfer,
  createDepositReference
};
