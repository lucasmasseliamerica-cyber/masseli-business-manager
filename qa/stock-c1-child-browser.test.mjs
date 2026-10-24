import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runC1ChildBrowserCycle } from './stock-c1-child-browser.mjs';
import { createC1BrowserGuard } from './stock-c1-browser-guard.mjs';
import { STOCK_ACTORS } from './stock-journey-core.mjs';
import { C1_FIXTURE as f, C1_CHECKS, makeC1State, c1Plan, c1ExpectedMovements, c1ExpectedAudit, verifyC1View } from './stock-c1-protocol.mjs';
const token = 'SYNTHETIC_CHILD_SESSION';
function fixture() {
  return { item: { id: f.item, business_id: STOCK_ACTORS.A.business, name: f.name, unit: 'unit', active: true, supplier_id: null },
    locations: [[f.source, f.sourceName], [f.target, f.targetName]].map(([id, name]) => ({ id, name, active: true, business_id: STOCK_ACTORS.A.business })),
    stocks: [f.source, f.target].map(location_id => ({ id: randomUUID(), inventory_item_id: f.item, location_id, qty: 2, avg_cost_per_unit: 0.1 })),
    recipes: [], purchaseLines: [], transactions: [], waste: [] };
}
function setup(newContext) {
  const state = makeC1State(fixture(), [], 'a'.repeat(40), 'b'.repeat(64), { at: Date.now(), until: Date.now() + 60000 });
  state.probes = []; // Parent probe receipts must never become new child probes.
  C1_CHECKS.slice(0, 8).forEach(name => { state.checks[name] = 'PASS'; });
  const report = { checks: { ...state.checks }, stock_requests_forwarded: 0, audit_requests_forwarded: 0, negative_requests_forwarded: 0 };
  let probes = 0, windows = 0;
  return { state, report, save: () => {}, windowGate: () => { windows++; }, runtime: { browser: { newContext } },
    client: { view: async () => ({ ...structuredClone(state.fixture), audit: [] }),
      browserSession: () => ({ token, user: { id: STOCK_ACTORS.A.owner } }), negativeProbe: () => { probes++; assert.fail('no probes'); } },
    counts: () => ({ probes, windows }) };
}
test('child browser rejects missing admission and nonzero prior counters before browser or probes', async () => {
  for (const change of [x => { x.save = null; }, x => { x.report.stock_requests_forwarded = 1; },
    x => { x.report.audit_requests_forwarded = 1; }, x => { x.report.negative_requests_forwarded = 1; },
    x => { x.state.probes.push({ actor: 'B', status: 'DENIED' }); },
    x => { x.state.pending = 'MOVEMENT'; x.state.operations = [{ name: 'COUNT', status: 'DISPATCHED', auditAttempted: false }]; },
    x => { x.state.confirmed = 1; x.state.operations = [{ name: 'COUNT', status: 'CONFIRMED', auditAttempted: false, rows: [{}] }]; }, x => { x.report.checks.permissions = 'BLOCKED'; },
    x => { x.client.browserSession = () => ({ token, user: { id: STOCK_ACTORS.B.owner } }); }]) {
    let starts = 0; const input = setup(async () => { starts++; assert.fail('no browser start'); }); change(input);
    await assert.rejects(runC1ChildBrowserCycle(input), error => /^C1_CHILD_/.test(error.code));
    assert.equal(starts, 0); assert.equal(input.counts().probes, 0);
  }
});
test('child browser classifies a raw Chromium context failure without disclosing the message or credentials', async () => {
  const input = setup(async () => { throw Error('Bearer SYNTHETIC_PRIVATE person@example.invalid C:\\private'); });
  await assert.rejects(runC1ChildBrowserCycle(input), error => {
    assert.equal(error.code, 'C1_CHILD_BROWSER_CONTEXT_FAILED');
    assert.equal(error.runtimeDiagnostic.stage, 'BROWSER_CONTEXT');
    assert.doesNotMatch(JSON.stringify(error), /Bearer|SYNTHETIC_PRIVATE|example\.invalid|private/); return true;
  });
  assert.equal(input.counts().probes, 0); assert.equal(input.report.stock_requests_forwarded, 0);
});
test('child browser closes only its context and sanitizes session initialization failure', async () => {
  let closes = 0; const input = setup(async () => ({ setDefaultTimeout() {},
    addInitScript: async () => { throw Error('SYNTHETIC_PRIVATE'); }, close: async () => { closes++; } }));
  await assert.rejects(runC1ChildBrowserCycle(input), error => error.code === 'C1_CHILD_BROWSER_SESSION_FAILED'
    && error.runtimeDiagnostic.stage === 'BROWSER_SESSION' && !JSON.stringify(error).includes('SYNTHETIC_PRIVATE'));
  assert.equal(closes, 1); assert.equal(input.counts().probes, 0);
});
function route(rpc, payload, forward, options = {}) {
  const trace = { forward: 0, abort: 0, fulfill: 0 };
  return { trace, request: () => ({ url: () => `${options.origin || 'https://msinksoilkluooxenecy.supabase.co'}/rest/v1/rpc/${rpc}`,
    method: () => 'POST', headers: () => ({ authorization: `Bearer ${options.token || token}` }), postDataJSON: () => payload }),
  fetch: async options => { assert.equal(options.maxRetries, 0); assert.equal(options.maxRedirects, 0); trace.forward++; return forward(); },
  abort: async () => { trace.abort++; }, fulfill: async () => { trace.fulfill++; }, continue: async () => assert.fail('no raw backend forwarding') };
}
function guardFixture(save) {
  const input = setup(async () => assert.fail('no browser')); const failures = [], phases = []; let stockStage = 0, auditStage = 0;
  const full = c1ExpectedMovements(input.state, 4).map(e => ({ id: randomUUID(), business_id: STOCK_ACTORS.A.business,
    inventory_item_id: f.item, location_id: e.location, type: e.type, qty_change: e.qty, note: e.note, unit: 'unit', unit_cost: 0.1,
    total_cost: Math.sign(e.qty) * Math.round(Math.abs(e.qty * 0.1) * 100 + 1e-8) / 100,
    prev_avg_cost: 0.1, new_avg_cost: 0.1, created_by: STOCK_ACTORS.A.owner, created_at: new Date().toISOString(),
    sale_id: null, purchase_order_id: null, related_transaction_id: null }));
  full.filter(r => r.type === 'TRANSFER_IN').forEach(row => { row.related_transaction_id = full.find(r => r.note === row.note && r.type === 'TRANSFER_OUT').id; });
  const view = () => { const v = structuredClone(input.state.fixture), quantities = [[2, 2], [2.125, 2], [1.625, 2.5], [2.125, 2], [2, 2]][stockStage];
    v.stocks.forEach((row, index) => { row.qty = quantities[index]; }); v.transactions = structuredClone(full.slice(0, [0, 1, 3, 5, 6][stockStage]));
    v.audit = [...structuredClone(input.state.audit), ...Array.from({ length: auditStage }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      business_id: STOCK_ACTORS.A.business, user_id: STOCK_ACTORS.A.owner, ...c1ExpectedAudit(input.state, i) }))]; return v; };
  const guard = createC1BrowserGuard({ local: 'http://127.0.0.1:4189', state: input.state, readView: async () => view(),
    save: phase => { phases.push(phase); save?.(phase); }, windowGate: input.windowGate, counters: input.report,
    authorizedToken: token, onFailure: error => failures.push(error.code) });
  return { input, guard, phases, failures, view, nextStock: () => { stockStage++; return full[[0, 1, 3, 5][stockStage - 1]]; }, nextAudit: () => { auditStage++; } };
}
test('child transport stops permanently after stock response loss and cannot replay or forward a compensation', async () => {
  const f = guardFixture(), step = c1Plan(f.input.state)[0];
  const first = route(step.rpc, step.payload, () => { assert.equal(f.phases.at(-1), 'MOVEMENT_PENDING'); f.nextStock(); throw Error('SYNTHETIC_LOST_RESPONSE'); });
  await f.guard(first);
  assert.equal(f.input.state.pending, 'MOVEMENT'); assert.equal(f.input.state.confirmed, 0); assert.equal(f.view().transactions.length, 1);
  const replay = route(step.rpc, step.payload, () => assert.fail('no replay'));
  const compensation = route(c1Plan(f.input.state)[3].rpc, c1Plan(f.input.state)[3].payload, () => assert.fail('no compensation'));
  await f.guard(replay); await f.guard(compensation);
  assert.equal(first.trace.forward, 1); assert.equal(replay.trace.forward + compensation.trace.forward, 0);
  assert.equal(f.input.report.stock_requests_forwarded, 1); assert.equal(f.input.report.audit_requests_forwarded, 0);
});
test('child transport preserves unknown audit intent without repeating audit or performing another stock operation', async () => {
  const f = guardFixture(), step = c1Plan(f.input.state)[0];
  await f.guard(route(step.rpc, step.payload, () => ({ ok: () => true, json: async () => f.nextStock() })));
  const expected = c1ExpectedAudit(f.input.state, 0), payload = { p_action: expected.action.replace('Client: ', ''), p_details: expected.details };
  const audit = route('fn_write_audit', payload, () => { assert.equal(f.phases.at(-1), 'AUDIT_PENDING'); f.nextAudit(); throw Error('SYNTHETIC_LOST_AUDIT_RESPONSE'); });
  await f.guard(audit); await f.guard(audit);
  const next = c1Plan(f.input.state)[1], another = route(next.rpc, next.payload, () => assert.fail('no next stock'));
  await f.guard(another);
  assert.equal(f.input.state.pending, 'AUDIT'); assert.equal(f.input.state.confirmed, 1);
  assert.equal(audit.trace.forward, 1); assert.equal(another.trace.forward, 0);
  assert.equal(f.input.report.stock_requests_forwarded, 1); assert.equal(f.input.report.audit_requests_forwarded, 1);
});
test('child transport cannot send when its durable intention save fails', async () => {
  const f = guardFixture(() => { throw Error('SYNTHETIC_DISK_FAILURE'); }), step = c1Plan(f.input.state)[0];
  const request = route(step.rpc, step.payload, () => assert.fail('durable intent required')); await f.guard(request);
  assert.equal(request.trace.forward, 0); assert.equal(f.input.report.stock_requests_forwarded, 0); assert.equal(f.input.state.pending, 'MOVEMENT');
});
test('child transport prevents overlap, wrong session and operations outside the fixed fixture', async () => {
  for (const fault of ['session', 'fixture', 'waste']) {
    const f = guardFixture(), step = c1Plan(f.input.state)[0], payload = { ...step.payload };
    if (fault === 'fixture') payload.p_inventory_item_id = randomUUID();
    const request = route(fault === 'waste' ? 'fn_record_waste' : step.rpc, payload, () => assert.fail('outside scope'), { token: fault === 'session' ? 'SYNTHETIC_OTHER_SESSION' : token });
    await f.guard(request); assert.equal(request.trace.forward, 0); assert.equal(f.input.report.stock_requests_forwarded, 0);
  }
});
test('child transport overlapping submissions poison the gate before either can reach the backend', async () => {
  const input = setup(async () => assert.fail('no browser')); let release; const wait = new Promise(resolve => { release = resolve; }), failures = [];
  const guard = createC1BrowserGuard({ local: 'http://127.0.0.1:4189', state: input.state, readView: () => wait,
    save: () => {}, windowGate: input.windowGate, counters: input.report, authorizedToken: token, onFailure: error => failures.push(error.code) });
  const step = c1Plan(input.state)[0], a = route(step.rpc, step.payload, () => assert.fail('no overlap')),
    b = route(step.rpc, step.payload, () => assert.fail('no overlap'));
  const first = guard(a); await guard(b); release({ ...structuredClone(input.state.fixture), audit: [] }); await first;
  assert.equal(a.trace.forward + b.trace.forward, 0); assert.equal(input.report.stock_requests_forwarded, 0); assert.equal(failures.length, 2);
});

