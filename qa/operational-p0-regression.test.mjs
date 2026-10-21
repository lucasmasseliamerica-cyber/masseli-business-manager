import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { evaluateOperationalReadiness, operationalModules } from './operational-readiness.mjs';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `missing implementation: ${start}`);
  return source.slice(a, b);
}
function rest(fetchImpl) {
  const context = vm.createContext({ supabaseFetch: fetchImpl, Date, Set, Map, Number, JSON, Object, String });
  vm.runInContext(section('let _unconfirmedRpcWrite =', 'function encodeStorageObjectPath(')
    + ';globalThis.api=supabaseRest;', context);
  return context.api;
}

test('CSV reports neutralize spreadsheet formulas without changing numeric financial amounts', () => {
  const context = vm.createContext({ String });
  vm.runInContext(section('const csvEscape =', 'function downloadCSV(') + ';globalThis.escape=csvEscape;', context);
  for (const input of ['=1+1', '+cmd', '-cmd', '@SUM(A1)', '  =HYPERLINK("https://example.invalid")', '\ufeff=1', '\t=1', '\r=1', '\n=1']) {
    const encoded = context.escape(input);
    // Decode one RFC4180 field to verify the actual spreadsheet value starts with an apostrophe.
    const decoded = encoded.startsWith('"') ? encoded.slice(1, -1).replace(/""/g, '"') : encoded;
    assert.equal(decoded, "'" + input);
  }
  for (const value of [-25.5, 0, 12.34]) assert.equal(context.escape(value), String(value));
  assert.equal(context.escape(null), '');
  assert.equal(context.escape('Açaí'), 'Açaí');
  assert.equal(context.escape('a\rb'), '"a\rb"');
  assert.equal(context.escape('a,"b"'), '"a,""b"""');
});

for (const [status, malformed] of [[502, false], [504, false], [408, false], [200, true]]) {
  test(`non-idempotent supplier payment: ${malformed ? 'malformed success' : status} freezes further mutations`, async () => {
    let calls = 0;
    const api = rest(async () => {
      calls++;
      return { ok: status === 200, status, json: async () => { if (malformed) throw new SyntaxError('truncated response'); return {}; } };
    });
    await assert.rejects(api.rpc('fn_pay_purchase_order', { p_amount: 10 }), error => error.commitUncertain === true);
    await assert.rejects(api.rpc('fn_pay_purchase_order', { p_amount: 10 }), error => error.commitUncertain === true);
    assert.equal(calls, 1, 'an uncertain gateway response must not cause a second payment');
  });
}

test('idempotent sale preserves replay identity after gateway timeout', async () => {
  const requests = [];
  const api = rest(async (_path, options) => {
    requests.push(options.body);
    return requests.length === 1 ? { ok: false, status: 504, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => ({ id: 'unchanged-sale' }) };
  });
  const payload = { p_sale_id: 'unchanged-sale' };
  await assert.rejects(api.rpc('fn_create_sale', payload), error => error.commitUncertain === true && error.retrySafe === true);
  assert.equal((await api.rpc('fn_create_sale', payload)).id, payload.p_sale_id);
  assert.equal(requests[0], requests[1]);
});

test('definitive SQL validation rejection does not masquerade as unknown commit', async () => {
  let calls = 0;
  const api = rest(async () => { calls++; return { ok: false, status: 400, json: async () => ({ code: 'P0001' }) }; });
  for (let i = 0; i < 2; i++) await assert.rejects(api.rpc('fn_pay_purchase_order', {}), error => !error.commitUncertain);
  assert.equal(calls, 2);
});

test('complete financial history survives both the former 500-row cap and a smaller server page cap', async () => {
  const dataset = Array.from({ length: 1205 }, (_, i) => ({ id: `row-${i}`, amount: 1 }));
  const offsets = [];
  const api = rest(async (path, options) => {
    assert.equal(options.method, 'GET');
    const url = new URL(path, 'https://isolated.invalid');
    assert.equal(url.searchParams.get('business_id'), 'eq.tenant-a');
    assert.equal(url.searchParams.get('order'), 'expense_date.desc,id.asc');
    const offset = Number(url.searchParams.get('offset'));
    offsets.push(offset);
    return Response.json(dataset.slice(offset, offset + 73), { headers: { 'content-range': `${offset}-${Math.min(offset + 72, 1204)}/1205` } });
  });
  const rows = await api.select('expenses', 'select=*&business_id=eq.tenant-a&order=expense_date.desc');
  assert.equal(rows.length, 1205);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 1205);
  assert.equal(offsets.at(-1), 1168);
  assert.doesNotMatch(section('function useSupabaseSales(', 'function useTheme('), /&limit=(?:250|500|1000|2000|3000)/);
});

