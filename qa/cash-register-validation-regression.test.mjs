import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const files = ['App.jsx', 'src/App.jsx'];

function section(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `${startToken} section was not found`);
  return source.slice(start, end);
}

function operations(source) {
  const context = vm.createContext({
    Number,
    CASH_MOVEMENT_TYPES: [
      { key: 'addition', label: 'Cash Addition', cashType: 'income', category: 'Cash Addition' },
      { key: 'withdrawal', label: 'Cash Withdrawal', cashType: 'expense', category: 'Cash Withdrawal' },
    ],
    round2: (value) => Math.round((value + Number.EPSILON) * 100) / 100,
  });
  vm.runInContext(
    section(source, 'async function recordCashMovement(', 'async function closeCashRegister(') +
    section(source, 'async function closeCashRegister(', '/* ============================== CUSTOMER MANAGEMENT') +
    ';globalThis.api={recordCashMovement,closeCashRegister};',
    context,
  );
  return context.api;
}

for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

  test(`${file}: invalid cash movements fail before the remote RPC`, async () => {
    const api = operations(source);
    let calls = 0;
    const ctx = { cashRegisterOps: { remote: true, movement: async () => { calls += 1; } } };
    for (const input of [
      { movementType: 'addition', amount: Infinity, reason: 'test' },
      { movementType: 'addition', amount: -1, reason: 'test' },
      { movementType: 'unknown', amount: 1, reason: 'test' },
      { movementType: 'addition', amount: 1, reason: '   ' },
    ]) {
      const result = await api.recordCashMovement({ registerId: 'register-a', notes: '', ...input }, ctx);
      assert.equal(result.success, false);
    }
    assert.equal(calls, 0);
  });

  test(`${file}: valid cash movement is normalized before the remote RPC`, async () => {
    const api = operations(source);
    let payload;
    const ctx = { cashRegisterOps: { remote: true, movement: async (value) => { payload = value; return { success: true }; } } };
    const result = await api.recordCashMovement({ registerId: 'register-a', movementType: 'addition', amount: '12.345', reason: ' Till top-up ', notes: '' }, ctx);
    assert.equal(result.success, true);
    assert.equal(payload.amount, 12.35);
    assert.equal(payload.reason, 'Till top-up');
  });

  test(`${file}: invalid actual cash fails before close RPC and preview requires a finite value`, async () => {
    const api = operations(source);
    let calls = 0;
    const ctx = { cashRegisterOps: { remote: true, close: async () => { calls += 1; } } };
    for (const actualCash of [Infinity, -1, 'not-a-number']) {
      const result = await api.closeCashRegister({ registerId: 'register-a', actualCash, differenceReason: '', notes: '' }, ctx);
      assert.equal(result.success, false);
    }
    assert.equal(calls, 0);
    assert.match(source, /actualCash !== "" && Number\.isFinite\(Number\(actualCash\)\)/);
  });
}

test('root and src application copies remain identical after cash validation changes', () => {
  assert.equal(
    readFileSync(new URL('../App.jsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  );
});
