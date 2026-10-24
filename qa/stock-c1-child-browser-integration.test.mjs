// Real Chromium/Vite/React. Every remote request is intercepted; no Auth or TEST access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, openSync, closeSync, fsyncSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareC1Runtime, probeC1LocalPort } from './stock-c1-browser-runtime.mjs';
import { runC1ChildBrowserCycle } from './stock-c1-child-browser.mjs';
import { STOCK_ACTORS } from './stock-journey-core.mjs';
import { C1_FIXTURE as f, C1_CHECKS, makeC1State, sealC1Checkpoint, unsealC1Checkpoint, c1Plan, verifyC1View } from './stock-c1-protocol.mjs';
const LOCAL = 'http://127.0.0.1:4189', HOST = 'msinksoilkluooxenecy.supabase.co', TOKEN = 'SYNTHETIC_CHILD_UI_SESSION';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  return { item: { id: f.item, business_id: STOCK_ACTORS.A.business, name: f.name, unit: 'unit', category: 'QA', active: true,
      supplier_id: null, min_qty: 0, max_qty: 10, created_at: new Date().toISOString() },
    locations: [[f.source, f.sourceName], [f.target, f.targetName]].map(([id, name]) => ({ id, name, active: true, business_id: STOCK_ACTORS.A.business })),
    stocks: [f.source, f.target].map(location_id => ({ id: randomUUID(), inventory_item_id: f.item, location_id, qty: 2, avg_cost_per_unit: 0.1 })),
    transactions: [], recipes: [], purchaseLines: [], waste: [] };
}
async function harness(fault) {
  const parentState = makeC1State(fixture(), [], 'a'.repeat(40), 'b'.repeat(64), { at: Date.now(), until: Date.now() + 60000 });
  parentState.phase = 'PROBES_CONFIRMED'; parentState.probes = [{ actor: 'B', status: 'DENIED' }, { actor: 'anon', status: 'DENIED' }];
  C1_CHECKS.slice(0, 8).forEach(name => { parentState.checks[name] = 'PASS'; });
  const parentBytes = Buffer.from(sealC1Checkpoint(parentState)), parentHash = sha(parentBytes);
  const state = makeC1State(structuredClone(parentState.fixture), [], 'a'.repeat(40), 'b'.repeat(64), parentState.window);
  state.probes = []; state.checks = { ...parentState.checks };
  const view = { ...structuredClone(state.fixture), audit: [] }, phases = [], errors = [], backendWrites = [];
  const report = { checks: { ...state.checks }, stock_requests_forwarded: 0, audit_requests_forwarded: 0, negative_requests_forwarded: 0 };
  const directory = mkdtempSync(join(tmpdir(), 'nexalvo-c1-child-ui-synthetic-'));
  const parentFile = join(directory, 'synthetic-parent.json'), childFile = join(directory, 'synthetic-child.json');
  writeFileSync(parentFile, parentBytes, { mode: 0o600 });
  const save = phase => {
    assert.equal(sha(readFileSync(parentFile)), parentHash); state.phase = phase; phases.push(phase);
    const fd = openSync(childFile, 'w', 0o600); try { writeFileSync(fd, sealC1Checkpoint(state)); fsyncSync(fd); } finally { closeSync(fd); }
  };
  save('SNAPSHOT');
  const publicConfig = { origin: `https://${HOST}`, key: 'sb_publishable_SYNTHETIC_CHILD_UI' };
  const runtime = await prepareC1Runtime({ env: process.env, config: publicConfig });
  const actualBrowser = runtime.browser; let remoteForwarded = 0, negativeProbes = 0;
  const tables = {
    users: [{ id: STOCK_ACTORS.A.owner, business_id: STOCK_ACTORS.A.business, name: 'OWNER LOCAL SIMULADO', role: 'OWNER', active: true, permission_overrides: {} }],
    businesses: [{ id: STOCK_ACTORS.A.business, name: 'QA CHILD LOCAL SIMULADO', currency: 'USD', timezone: 'America/New_York', tax_enabled: false,
      tax_rate: 0, status: 'ACTIVE', platform_status: 'ACTIVE' }], locations: view.locations, inventory_items: [view.item], products: [], product_recipes: [],
  };
  const syntheticResponse = body => ({ ok: () => true, status: () => 200, json: async () => structuredClone(body), body });
  const forward = async request => {
    const rpc = new URL(request.url()).pathname.replace('/rest/v1/rpc/', ''), payload = request.postDataJSON();
    const persisted = unsealC1Checkpoint(readFileSync(childFile));
    backendWrites.push(rpc);
    assert.equal(sha(readFileSync(parentFile)), parentHash); assert.equal(request.headers().authorization, `Bearer ${TOKEN}`);
    if (rpc === 'fn_write_audit') {
      assert.equal(persisted.pending, 'AUDIT'); assert.equal(phases.at(-1), 'AUDIT_PENDING');
      const row = { id: randomUUID(), business_id: STOCK_ACTORS.A.business, user_id: STOCK_ACTORS.A.owner,
        action: `Client: ${payload.p_action}`, details: payload.p_details, occurred_at: new Date().toISOString() };
      view.audit.push(row);
      if (fault === 'audit-response-loss') throw Error('SYNTHETIC_AUDIT_RESPONSE_LOST');
      return syntheticResponse(row);
    }
    assert.equal(persisted.pending, 'MOVEMENT'); assert.equal(phases.at(-1), 'MOVEMENT_PENDING');
    assert.ok(['fn_adjust_inventory_count', 'fn_transfer_inventory'].includes(rpc));
    assert.equal(payload.p_business_id, STOCK_ACTORS.A.business); assert.equal(payload.p_inventory_item_id, f.item);
    const source = view.stocks.find(row => row.location_id === (payload.p_location_id || payload.p_from_location_id)); assert.ok(source);
    const delta = rpc === 'fn_adjust_inventory_count' ? payload.p_new_qty - source.qty : -payload.p_qty;
    source.qty = Math.round((source.qty + delta) * 1000) / 1000;
    const row = { id: randomUUID(), business_id: STOCK_ACTORS.A.business, inventory_item_id: f.item, location_id: source.location_id,
      type: rpc === 'fn_adjust_inventory_count' ? 'ADJUSTMENT' : 'TRANSFER_OUT', qty_change: delta, unit: 'unit', unit_cost: 0.1,
      total_cost: Math.sign(delta) * Math.round(Math.abs(delta * 0.1) * 100 + 1e-8) / 100,
      prev_avg_cost: 0.1, new_avg_cost: 0.1, created_by: STOCK_ACTORS.A.owner, created_at: new Date().toISOString(),
      note: rpc === 'fn_adjust_inventory_count' ? `Reason: ${payload.p_reason} — ${payload.p_notes}` : payload.p_notes,
      sale_id: null, purchase_order_id: null, related_transaction_id: null };
    view.transactions.push(row);
    if (rpc === 'fn_transfer_inventory') {
      const target = view.stocks.find(stock => stock.location_id === payload.p_to_location_id); assert.ok(target); target.qty = Math.round((target.qty + payload.p_qty) * 1000) / 1000;
      view.transactions.push({ ...row, id: randomUUID(), location_id: target.location_id, type: 'TRANSFER_IN', qty_change: payload.p_qty,
        total_cost: Math.round(payload.p_qty * 0.1 * 100 + 1e-8) / 100, related_transaction_id: row.id });
    }
    if (fault === 'stock-response-loss') throw Error('SYNTHETIC_STOCK_RESPONSE_LOST');
    return syntheticResponse(row);
  };
  const mockedBrowser = { newContext: async options => {
    const context = await actualBrowser.newContext(options), realRoute = context.route.bind(context), setTimeout = context.setDefaultTimeout.bind(context);
    context.setDefaultTimeout = value => setTimeout(Math.min(value, 2500));
    const newPage = context.newPage.bind(context); context.newPage = async () => { const page = await newPage(); page.on('pageerror', () => errors.push('UNEXPECTED_PAGE_ERROR')); return page; };
    context.route = async (pattern, guard) => realRoute(pattern, async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === LOCAL) return guard(route);
      if (url.hostname !== HOST) return route.abort();
      const reply = (body, headers = {}) => route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
      if (url.pathname === '/auth/v1/user') return reply({ id: STOCK_ACTORS.A.owner, app_metadata: {} });
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        const name = url.pathname.replace('/rest/v1/', '');
        let rows = name === 'rpc/fn_read_inventory_stock_secure' ? view.stocks : name === 'rpc/fn_read_inventory_transactions_secure' ? view.transactions
          : name === 'rpc/fn_read_waste_transactions_secure' ? view.waste : name === 'audit_logs' ? view.audit : tables[name] || [];
        for (const [key, value] of url.searchParams) {
          if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3));
          if (value.startsWith('in.(')) rows = rows.filter(row => value.slice(4, -1).split(',').includes(row[key]));
        }
        const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || rows.length || 1);
        return reply(rows.slice(offset, offset + limit), { 'content-range': rows.length ? `${offset}-${Math.min(offset + limit, rows.length) - 1}/${rows.length}` : '*/0' });
      }
      if (['current_business_id', 'user_can', 'fn_session_access_status'].some(name => url.pathname === '/rest/v1/rpc/' + name)) return reply([]);
      const adapted = { request: () => request, continue: async () => { remoteForwarded++; assert.fail('no remote forwarding'); }, abort: () => route.abort(),
        fetch: async options => { assert.equal(options.maxRetries, 0); assert.equal(options.maxRedirects, 0); return forward(request); },
        fulfill: ({ response }) => route.fulfill({ status: response.status(), contentType: 'application/json', body: JSON.stringify(response.body) }) };
      return guard(adapted);
    });
    return context;
  } };
  return { runtime: { browser: mockedBrowser }, client: { view: async () => structuredClone(view), browserSession: () => ({ token: TOKEN, user: { id: STOCK_ACTORS.A.owner, app_metadata: {} } }),
    negativeProbe: () => { negativeProbes++; assert.fail('no probes'); } }, state, save, report,
    windowGate: () => assert.equal(sha(readFileSync(parentFile)), parentHash), proof: () => ({ remoteForwarded, negativeProbes,
      parentUnchanged: sha(readFileSync(parentFile)) === parentHash, persisted: unsealC1Checkpoint(readFileSync(childFile)), view: structuredClone(view), backendWrites: [...backendWrites], errors }),
    close: async () => { await runtime.close(); rmSync(directory, { recursive: true, force: true }); await probeC1LocalPort(); } };
}

