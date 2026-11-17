import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Pure reads of synthetic ledger rows. No login, SQL, RPC or mutation executor.
const range = { start: new Date('2026-11-17T00:00:00Z'), end: new Date('2026-11-17T23:59:59.999Z') };
const register = { id: 'register', locationId: 'location', openedAt: range.start.toISOString(),
  closedAt: range.end.toISOString(), openingCash: 10, status: 'closed', expectedCash: 60, actualCash: 60, difference: 0 };
const row = (patch = {}) => ({ id: 'synthetic', date: '2026-11-17T12:00:00Z', paymentMethod: 'Cash',
  type: 'income', ledgerType: 'income', amount: 45, relatedSaleId: 'sale', relatedCashRegisterId: 'register', ...patch });
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a); return source.slice(a, b);
}
function readers(source) {
  return Function(`
    const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
    const withinRange=(iso,r)=>new Date(iso)>=r.start&&new Date(iso)<=r.end;
    ${section(source, 'const CASH_REGISTER_CATEGORIES =', '// ---- Operations.')}
    ${section(source, 'function getCashRegisterAnalytics(', '// ---- Expense analytics')}
    return {cashRegisterEntries,calculateExpectedCash,cashRegisterBreakdown,getCashRegisterAnalytics};
  `)();
}
for (const file of ['App.jsx', 'src/App.jsx']) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8'), api = readers(source);
  test(`${file}: opening mapped to income with an invalid sale link cannot inflate Cash Sales from 45 to 145`, () => {
    const rows = [row({ ledgerType: 'opening_balance', amount: 100, relatedCashRegisterId: 'other-register' }), row()];
    const before = JSON.stringify(rows);
    assert.equal(api.getCashRegisterAnalytics([register], rows, range).cashSales, 45);
    assert.equal(JSON.stringify(rows), before);
  });
  test(`${file}: sale-linked expense remains a drawer adjustment rather than a negative cash sale`, () => {
    const rows = [row(), row({ id: 'correction', type: 'expense', ledgerType: 'expense', amount: 5, category: 'Historical correction' })];
    assert.equal(api.cashRegisterBreakdown(register, rows).cashSales, 45);
    assert.equal(api.cashRegisterBreakdown(register, rows).adjustments, -5);
    assert.equal(api.calculateExpectedCash(register, rows), 50);
  });
  test(`${file}: original ledger type controls the sign even when presentation type differs`, () => {
    const rows = [row(), row({ ledgerType: 'expense', amount: 3, relatedSaleId: '', relatedExpenseId: 'expense' })];
    assert.equal(api.calculateExpectedCash(register, rows), 52);
    assert.equal(api.cashRegisterBreakdown(register, rows).cashSales, 45);
  });
  test(`${file}: unmapped original opening rows are excluded without losing an expense using the opening category`, () => {
    const rows = [row(), row({ type: 'opening_balance', ledgerType: undefined, amount: 100 }),
      row({ type: 'expense', ledgerType: 'expense', category: 'Cash Register - Opening', amount: 5, relatedSaleId: '', relatedExpenseId: 'expense' })];
    assert.equal(api.cashRegisterEntries(register, rows).length, 2);
    assert.equal(api.calculateExpectedCash(register, rows), 50);
  });
  test(`${file}: legacy income rows work and noncash unlinked or out-of-period rows never become Cash Sales`, () => {
    const rows = [row({ ledgerType: undefined }), row({ paymentMethod: 'Card', amount: 100 }),
      row({ relatedSaleId: '', amount: 100 }), row({ date: '2026-11-18T00:00:00Z', amount: 100 })];
    assert.equal(api.getCashRegisterAnalytics([register], rows, range).cashSales, 45);
  });
  test(`${file}: stored balanced closes and gross sale/refund categories retain their separate meanings`, () => {
    const rows = [row(), row({ ledgerType: 'expense', type: 'expense', amount: 45, category: 'Sale Cancellation' }),
      row({ relatedSaleId: '', category: 'Cash Addition', amount: 5 })];
    const report = api.getCashRegisterAnalytics([register], rows, range);
    assert.equal(report.cashSales, 45); assert.equal(report.balancedCount, 1);
    const breakdown = api.cashRegisterBreakdown(register, rows);
    assert.equal(breakdown.refunds, -45); assert.equal(breakdown.additions, 5);
    assert.equal(api.calculateExpectedCash(register, rows), 15);
    assert.equal(register.expectedCash, 60); assert.equal(register.actualCash, 60);
  });
}