test('pagination does not assume a short page means complete history without a reported count', async () => {
  const dataset = Array.from({ length: 501 }, (_, i) => ({ id: `row-${i}` }));
  const api = rest(async path => {
    const offset = Number(new URL(path, 'https://isolated.invalid').searchParams.get('offset'));
    return Response.json(dataset.slice(offset, offset + 125));
  });
  assert.equal((await api.selectRpc('fn_read_sale_items_secure', 'select=*&sale_id=eq.sale')).length, 501);
});

test('dependent UUID filters are split without losing tenant filters or associated rows', async () => {
  const ids = Array.from({ length: 215 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
  let calls = 0;
  const api = rest(async path => {
    calls++;
    assert.ok(path.length < 5000);
    const url = new URL(path, 'https://isolated.invalid');
    assert.equal(url.searchParams.get('business_id'), 'eq.tenant-a');
    const part = url.searchParams.get('sale_id').slice(4, -1).split(',');
    return Response.json(part.map(id => ({ id })), { headers: { 'content-range': `0-${part.length - 1}/${part.length}` } });
  });
  const rows = await api.selectRpc('fn_read_sale_items_secure', `select=*&business_id=eq.tenant-a&sale_id=in.(${ids.join(',')})`);
  assert.equal(rows.length, 215);
  assert.equal(calls, 3);
});

test('read failures, repeated pages and changing counts cannot return partial financial totals', async () => {
  for (const failure of ['http', 'duplicate', 'changed', 'incomplete']) {
    let calls = 0;
    const api = rest(async () => {
      calls++;
      if (calls === 1) return Response.json([{ id: 'first' }], { headers: { 'content-range': '0-0/2' } });
      if (failure === 'http') return Response.json({}, { status: 503 });
      if (failure === 'duplicate') return Response.json([{ id: 'first' }]);
      if (failure === 'changed') return Response.json([{ id: 'second' }], { headers: { 'content-range': '1-1/3' } });
      return Response.json([]);
    });
    await assert.rejects(api.select('cash_flow', 'select=*'), /failed|Data changed|incomplete history/);
  }
});

test('oversized operational histories fail visibly while explicit identity probes stay single-page', async () => {
  const api = rest(async () => Response.json([{ id: 'first' }], { headers: { 'content-range': '0-0/10001' } }));
  await assert.rejects(api.select('sales'), /Too many records/);
  let calls = 0;
  const probe = rest(async path => { calls++; assert.ok(path.endsWith('select=id&limit=1')); return Response.json([{ id: 'first' }]); });
  assert.equal((await probe.select('users', 'select=id&limit=1')).length, 1);
  assert.equal(calls, 1);
});

function payments(mode) {
  const context = vm.createContext({ Promise, Date, Math, setTimeout });
  vm.runInContext(section('const PAYMENT_MODE =', '/* ============================== SALE PAYMENT LIFECYCLE')
    .replace('import.meta.env.VITE_CARD_PAYMENT_MODE', JSON.stringify(mode))
    + ';const CARD_PAYMENT_METHODS=["Credit Card","Debit Card"];globalThis.payment=paymentService;', context);
  return context.payment;
}

test('operational card default never fabricates a processor approval or a transaction ID', async () => {
  const service = payments(undefined);
  assert.equal(service.getMode(), 'external');
  const handle = service.processPayment({ paymentMethod: 'Credit Card', amount: 25, currency: 'BRL' });
  let settled = false;
  handle.promise.then(() => { settled = true; });
  await handle.readyPromise;
  await Promise.resolve();
  assert.equal(settled, false, 'the sale cannot finalize before explicit confirmation of the external payment');
  handle.approve(); handle.approve(); handle.cancel();
  const result = await handle.promise;
  assert.equal(result.provider, 'external_card');
  assert.equal(result.transactionId, null);
  assert.equal(result.currency, 'BRL');
  assert.equal(result.success, true);
  assert.match(source, /currency: settings.currency \|\| "USD"/);
});

test('canceling an external card confirmation never settles as paid; simulation stays explicit', async () => {
  const handle = payments('external').processPayment({ paymentMethod: 'Debit Card', amount: 25 });
  handle.cancel(); handle.approve();
  assert.equal((await handle.promise).success, false);
  assert.equal(payments('simulator').getMode(), 'simulator');
  const receipt = section('function renderPaymentReceiptBody(', '// ---- Browser print adapter');
  assert.match(receipt, /RECORDED IN NEXALVO/);
  assert.doesNotMatch(receipt, /"APPROVED"/);
});

test('calendar validation rejects normalized impossible dates before financial writes', () => {
  const context = vm.createContext({ Date, Number });
  vm.runInContext(section('function isValidCalendarDate(', '/* ---- end centralized local-date utility') + ';globalThis.valid=isValidCalendarDate;', context);
  for (const value of ['2025-02-29', '2026-02-31', '2026-13-01', '', undefined]) assert.equal(context.valid(value), false);
  for (const value of ['2024-02-29', '2026-10-20']) assert.equal(context.valid(value), true);
  assert.match(section('function ExpenseModal(', 'function SimpleCrudView('), /!isValidCalendarDate\(date\)/);
  assert.match(section('function NewPurchaseModal(', 'function PurchaseDetailModal('), /!isValidCalendarDate\(orderDate\)/);
});

test('supplier receipt/payment forms freeze visibly after an uncertain commit and reject nonfinite quantities', () => {
  for (const [start, end] of [['function ReceivePurchaseModal(', 'function PaymentModal('], ['function PaymentModal(', 'function ProductsView(']]) {
    const modal = section(start, end);
    assert.match(modal, /if \(submitting \|\| uncertain\) return/);
    assert.match(modal, /setUncertain\(!!e\?\.commitUncertain\)/);
    assert.match(modal, /disabled=\{submitting \|\| uncertain\}/);
    assert.match(modal, /Number.isFinite/);
  }
});

test('automatic CI cannot run persistent TEST groups without an explicit manual authorization', () => {
  const workflow = readFileSync(new URL('../.github/workflows/nexalvo-test.yml', import.meta.url), 'utf8');
  assert.match(workflow, /authorize_persistent_test_flows:[\s\S]*?default: false/);
  for (const [job, file] of [
    ['authenticated-concurrency', 'concurrency-authenticated.test.mjs'], ['replay-financial', 'replay-financial.test.mjs'],
    ['network-after-commit', 'p0-network-after-commit.test.mjs'], ['two-tenant-concurrency', 'concurrency-two-tenants.test.mjs'],
  ]) {
    const start = workflow.indexOf(`\n  ${job}:`), end = workflow.indexOf('\n  ', start + 4);
    const guard = workflow.slice(start, workflow.indexOf('    environment:', start));
    assert.match(guard, /github.event_name == 'workflow_dispatch'/);
    assert.match(guard, /inputs.authorize_persistent_test_flows == true/);
    const runner = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
    assert.match(runner, /NEXALVO_PERSISTENT_QA_AUTHORIZED/);
    assert.match(runner, /TEST_ONLY_EXPLICIT/);
  }
  assert.match(workflow, /blocked_groups=4/);
  assert.match(workflow, /persistent groups BLOCKED/);
});

test('operational coverage cannot count mocks or blocked journeys as acceptance', () => {
  const products = operationalModules.find(module => module.id === 'products');
  const storage = products.criteria.find(c => c.title.startsWith('Storage privado:'));
  const photoEvidence = JSON.parse(readFileSync(new URL('../docs/evidence/photo-a-journey-user-confirmed-20261021.json', import.meta.url), 'utf8'));
  assert.equal(storage.status, 'CONCLUÍDO');
  assert.equal(storage.evidence.kind, 'USER_CONFIRMED_JOURNEY');
  assert.equal(photoEvidence.code, 'REAL_PHOTO_JOURNEY_RESTORED');
  assert.equal(photoEvidence.executed_by_this_linux_session, false);
  assert.deepEqual(photoEvidence.acceptance_promoted, [storage.title]);
  assert.equal(products.criteria.find(c => c.title.startsWith('Foto real')).status, 'BLOQUEADO');
  assert.equal(operationalModules.find(m => m.id === 'sales').criteria.find(c => c.title.startsWith('UI:')).status, 'BLOQUEADO');
  const criterion = operationalModules[0].criteria[0];
  const half = evaluateOperationalReadiness([{ id: 'case', criteria: [criterion, { title: 'Live journey', status: 'BLOQUEADO', blocker: 'specific authorization' }] }]);
  assert.equal(half.percent, 50);
  assert.equal(half.ready, false);
  assert.throws(() => evaluateOperationalReadiness([{ id: 'case', criteria: [{ ...criterion, evidence: { ...criterion.evidence, kind: 'SIMULATED_HTTP' } }] }]), /real evidence/);
  assert.throws(() => evaluateOperationalReadiness([{ id: 'case', criteria: [{ title: 'Live journey', status: 'BLOQUEADO' }] }]), /Unclassified/);
});

test('operational catalog preflight only inspects definitions and never applies prepared packages', () => {
  const sql = readFileSync(new URL('./sql/operational_release_preflight_readonly_TEST.sql', import.meta.url), 'utf8').replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|GRANT|REVOKE|TRUNCATE|CALL|DO|EXECUTE)\b\s+(?!'|\))/i);
  assert.match(sql, /pg_get_functiondef\(p\.oid\)/);
  assert.match(sql, /EXTERNAL_CONFIRMATION_REQUIRED/);
  assert.match(sql, /BLOCKED_PREPARED_PACKAGES/);
  assert.doesNotMatch(sql, /auth\.users|encrypted_password|raw_app_meta_data/);
});

function reportCalendar(zone, now) {
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const context = vm.createContext({ Date: Clock, Intl, Number, Math, Object });
  vm.runInContext(section('const businessNow =', '/* ---- end centralized local-date utility')
    + section('function offsetCalendarDate(', '// The ONE place "valid sale for reporting"')
    + section('function getRevenueTrend(', '// ---- Product Performance')
    + `;setActiveTimezone(${JSON.stringify(zone)});globalThis.calendar={getDateRange,getPreviousRange,withinRange,getRevenueTrend};`
    + ';const filterSalesByRange=()=>[];', context);
  return context.calendar;
}

test('report dates follow the company timezone and include date-only expenses independently of browser timezone', () => {
  const api = reportCalendar('America/Sao_Paulo', '2026-10-20T01:00:00Z');
  const today = api.getDateRange('today');
  assert.equal(today.start.toISOString(), '2026-10-19T03:00:00.000Z');
  assert.equal(today.end.toISOString(), '2026-10-20T02:59:59.999Z');
  assert.equal(api.withinRange('2026-10-19', today), true);
  assert.equal(api.withinRange('2026-10-20', today), false);
  assert.equal(api.withinRange('2026-10-20T02:59:00Z', today), true);
  assert.equal(api.withinRange('2026-10-20T03:00:00Z', today), false);
});

test('report comparisons preserve calendar days across daylight-saving changes', () => {
  for (const [now, hours, start, end] of [
    ['2026-11-01T15:00:00Z', 25, '2026-11-01T04:00:00.000Z', '2026-11-02T04:59:59.999Z'],
    ['2026-03-08T15:00:00Z', 23, '2026-03-08T05:00:00.000Z', '2026-03-09T03:59:59.999Z'],
  ]) {
    const api = reportCalendar('America/New_York', now), current = api.getDateRange('today');
    assert.equal(current.start.toISOString(), start); assert.equal(current.end.toISOString(), end);
    assert.equal(current.end - current.start + 1, hours * 3600000);
    const previous = api.getPreviousRange(current);
    assert.equal(previous.end.getTime() + 1, current.start.getTime());
    assert.equal(previous.end - previous.start + 1, 24 * 3600000);
  }
});

test('31 civil days stay in daily revenue buckets rather than rounding into weekly buckets', () => {
  const api = reportCalendar('America/New_York', '2026-10-20T15:00:00Z');
  const range = api.getDateRange('custom', '2026-10-01', '2026-10-31');
  assert.equal(api.getRevenueTrend([], range).bucketType, 'day');
  const reverse = api.getDateRange('custom', '2026-10-31', '2026-10-01');
  assert.equal(reverse.start.toISOString(), range.start.toISOString());
  assert.equal(reverse.end.toISOString(), range.end.toISOString());
});