test('SIMULATED backend: actual child executor drives all four inventory UI operations, reloads and history while parent bytes remain unchanged', { timeout: 60000 }, async () => {
  const h = await harness();
  try {
    const proof = await runC1ChildBrowserCycle(h), observations = h.proof();
    assert.equal(proof.stage, 4); assert.equal(proof.movement_rows, 6); assert.equal(proof.audit_rows_added, 4);
    assert.equal(proof.stock_restored, true); assert.equal(h.report.stock_requests_forwarded, 4); assert.equal(h.report.audit_requests_forwarded, 4);
    assert.equal(h.report.negative_requests_forwarded, 0); assert.equal(observations.remoteForwarded, 0); assert.equal(observations.negativeProbes, 0);
    assert.equal(observations.parentUnchanged, true); assert.equal(observations.persisted.confirmed, 4); assert.equal(observations.persisted.pending, null); assert.equal(observations.persisted.probes.length, 0);
    for (const name of ['ui_adjustment', 'ui_transfer', 'ui_reverse_transfer', 'persist_reload', 'ui_history']) assert.equal(h.report.checks[name], 'PASS');
    assert.deepEqual(observations.errors, []);
  } finally { await h.close(); }
});
for (const fault of ['stock-response-loss', 'audit-response-loss']) test(`SIMULATED backend: child UI stops after committed ${fault} and preserves its unknown intent without retry or compensation`, { timeout: 45000 }, async () => {
  const h = await harness(fault);
  try {
    await assert.rejects(runC1ChildBrowserCycle(h), error => /^C1_/.test(error.code) && !JSON.stringify(error).includes('SYNTHETIC_'));
    const observations = h.proof();
    assert.equal(observations.parentUnchanged, true); assert.equal(observations.remoteForwarded, 0); assert.equal(observations.negativeProbes, 0);
    assert.equal(h.report.stock_requests_forwarded, 1); assert.equal(h.report.audit_requests_forwarded, fault === 'stock-response-loss' ? 0 : 1);
    assert.equal(observations.persisted.pending, fault === 'stock-response-loss' ? 'MOVEMENT' : 'AUDIT');
    assert.equal(observations.persisted.confirmed, fault === 'stock-response-loss' ? 0 : 1); assert.equal(observations.persisted.probes.length, 0);
    assert.equal(observations.view.transactions.length, 1); assert.equal(observations.view.audit.length, fault === 'stock-response-loss' ? 0 : 1);
    assert.equal(observations.backendWrites.length, fault === 'stock-response-loss' ? 1 : 2);
    assert.equal(h.report.checks.persist_reload, 'BLOCKED');
    assert.equal(verifyC1View(observations.persisted, observations.view, 1, fault === 'stock-response-loss' ? 0 : 1).movement_rows, 1);
  } finally { await h.close(); }
});
