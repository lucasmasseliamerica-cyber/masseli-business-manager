import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STOCK_ACTORS, stockHash, STOCK_PRECISION_TARGET_FINGERPRINT } from './stock-journey-core.mjs';
import { C1_FIXTURE as f, C1_CHECKS, c1Mode, c1Scope, c1Window, c1Precision, c1AuditContract, c1Plan, c1Payload, c1AuditPayload,
  c1ExpectedAudit, c1ExpectedMovements, makeC1State, sealC1Checkpoint, unsealC1Checkpoint, verifyC1View } from './stock-c1-protocol.mjs';
import { stockJourney, reconcileC1Readonly, privateC1Path } from './stock-journey.TEST.mjs';
import { openC1Client } from './stock-c1-client.mjs';
import { createC1BrowserGuard } from './stock-c1-browser-guard.mjs';
import { C1_AUDIT_CONTRACT } from './stock-c1-audit-contract.mjs';

export function syntheticC1Fixture() {
  return { item: { id: f.item, business_id: STOCK_ACTORS.A.business, name: f.name, unit: 'unit', active: true, supplier_id: null, notes: 'SYNTHETIC ONLY' },
    locations: [[f.source, f.sourceName], [f.target, f.targetName]].map(([id, name]) => ({ id, name, active: true, business_id: STOCK_ACTORS.A.business })),
    stocks: [f.source, f.target].map(location_id => ({ id: randomUUID(), inventory_item_id: f.item, location_id, qty: 2, avg_cost_per_unit: 0.1, last_purchase_cost: null, last_purchase_date: null })),
    transactions: [], recipes: [], purchaseLines: [], waste: [] };
}
const stateFor = () => makeC1State(syntheticC1Fixture(), [], 'a'.repeat(40), 'b'.repeat(64), { at: Date.now(), until: Date.now() + 60000 });
function observed(state, stage, auditStage = stage) {
  const v = structuredClone(state.fixture), quantities = [[2, 2], [2.125, 2], [1.625, 2.5], [2.125, 2], [2, 2]][stage];
  v.stocks.forEach((s, i) => { s.qty = quantities[i]; });
  v.transactions = c1ExpectedMovements(state, stage).map(e => ({ id: randomUUID(), business_id: STOCK_ACTORS.A.business,
    inventory_item_id: f.item, location_id: e.location, type: e.type, qty_change: e.qty, note: e.note, unit: v.item.unit,
    unit_cost: 0.1, total_cost: Math.sign(e.qty) * Math.round(Math.abs(e.qty * 0.1) * 100 + 1e-8) / 100,
    prev_avg_cost: 0.1, new_avg_cost: 0.1, sale_id: null, purchase_order_id: null, related_transaction_id: null,
    created_by: STOCK_ACTORS.A.owner, created_at: new Date().toISOString() }));
  for (const row of v.transactions.filter(r => r.type === 'TRANSFER_IN')) row.related_transaction_id = v.transactions.find(r => r.note === row.note && r.type === 'TRANSFER_OUT').id;
  v.audit = Array.from({ length: auditStage }, (_, i) => ({ id: randomUUID(), business_id: STOCK_ACTORS.A.business, user_id: STOCK_ACTORS.A.owner, ...c1ExpectedAudit(state, i) }));
  return v;
}
test('C1 no implicit execution mode, broad fixture, stale window or legacy precision guard', () => {
  for (const args of [[], ['--apply'], ['--execute', '--preflight'], ['--recover', 'x']]) assert.throws(() => c1Mode(args));
  assert.equal(c1Mode(['--reconcile-readonly', 'private']), 'recovery');
  assert.throws(() => c1Scope({ itemId: randomUUID(), sourceId: f.source, targetId: f.target }));
  assert.throws(() => c1Precision({ functions: [{ name: 'fn_record_inventory_movement', fingerprint: 'b5ac605f98d630ec318651bfb70eda63' }] }));
  assert.doesNotThrow(() => c1Precision({ functions: [{ name: 'fn_record_inventory_movement', fingerprint: STOCK_PRECISION_TARGET_FINGERPRINT }] }));
  const env = { QA_STOCK_C1_AUTHORIZED: 'TEST_ONLY_EXPLICIT_C1_20261022', QA_STOCK_EXCLUSIVE_WINDOW: 'TEST_ONLY_C1_EXCLUSIVE_WINDOW',
    QA_STOCK_EXCLUSIVE_AT: new Date(100000).toISOString(), QA_STOCK_EXCLUSIVE_UNTIL: new Date(200000).toISOString() };
  assert.doesNotThrow(() => c1Window(env, 150000));
  for (const e of [{}, { ...env, QA_STOCK_C1_AUTHORIZED: 'TEST_ONLY_EXPLICIT' }, { ...env, QA_STOCK_EXCLUSIVE_UNTIL: new Date(3000000).toISOString() }]) assert.throws(() => c1Window(e, 150000));
  assert.throws(() => c1Window(env, 200000));
});
test('C1 entrypoints block before files/auth/network if credentials, window or explicit mode are missing', async () => {
  let calls = 0; const fetcher = () => { calls++; throw Error('NO_NETWORK_PERMITTED'); };
  for (const args of [[], ['--preflight'], ['--execute'], ['--reconcile-readonly', 'private']]) {
    const r = await stockJourney({}, args, fetcher); assert.equal(r.status, 'BLOCKED'); assert.equal(r.stock_requests_forwarded, 0);
    assert.equal(r.full_homologation, false);
  }
  assert.equal(calls, 0);
});
test('C1 audit contract requires the reviewed post-cutover body signature execution attributes and effective grants', () => {
  const a = { ...C1_AUDIT_CONTRACT.expected };
  assert.doesNotThrow(() => c1AuditContract({ c1_audit_contract: a }));
  for (const change of [{ body_fingerprint: '75c32789a68a73e29a8a82d33e3aad27' }, { body_fingerprint: 'a'.repeat(32) },
    { body_sha256: 'a'.repeat(64) }, { identity_arguments: 'p_tenant uuid, p_details text' }, { returns_audit_logs: false },
    { language: 'sql' }, { volatility: 's' }, { is_strict: true }, { returns_set: true }, { argument_defaults: 1 },
    { security_definer: false }, { owner: 'authenticated' }, { anon_execute: true }, { authenticated_execute: false },
    { empty_search_path: false }, { overloads: 2 }])
    assert.throws(() => c1AuditContract({ c1_audit_contract: { ...a, ...change } }));
  for (const key of Object.keys(a)) {
    const missing = { ...a }; delete missing[key];
    assert.throws(() => c1AuditContract({ c1_audit_contract: missing }));
    assert.throws(() => c1AuditContract({ c1_audit_contract: { ...a, [key]: null } }));
  }
  assert.throws(() => c1AuditContract({}));
  assert.throws(() => c1AuditContract(null));
});
test('C1 audit fingerprints are reproduced from the two reviewed versioned definitions, not copied from an observed drift', () => {
  const body = file => {
    const migration = readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8');
    const match = migration.match(/CREATE OR REPLACE FUNCTION public\.fn_write_audit\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/);
    assert.ok(match); return match[1];
  };
  const historical = body('20261017_catalog_security_hardening_TEST.sql');
  const current = body('20261016_platform_admin_TEST.sql');
  const hash = (algorithm, text) => createHash(algorithm).update(text).digest('hex');
  assert.equal(hash('md5', historical), '75c32789a68a73e29a8a82d33e3aad27');
  assert.equal(hash('md5', current), C1_AUDIT_CONTRACT.expected.body_fingerprint);
  assert.equal(hash('sha256', current), C1_AUDIT_CONTRACT.expected.body_sha256);
  // The sole semantic change is the additional active-business gate. Identity,
  // tenant attribution, Client provenance and validation bounds are unchanged.
  const oldActor = '  SELECT * INTO v_user FROM public.users WHERE id = auth.uid() AND active = true;';
  const newActor = "  SELECT u.* INTO v_user\n  FROM public.users AS u\n  JOIN public.businesses AS b ON b.id = u.business_id\n  WHERE u.id = auth.uid() AND u.active = true AND b.platform_status = 'ACTIVE';";
  assert.ok(historical.includes(oldActor));
  assert.equal(historical.replace(oldActor, newActor), current);
  const withoutTenantGate = current.replace(" AND b.platform_status = 'ACTIVE'", '');
  assert.notEqual(hash('md5', withoutTenantGate), C1_AUDIT_CONTRACT.expected.body_fingerprint);
  assert.notEqual(hash('sha256', withoutTenantGate), C1_AUDIT_CONTRACT.expected.body_sha256);
});
test('C1 refuses the previously sufficient catalog and keeps the restored C1 fixture scope unchanged', () => {
  const old = { body_fingerprint: '75c32789a68a73e29a8a82d33e3aad27', security_definer: true, owner: 'postgres',
    empty_search_path: true, anon_execute: false, authenticated_execute: true, overloads: 1 };
  assert.throws(() => c1AuditContract({ c1_audit_contract: old }), /C1_CURRENT_AUDIT_CONTRACT_REQUIRED/);
  // Even the reported current MD5 without fresh type/SHA-256 metadata cannot pass.
  assert.throws(() => c1AuditContract({ c1_audit_contract: { ...old,
    body_fingerprint: C1_AUDIT_CONTRACT.expected.body_fingerprint } }), /C1_CURRENT_AUDIT_CONTRACT_REQUIRED/);
  const s = stateFor();
  assert.deepEqual(c1Plan(s).map(op => op.name), ['COUNT', 'TRANSFER', 'RETURN', 'RESTORE']);
  assert.equal(s.confirmed, 0); assert.equal(s.operations.length, 0);
});
test('C1 exact four-operation budget cannot target another item, add fields, exceed limits or replay dispatched work', () => {
  const s = stateFor(), plan = c1Plan(s);
  assert.equal(plan.length, 4); assert.equal(plan[0].payload.p_new_qty, 2.125); assert.equal(plan[1].payload.p_qty, 0.5);
  assert.equal(plan[2].payload.p_from_location_id, f.target); assert.equal(plan[3].payload.p_new_qty, 2);
  assert.doesNotThrow(() => c1Payload(s, plan[0].rpc, plan[0].payload));
  for (const payload of [{ ...plan[0].payload, p_inventory_item_id: randomUUID() }, { ...plan[0].payload, p_new_qty: 2.126 }, { ...plan[0].payload, extra: true }])
    assert.throws(() => c1Payload(s, plan[0].rpc, payload));
  s.pending = 'MOVEMENT'; s.operations.push({ name: 'COUNT', status: 'DISPATCHED', auditAttempted: false });
  assert.throws(() => c1Payload(s, plan[0].rpc, plan[0].payload));
});
test('C1 snapshot refuses nonexclusive dependencies, different baseline, precision and average cost', () => {
  for (const mutate of [x => x.stocks[0].qty = 2.001, x => x.stocks[0].avg_cost_per_unit = 0.2,
    x => x.item.active = false, x => x.transactions.push({ id: randomUUID() }), x => x.recipes.push({ id: randomUUID() })]) {
    const fixture = syntheticC1Fixture(); mutate(fixture);
    assert.throws(() => makeC1State(fixture, [], 'a'.repeat(40), 'b'.repeat(64), {}));
  }
});
test('C1 independent proof accepts the bounded cycle and rejects duplicate/link/cost/tenant/metadata/audit corruption', () => {
  const s = stateFor(); const v = observed(s, 4);
  assert.deepEqual(verifyC1View(s, v, 4).positions.map(p => p.qty_after), [2, 2]);
  for (const mutate of [x => x.transactions.push(x.transactions[0]), x => x.transactions[2].related_transaction_id = randomUUID(),
    x => x.transactions[0].created_by = STOCK_ACTORS.B.owner, x => x.stocks[0].avg_cost_per_unit = 0.1001,
    x => x.item.notes = 'OTHER WRITER', x => x.stocks[0].last_purchase_cost = 0.2, x => x.waste.push({ id: randomUUID() }),
    x => x.transactions[0].note += ' UNEXPECTED', x => x.transactions[0].total_cost = 3,
    x => x.audit[0].details += ' UNEXPECTED', x => x.audit[0].user_id = STOCK_ACTORS.B.owner, x => x.audit.pop()]) {
    const bad = structuredClone(v); mutate(bad); assert.throws(() => verifyC1View(s, bad, 4));
  }
});
test('C1 previously confirmed movement and audit rows remain byte-equivalent through later steps', () => {
  const s = stateFor(), v = observed(s, 4);
  s.operations = [{ name: 'COUNT', status: 'CONFIRMED', auditAttempted: true, rows: [structuredClone(v.transactions[0])], auditRow: structuredClone(v.audit[0]) }]; s.confirmed = 1;
  assert.doesNotThrow(() => verifyC1View(s, v, 4));
  v.transactions[0].created_at = new Date(Date.now() + 1000).toISOString(); assert.throws(() => verifyC1View(s, v, 4));
});
test('C1 seals reject secrets, checksum corruption and impossible confirmed/dispatch counts', () => {
  const s = stateFor(); assert.equal(unsealC1Checkpoint(Buffer.from(sealC1Checkpoint(s))).runId, s.runId);
  const envelope = JSON.parse(sealC1Checkpoint(s)); envelope.state.confirmed = 4;
  assert.throws(() => unsealC1Checkpoint(Buffer.from(JSON.stringify(envelope))));
  envelope.integrity = stockHash(envelope.state); assert.throws(() => unsealC1Checkpoint(Buffer.from(JSON.stringify(envelope))));
  s.fixture.item.notes = 'Bearer SYNTHETIC_SECRET'; assert.throws(() => sealC1Checkpoint(s));
});
test('C1 audit forwarding requires confirmed movement and exact event and cannot replay', () => {
  const s = stateFor(); assert.throws(() => c1AuditPayload(s, {}));
  const v = observed(s, 1); s.confirmed = 1; s.operations.push({ name: 'COUNT', status: 'CONFIRMED', auditAttempted: false, rows: v.transactions });
  const e = c1ExpectedAudit(s, 0), payload = { p_action: e.action.replace('Client: ', ''), p_details: e.details };
  assert.doesNotThrow(() => c1AuditPayload(s, payload));
  assert.throws(() => c1AuditPayload(s, { ...payload, p_details: payload.p_details + ' OTHER' }));
  s.operations[0].auditAttempted = true; assert.throws(() => c1AuditPayload(s, payload));
});
for (const outcome of ['committed', 'absent', 'read-failure', 'probe-unknown']) test(`C1 unknown-result recovery ${outcome} is read-only and preserves every checkpoint byte`, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nexalvo-stock-c1-synthetic-'));
  const file = join(dir, 'stock-recovery.json'), s = stateFor();
  s.pending = outcome === 'probe-unknown' ? 'PROBE_B' : 'MOVEMENT';
  if (outcome === 'probe-unknown') s.probes.push({ actor: 'B', status: 'DISPATCHED' });
  else s.operations.push({ name: 'COUNT', status: 'DISPATCHED', auditAttempted: false });
  writeFileSync(file, sealC1Checkpoint(s), { mode: 0o600 }); const original = readFileSync(file);
  let reads = 0;
  try {
    const client = { view: async () => { reads++; if (outcome === 'read-failure') throw Error('SYNTHETIC_READ_FAILURE'); return observed(s, outcome === 'committed' ? 1 : 0, 0); } };
    if (outcome === 'committed') {
      const report = await reconcileC1Readonly(file, client);
      assert.equal(report.status, 'PASS'); assert.equal(report.restored, false); assert.equal(report.full_homologation, false);
      assert.equal(report.stock_requests_forwarded, 0); assert.equal(report.checks.ui_adjustment, 'BLOCKED');
    } else await assert.rejects(reconcileC1Readonly(file, client));
    assert.ok(readFileSync(file).equals(original)); assert.equal(reads, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('C1 recovery rejects checkpoint changes during a read even when observed stock is valid', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nexalvo-stock-c1-synthetic-')), file = join(dir, 'stock-recovery.json'), s = stateFor();
  writeFileSync(file, sealC1Checkpoint(s));
  try { await assert.rejects(reconcileC1Readonly(file, { view: async () => { writeFileSync(file, 'CORRUPTED'); return observed(s, 0); } }), /C1_RECOVERY_CHECKPOINT_CHANGED/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
test('C1 private recovery requires owned TEMP directory, literal file and no symbolic links', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nexalvo-stock-c1-synthetic-')); chmodSync(dir, 0o700);
  const file = join(dir, 'stock-recovery.json'); writeFileSync(file, sealC1Checkpoint(stateFor()), { mode: 0o600 });
  try {
    assert.equal(privateC1Path({ QA_STOCK_PRIVATE_DIR: dir }, file), file);
    chmodSync(file, 0o644); assert.throws(() => privateC1Path({ QA_STOCK_PRIVATE_DIR: dir }, file)); chmodSync(file, 0o600);
    const link = join(dir, 'link'); symlinkSync(dir, link); assert.throws(() => privateC1Path({ QA_STOCK_PRIVATE_DIR: link }, join(link, 'stock-recovery.json')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('C1 authenticated client exposes no generic mutation and cleans temporary sessions on failed permission', async () => {
  const requests = [], config = { origin: 'https://msinksoilkluooxenecy.supabase.co', key: 'sb_publishable_SYNTHETIC' };
  const env = { QA_TWO_TENANT_A_EMAIL: 'a@example.invalid', QA_TWO_TENANT_A_PASSWORD: 'SYNTHETIC_PASSWORD' };
  const fetcher = async (url, options) => {
    requests.push({ path: url.pathname, method: options.method });
    const json = data => new Response(JSON.stringify(data), { headers: { 'content-range': `*/${Array.isArray(data) ? data.length : 0}` } });
    if (url.pathname === '/auth/v1/token') return json({ access_token: 'SYNTHETIC_SESSION' });
    if (url.pathname === '/auth/v1/logout') { assert.equal(url.searchParams.get('scope'), 'local'); return json({}); }
    if (url.pathname === '/auth/v1/user') return json({ id: STOCK_ACTORS.A.owner });
    if (url.pathname === '/rest/v1/users') return json([{ id: STOCK_ACTORS.A.owner, business_id: STOCK_ACTORS.A.business, role: 'OWNER', active: true }]);
    if (url.pathname.endsWith('current_business_id')) return json(STOCK_ACTORS.A.business);
    return json(null);
  };
  await assert.rejects(openC1Client(config, env, fetcher), /C1_OWNER_PERMISSION_REQUIRED/);
  assert.ok(requests.some(r => r.path === '/auth/v1/logout'));
  assert.ok(requests.every(r => r.method === 'GET' || ['/auth/v1/token', '/auth/v1/logout'].includes(r.path)));
});
test('C1 isolation cannot approve an empty truncated response with a nonzero total count', async () => {
  const config = { origin: 'https://msinksoilkluooxenecy.supabase.co', key: 'sb_publishable_SYNTHETIC' };
  const env = { QA_TWO_TENANT_A_EMAIL: 'a@example.invalid', QA_TWO_TENANT_A_PASSWORD: 'SYNTHETIC_A', QA_TWO_TENANT_B_EMAIL: 'b@example.invalid', QA_TWO_TENANT_B_PASSWORD: 'SYNTHETIC_B' };
  const fetcher = async (url, options) => {
    const actor = options.headers.Authorization?.endsWith('_B') ? 'B' : 'A';
    const json = data => new Response(JSON.stringify(data), { headers: { 'content-range': `*/${Array.isArray(data) ? data.length : 0}` } });
    if (url.pathname === '/auth/v1/token') return json({ access_token: 'SYNTHETIC_' + (JSON.parse(options.body).email.startsWith('a') ? 'A' : 'B') });
    if (url.pathname === '/auth/v1/logout') return json({});
    if (url.pathname === '/auth/v1/user') return json({ id: STOCK_ACTORS[actor].owner });
    if (url.pathname === '/rest/v1/users') return json([{ id: STOCK_ACTORS[actor].owner, business_id: STOCK_ACTORS[actor].business, active: true, role: 'OWNER' }]);
    if (url.pathname.endsWith('current_business_id')) return json(STOCK_ACTORS[actor].business);
    if (url.pathname.endsWith('user_can')) return json(true);
    return new Response('[]', { headers: { 'content-range': '*/2' } });
  };
  const client = await openC1Client(config, env, fetcher);
  try { await assert.rejects(client.isolation(), /C1_INCOMPLETE_READ/); } finally { await client.close(); }
});

const stockOrigin = 'https://msinksoilkluooxenecy.supabase.co';
function fakeRoute(rpc, payload, fetcher, { token = 'SYNTHETIC_A', origin = stockOrigin, method = 'POST' } = {}) {
  const trace = { fetched: 0, fulfilled: 0, aborted: 0, continued: 0 };
  return { trace, request: () => ({ url: () => origin + '/rest/v1/rpc/' + rpc, method: () => method,
    headers: () => ({ authorization: 'Bearer ' + token }), postDataJSON: () => payload }),
    fetch: async options => { trace.fetched++; assert.equal(options.maxRetries, 0); assert.equal(options.maxRedirects, 0); return fetcher(); },
    fulfill: async () => { trace.fulfilled++; }, abort: async () => { trace.aborted++; }, continue: async () => { trace.continued++; } };
}
test('C1 actual browser guard dispatches the four bounded writes and four audits once, after checkpoint and independent reads', async () => {
  const s = stateFor(), full = observed(s, 4), saved = [], counters = { stock_requests_forwarded: 0, audit_requests_forwarded: 0 }, failures = [];
  let stage = 0, auditStage = 0;
  const readView = async () => {
    const v = structuredClone(full), quantities = [[2, 2], [2.125, 2], [1.625, 2.5], [2.125, 2], [2, 2]][stage];
    v.stocks.forEach((r, i) => { r.qty = quantities[i]; });
    v.transactions = v.transactions.slice(0, [0, 1, 3, 5, 6][stage]); v.audit = v.audit.slice(0, auditStage);
    return v;
  };
  const guard = createC1BrowserGuard({ local: 'http://127.0.0.1:4189', state: s, readView, save: phase => saved.push(phase),
    windowGate: () => {}, counters, authorizedToken: 'SYNTHETIC_A', onFailure: e => failures.push(e.code) });
  for (const step of c1Plan(s)) {
    const route = fakeRoute(step.rpc, step.payload, async () => {
      assert.equal(saved.at(-1), 'MOVEMENT_PENDING'); assert.equal(s.pending, 'MOVEMENT'); stage++;
      const row = full.transactions[[0, 1, 3, 5][stage - 1]]; return { ok: () => true, json: async () => ({ id: row.id }) };
    });
    await guard(route); assert.equal(route.trace.fulfilled, 1);
    const e = c1ExpectedAudit(s, stage - 1);
    const audit = fakeRoute('fn_write_audit', { p_action: e.action.replace('Client: ', ''), p_details: e.details }, async () => {
      assert.equal(saved.at(-1), 'AUDIT_PENDING'); assert.equal(s.pending, 'AUDIT'); auditStage++; return { ok: () => true };
    });
    await guard(audit); assert.equal(audit.trace.fulfilled, 1);
  }
  assert.deepEqual(failures, []); assert.equal(counters.stock_requests_forwarded, 4); assert.equal(counters.audit_requests_forwarded, 4);
  assert.equal(verifyC1View(s, await readView(), 4).stock_restored, true);
  const replay = fakeRoute(c1Plan(s)[3].rpc, c1Plan(s)[3].payload, () => assert.fail('no fifth write'));
  await guard(replay); assert.equal(replay.trace.fetched, 0); assert.equal(counters.stock_requests_forwarded, 4);
});
test('C1 browser timeout retains dispatched intent and blocks every replay without exposing the exception', async () => {
  const s = stateFor(), counters = { stock_requests_forwarded: 0, audit_requests_forwarded: 0 }, phases = [], failures = [];
  const guard = createC1BrowserGuard({ local: 'http://127.0.0.1:4189', state: s, readView: async () => observed(s, 0),
    save: phase => phases.push(phase), windowGate: () => {}, counters, authorizedToken: 'SYNTHETIC_A', onFailure: e => failures.push(e) });
  const step = c1Plan(s)[0];
  const route = fakeRoute(step.rpc, step.payload, () => { assert.equal(phases.at(-1), 'MOVEMENT_PENDING'); throw Error('Bearer SYNTHETIC_SECRET a@example.invalid'); });
  await guard(route); await guard(route);
  assert.equal(route.trace.fetched, 1); assert.equal(s.pending, 'MOVEMENT'); assert.equal(counters.stock_requests_forwarded, 1);
  assert.doesNotMatch(JSON.stringify(failures.map(e => e.code)), /SYNTHETIC_SECRET|@|Bearer/);
});
test('C1 browser cannot forward if durable checkpoint saving fails', async () => {
  const s = stateFor(), failures = [], counters = { stock_requests_forwarded: 0, audit_requests_forwarded: 0 }, step = c1Plan(s)[0];
  const guard = createC1BrowserGuard({ local: 'http://127.0.0.1:4189', state: s, readView: async () => observed(s, 0),
    save: () => { throw Error('SYNTHETIC_DISK_FAILURE'); }, windowGate: () => {}, counters, authorizedToken: 'SYNTHETIC_A', onFailure: e => failures.push(e.code) });
  const route = fakeRoute(step.rpc, step.payload, () => assert.fail('checkpoint must precede forward'));
  await guard(route); assert.equal(route.trace.fetched, 0); assert.equal(counters.stock_requests_forwarded, 0); assert.equal(failures.length, 1);
});
test('C1 browser denies foreign user host and RPC before fetch; optional external GET cannot poison the stock cycle', async () => {
  const step = c1Plan(stateFor())[0];
  for (const scenario of ['other-user', 'other-supabase', 'other-rpc', 'optional-image']) {
    const s = stateFor(), failures = [], counters = { stock_requests_forwarded: 0, audit_requests_forwarded: 0 };
    const guard = createC1BrowserGuard({ local: 'http://127.0.0.1:4189', state: s, readView: async () => observed(s, 0), save: () => {}, windowGate: () => {},
      counters, authorizedToken: 'SYNTHETIC_A', onFailure: e => failures.push(e.code) });
    const options = scenario === 'other-user' ? { token: 'SYNTHETIC_B' } : scenario === 'other-supabase' ? { origin: 'https://foreign.supabase.co', method: 'GET' }
      : scenario === 'optional-image' ? { origin: 'https://images.example.invalid', method: 'GET' } : {};
    const route = fakeRoute(scenario === 'other-rpc' ? 'fn_record_waste' : step.rpc, step.payload, () => assert.fail('outside scope'), options);
    await guard(route); assert.equal(route.trace.fetched, 0); assert.equal(counters.stock_requests_forwarded, 0);
    assert.equal(failures.length, scenario === 'optional-image' ? 0 : 1);
  }
});
test('C1 overlapping browser submissions cannot dispatch after a competing request poisons the gate', async () => {
  const s = stateFor(), counters = { stock_requests_forwarded: 0, audit_requests_forwarded: 0 }, failures = [], step = c1Plan(s)[0];
  let resolveRead; const pendingRead = new Promise(resolve => { resolveRead = resolve; });
  const guard = createC1BrowserGuard({ local: 'http://127.0.0.1:4189', state: s, readView: () => pendingRead,
    save: () => {}, windowGate: () => {}, counters, authorizedToken: 'SYNTHETIC_A', onFailure: e => failures.push(e.code) });
  const a = fakeRoute(step.rpc, step.payload, () => assert.fail('overlap')), b = fakeRoute(step.rpc, step.payload, () => assert.fail('overlap'));
  const first = guard(a); await guard(b); resolveRead(observed(s, 0)); await first;
  assert.equal(a.trace.fetched + b.trace.fetched, 0); assert.equal(counters.stock_requests_forwarded, 0); assert.equal(failures.length, 2);
});
