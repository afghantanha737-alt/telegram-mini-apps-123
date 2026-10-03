'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  normalizeTonAddress,
  normalizeTonTxHash,
  amountToUnits,
  unitsToNumber,
  hasExactReference,
  getJettonMasterInfo,
  verifyGramJettonTransfer
} = require('../utils/tonDepositVerify');

const mainnetFriendly = 'EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF';
const mainnetRaw = '0:ca6e321c7cce9ecedf0a8ca2492ec8592494aa5fb5ce0387dff96ef6af982a3e';
const testnetFriendly = 'kQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPgpP';
const master = '0:1111111111111111111111111111111111111111111111111111111111111111';
const destination = '0:2222222222222222222222222222222222222222222222222222222222222222';
const sender = '0:3333333333333333333333333333333333333333333333333333333333333333';
const hash = 'a'.repeat(64);

async function run() {
  assert.strictEqual(normalizeTonAddress(mainnetFriendly), mainnetRaw, 'official friendly address normalizes to its raw address');
  assert.strictEqual(normalizeTonAddress(mainnetFriendly.replace(/-/g, '+').replace(/_/g, '/')), mainnetRaw, 'standard Base64 address form is supported');
  assert.strictEqual(normalizeTonAddress(testnetFriendly), null, 'testnet-only friendly addresses are rejected');
  assert.strictEqual(normalizeTonAddress(mainnetRaw.toUpperCase()), mainnetRaw, 'raw addresses normalize case-insensitively');
  assert.strictEqual(normalizeTonAddress(`${mainnetFriendly.slice(0, -1)}A`), null, 'bad friendly checksum is rejected');
  assert.strictEqual(normalizeTonTxHash(`0x${hash.toUpperCase()}`), hash, 'hex transaction hash is normalized');
  assert.strictEqual(normalizeTonTxHash('not-a-hash'), null, 'invalid transaction hash is rejected');

  assert.strictEqual(amountToUnits(1.25, 9).toString(), '1250000000');
  assert.strictEqual(amountToUnits(0.0000001, 6), null, 'minimum values not representable at token precision are rejected');
  assert.strictEqual(unitsToNumber('1250000000', 9), 1.25);
  assert.strictEqual(unitsToNumber('9007199254740992', 9), null, 'unsafe JS numeric amounts fail closed');

  const reference = 'GRAMUP:ABC123';
  assert.strictEqual(hasExactReference({ decoded_forward_payload: { type: 'text_comment', comment: reference } }, reference), true);
  assert.strictEqual(hasExactReference({ decoded_forward_payload: { comment: `${reference}-other` } }, reference), false, 'reference must match exactly');

  const masterResponse = {
    jetton_masters: [{ address: master, metadata: { decimals: '9', symbol: 'GRAM' } }]
  };
  const masterInfo = await getJettonMasterInfo(master, {
    apiKey: 'test-key',
    fetchImpl: async url => {
      assert.ok(String(url).startsWith('https://toncenter.com/api/v3/jetton/masters?'), 'only TON Mainnet v3 is queried');
      return { ok: true, json: async () => masterResponse };
    }
  });
  assert.deepStrictEqual(masterInfo, { decimals: 9, symbol: 'GRAM' });

  const requests = [];
  const now = 1790964000;
  const verified = await verifyGramJettonTransfer({
    txHash: hash,
    depositAddress: destination,
    jettonMaster: master,
    reference,
    decimals: 9
  }, {
    apiKey: 'test-key',
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), headers: init.headers });
      if (String(url).includes('/transactions?')) {
        return {
          ok: true,
          json: async () => ({ transactions: [{ hash, now, trace_id: 'trace-1', description: { aborted: false } }] })
        };
      }
      return {
        ok: true,
        json: async () => ({ jetton_transfers: [{
          transaction_hash: hash,
          trace_id: 'trace-1',
          transaction_now: now,
          transaction_aborted: false,
          destination,
          jetton_master: master,
          source: sender,
          amount: '2500000000',
          decoded_forward_payload: { type: 'text_comment', comment: reference }
        }] })
      };
    }
  });
  assert.strictEqual(requests.length, 2, 'transaction and decoded Jetton transfer are both checked');
  assert.ok(requests.every(item => item.url.startsWith('https://toncenter.com/api/v3/')), 'verification uses mainnet Toncenter API v3');
  assert.ok(requests.every(item => item.headers['X-API-Key'] === 'test-key'));
  assert.strictEqual(verified.status, 'verified');
  assert.strictEqual(verified.amountRaw, '2500000000');
  assert.strictEqual(verified.amount, 2.5);
  assert.strictEqual(verified.sourceAddress, sender);

  const notIndexed = await verifyGramJettonTransfer({
    txHash: hash,
    depositAddress: destination,
    jettonMaster: master,
    reference,
    decimals: 9
  }, {
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: true, json: async () => ({ transactions: [] }) })
  });
  assert.deepStrictEqual(notIndexed, { status: 'pending', code: 'TON_TRANSACTION_NOT_INDEXED' });

  const aborted = await verifyGramJettonTransfer({
    txHash: hash,
    depositAddress: destination,
    jettonMaster: master,
    reference,
    decimals: 9
  }, {
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: true, json: async () => ({ transactions: [{ hash, description: { aborted: true } }] }) })
  });
  assert.deepStrictEqual(aborted, { status: 'mismatch', code: 'TON_TRANSACTION_FAILED' }, 'aborted chain transactions fail closed');

  let mismatchCall = 0;
  const wrongReference = await verifyGramJettonTransfer({
    txHash: hash,
    depositAddress: destination,
    jettonMaster: master,
    reference,
    decimals: 9
  }, {
    apiKey: 'test-key',
    fetchImpl: async () => {
      mismatchCall += 1;
      if (mismatchCall === 1) {
        return { ok: true, json: async () => ({ transactions: [{ hash, now, trace_id: 'trace-1', description: { aborted: false } }] }) };
      }
      return { ok: true, json: async () => ({ jetton_transfers: [{
        transaction_hash: hash,
        trace_id: 'trace-1',
        transaction_aborted: false,
        destination,
        jetton_master: master,
        amount: '2500000000',
        decoded_forward_payload: { type: 'text_comment', comment: 'GRAMUP:OTHER' }
      }] }) };
    }
  });
  assert.deepStrictEqual(wrongReference, { status: 'mismatch', code: 'DEPOSIT_REFERENCE_MISMATCH' }, 'another user invoice reference cannot be credited');

  const project = path.resolve(__dirname, '..');
  const route = fs.readFileSync(path.join(project, 'routes/points.js'), 'utf8');
  const model = fs.readFileSync(path.join(project, 'models/Deposit.js'), 'utf8');
  const settings = fs.readFileSync(path.join(project, 'models/Settings.js'), 'utf8');
  const ui = fs.readFileSync(path.join(project, 'public/js/app.js'), 'utf8');
  assert.ok(route.includes("router.post('/deposits/:id/verify'"));
  assert.ok(route.includes('await verifyGramJettonTransfer('));
  assert.ok(route.includes('await withMongoTransaction(async session =>'));
  assert.ok(route.includes("type: 'deposit'"));
  assert.ok(route.includes('txHashNormalized: { $exists: false }'));
  assert.ok(model.includes("unique: true, partialFilterExpression: { status: 'pending' }"));
  assert.ok(model.includes("partialFilterExpression: { txHashNormalized: { $type: 'string' } }"));
  assert.ok(settings.includes("depositEnabled: { type: Boolean, default: false }"), 'deposits default off');
  assert.ok(ui.includes('depositPanel'));
  assert.ok(ui.includes('submitGramDeposit'));

  console.log('TON Deposit verifier tests passed (mocked read-only provider; no live transfers).');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