test('child transport records the new audit receipt when historical parent audit has identical adjustment text', async () => {
  const f = guardFixture(), step = c1Plan(f.input.state)[0], expected = c1ExpectedAudit(f.input.state, 0);
  const historical = { id: randomUUID(), business_id: STOCK_ACTORS.A.business, user_id: STOCK_ACTORS.A.owner,
    ...expected, occurred_at: '2026-01-01T00:00:00.000Z' };
  f.input.state.audit.push(historical); const parentAuditBefore = structuredClone(f.input.state.audit);
  await f.guard(route(step.rpc, step.payload, () => ({ ok: () => true, json: async () => f.nextStock() })));
  const request = route('fn_write_audit', { p_action: expected.action.replace('Client: ', ''), p_details: expected.details },
    () => { f.nextAudit(); return { ok: () => true }; });
  await f.guard(request);
  const observed = f.view(), newReceipt = observed.audit.find(row => !parentAuditBefore.some(old => old.id === row.id));
  assert.equal(request.trace.fulfill, 1); assert.deepEqual(f.failures, []);
  assert.notEqual(f.input.state.operations[0].auditRow.id, historical.id);
  assert.deepEqual(f.input.state.operations[0].auditRow, newReceipt);
  assert.deepEqual(f.input.state.audit, parentAuditBefore);
  assert.equal(verifyC1View(f.input.state, observed, 1, 1).audit_rows_added, 1);
});
