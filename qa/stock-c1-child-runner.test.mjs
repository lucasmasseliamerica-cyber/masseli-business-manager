import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { stockC1Child, c1ChildMode, c1ChildWindow, assertC1ChildBaseline } from './stock-c1-child.TEST.mjs';
import { StockSignal, STOCK_ACTORS, STOCK_FINGERPRINTS, STOCK_TABLES, STOCK_PRECISION_TARGET_FINGERPRINT, stockHash } from './stock-journey-core.mjs';
import { C1_FIXTURE as f, C1_CHECKS, makeC1State, sealC1Checkpoint, c1Plan, c1ExpectedMovements, c1ExpectedAudit, verifyC1View } from './stock-c1-protocol.mjs';
import { C1_AUDIT_CONTRACT } from './stock-c1-audit-contract.mjs';
import { STOCK_WASTE_READER_CONTRACT } from './stock-waste-reader-contract.mjs';
const sha = 'b'.repeat(40), securityHash = 'c'.repeat(64);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function setup() {
  const fixture = { item: { id: f.item, business_id: STOCK_ACTORS.A.business, name: f.name, active: true, unit: 'unit', supplier_id: null },
    locations: [[f.source, f.sourceName], [f.target, f.targetName]].map(([id, name]) => ({ id, name, business_id: STOCK_ACTORS.A.business, active: true })),
    stocks: [f.source, f.target].map(location_id => ({ id: randomUUID(), location_id, inventory_item_id: f.item, qty: 2,
      avg_cost_per_unit: 0.1, updated_at: '2026-10-23T00:00:00Z' })), recipes: [], purchaseLines: [], waste: [], transactions: [] };
  const parent = makeC1State(fixture, [], 'a'.repeat(40), 'd'.repeat(64), { at: Date.now() - 3600000, until: Date.now() - 1800000 });
  parent.phase = 'PROBES_CONFIRMED'; parent.probes = [{ actor: 'B', status: 'DENIED' }, { actor: 'anon', status: 'DENIED' }];
  C1_CHECKS.slice(0, 8).forEach(name => { parent.checks[name] = 'PASS'; });
  const parentBytes = Buffer.from(sealC1Checkpoint(parent)), parentHash = createHash('sha256').update(parentBytes).digest('hex');
  const catalog = { project_ref_expected: 'msinksoilkluooxenecy', mode: 'READ_ONLY', status: 'PASS_MATCHED_HISTORICAL_CONTRACTS',
    captured_at: new Date().toISOString(), public_schema: { anon_create: false, authenticated_create: false },
    functions: Object.entries(STOCK_FINGERPRINTS).map(([name, fingerprint]) => ({ name,
      fingerprint: name === 'fn_record_inventory_movement' ? STOCK_PRECISION_TARGET_FINGERPRINT : fingerprint,
      present: true, anon_execute: false, authenticated_execute: name !== 'fn_record_inventory_movement' })),
    tables: STOCK_TABLES.map(name => ({ name, present: true, rls: true, anon_select: false })),
    c1_audit_contract: { ...C1_AUDIT_CONTRACT.expected }, waste_reader_contract: { ...STOCK_WASTE_READER_CONTRACT.expected } };
  const env = { QA_SUPABASE_URL: 'https://msinksoilkluooxenecy.supabase.co', QA_SUPABASE_ANON_KEY: 'sb_publishable_SYNTHETIC',
    QA_TWO_TENANT_A_EMAIL: 'a@example.invalid', QA_TWO_TENANT_A_PASSWORD: 'SYNTHETIC_A',
    QA_TWO_TENANT_B_EMAIL: 'b@example.invalid', QA_TWO_TENANT_B_PASSWORD: 'SYNTHETIC_B',
    QA_STOCK_ITEM_ID: f.item, QA_STOCK_SOURCE_LOCATION_ID: f.source, QA_STOCK_TARGET_LOCATION_ID: f.target,
    QA_STOCK_VALIDATED_CODE_SHA: sha, QA_STOCK_CATALOG_FILE: 'SYNTHETIC_CATALOG', QA_C1_SECURITY_FILE: 'SYNTHETIC_SECURITY',
    QA_C1_REVIEWED_SECURITY_SHA256: securityHash, QA_C1_PARENT_FILE: 'SYNTHETIC_PARENT', QA_C1_PARENT_SHA256: parentHash,
    QA_C1_CHILD_EXECUTION_AUTHORIZED: 'TEST_ONLY_EXPLICIT_C1_CHILD_20261023',
    QA_C1_CHILD_AUTHORIZED_CODE_SHA: sha, QA_C1_CHILD_AUTHORIZED_PARENT_SHA256: parentHash,
    QA_C1_CHILD_EXCLUSIVE_WINDOW: 'TEST_ONLY_C1_CHILD_EXCLUSIVE_WINDOW',
    QA_C1_CHILD_EXCLUSIVE_AT: new Date(Date.now() - 1000).toISOString(), QA_C1_CHILD_EXCLUSIVE_UNTIL: new Date(Date.now() + 600000).toISOString() };
  const calls = { client: 0, runtime: 0, reserve: 0, save: [], read: 0, network: 0, probes: 0, stock: 0, audit: 0, close: 0 };
  let parentGood = true, state, durable, current = { ...structuredClone(fixture), audit: [] };
  const store = { parentBytes, parentState: parent, parentHash,
    assertParentUnchanged() { if (!parentGood) throw new StockSignal('C1_CHILD_PARENT_CHANGED'); },
    assertUnreserved() { if (calls.reserve) throw new StockSignal('C1_CHILD_ALREADY_RESERVED_NO_REPLAY'); },
    reserve(value) { assert.equal(calls.reserve, 0); calls.reserve++; state = value; durable = structuredClone(value); },
    save(phase) { calls.save.push(phase); state.phase = phase; durable = structuredClone(state); },
    load() { return { state: structuredClone(durable), lineage: { parent_hash: parentHash, security_hash: securityHash }, childSha256: digest(durable) }; } };
  const client = { isolation: async () => {}, view: async () => { calls.read++; return structuredClone(current); },
    browserSession: () => ({ token: 'SYNTHETIC_SESSION', user: { id: STOCK_ACTORS.A.owner } }),
    negativeProbe: async () => { calls.probes++; assert.fail('never probe'); }, close: async () => { calls.close++; } };
  const dependencies = { git: (...args) => args[0] === 'branch' ? 'automation/nexalvo-qa-actions' : args[0] === 'rev-parse' ? sha : '',
    readJson: path => path === 'SYNTHETIC_CATALOG' ? catalog : {},
    validateSecurity: (_value, expected) => { assert.equal(expected, securityHash); return { securityHash }; },
    openStore: () => store, openClient: async () => { calls.client++; return client; },
    prepareRuntime: async () => { calls.runtime++; return { close: async () => {} }; }, pause: async () => {},
    runBrowser: async ({ state: child, save, report }) => {
      assert.equal(calls.reserve, 1); assert.equal(child.probes.length, 0); assert.notEqual(child.runId, parent.runId);
      for (let index = 0; index < 4; index++) {
        child.operations.push({ name: c1Plan(child)[index].name, status: 'DISPATCHED', auditAttempted: false }); child.pending = 'MOVEMENT';
        save('MOVEMENT_PENDING'); assert.equal(durable.pending, 'MOVEMENT'); calls.stock++; report.stock_requests_forwarded++;
        current = observed(child, index + 1, index);
        const note = c1Plan(child)[index].payload.p_notes;
        Object.assign(child.operations.at(-1), { status: 'CONFIRMED', rows: current.transactions.filter(row => row.note.includes(note)) });
        child.confirmed++; child.pending = null; save('MOVEMENT_CONFIRMED');
        child.operations.at(-1).auditAttempted = true; child.pending = 'AUDIT'; save('AUDIT_PENDING');
        assert.equal(durable.pending, 'AUDIT'); calls.audit++; report.audit_requests_forwarded++;
        current = observed(child, index + 1, index + 1); child.operations.at(-1).auditRow = current.audit[index];
        child.pending = null; save('AUDIT_CONFIRMED');
      }
      for (const name of ['ui_adjustment', 'ui_transfer', 'ui_reverse_transfer', 'persist_reload', 'ui_history']) child.checks[name] = 'PASS';
      return verifyC1View(child, current, 4);
    } };
  const run = (args = ['--preflight']) => stockC1Child(env, args, () => { calls.network++; assert.fail('no real network'); }, dependencies);
  return { env, parent, parentBytes, catalog, calls, store, client, dependencies, run,
    setParentBad: () => { parentGood = false; }, setCurrent: value => { current = value; },
    getState: () => state, setDurable: value => { durable = structuredClone(value); } };
}
function observed(state, stage, audits) {
  const view = { ...structuredClone(state.fixture), audit: [] }, qty = [[2, 2], [2.125, 2], [1.625, 2.5], [2.125, 2], [2, 2]][stage];
  view.stocks.forEach((row, index) => { row.qty = qty[index]; });
  view.transactions = c1ExpectedMovements(state, stage).map(e => ({ id: randomUUID(), business_id: STOCK_ACTORS.A.business,
    inventory_item_id: f.item, location_id: e.location, type: e.type, qty_change: e.qty, unit: 'unit', unit_cost: 0.1,
    total_cost: Math.sign(e.qty) * Math.round(Math.abs(e.qty * 0.1) * 100 + 1e-8) / 100,
    prev_avg_cost: 0.1, new_avg_cost: 0.1, note: e.note, created_by: STOCK_ACTORS.A.owner,
    created_at: new Date().toISOString(), sale_id: null, purchase_order_id: null, related_transaction_id: null }));
  view.transactions.filter(row => row.type === 'TRANSFER_IN').forEach(row => { row.related_transaction_id = view.transactions.find(out => out.type === 'TRANSFER_OUT' && out.note === row.note).id; });
  view.audit = Array.from({ length: audits }, (_, index) => ({ id: randomUUID(), business_id: STOCK_ACTORS.A.business, user_id: STOCK_ACTORS.A.owner, ...c1ExpectedAudit(state, index) }));
  // Existing receipts must be byte-stable across independent observations.
  for (const operation of state.operations) if (operation.rows) view.transactions = view.transactions.map(row => operation.rows.find(old => old.type === row.type && old.note === row.note) || row);
  view.transactions.filter(row => row.type === 'TRANSFER_IN').forEach(row => { row.related_transaction_id = view.transactions.find(out => out.type === 'TRANSFER_OUT' && out.note === row.note).id; });
  state.operations.forEach((operation, index) => { if (operation.auditRow) view.audit[index] = structuredClone(operation.auditRow); });
  return view;
}

test('SIMULATED child explicit modes and separate authorization block before any I/O', async () => {
  for (const args of [[], ['--continue'], ['--resume'], ['--execute', '--preflight']]) {
    assert.throws(() => c1ChildMode(args)); const x = setup(); const report = await x.run(args);
    assert.equal(report.status, 'BLOCKED'); assert.equal(x.calls.client, 0); assert.equal(x.calls.reserve, 0);
  }
  for (const key of ['QA_C1_CHILD_EXECUTION_AUTHORIZED', 'QA_C1_CHILD_AUTHORIZED_CODE_SHA', 'QA_C1_CHILD_AUTHORIZED_PARENT_SHA256']) {
    const x = setup(); x.env[key] = 'SYNTHETIC_WRONG'; const report = await x.run(['--execute']);
    assert.equal(report.code, 'C1_CHILD_SPECIFIC_AUTHORIZATION_REQUIRED'); assert.equal(x.calls.client, 0); assert.equal(x.calls.reserve, 0);
  }
});
test('SIMULATED child read-only preflight needs current gates but never runtime reservation probes or checkpoint writes', async () => {
  const x = setup(); delete x.env.QA_C1_CHILD_EXECUTION_AUTHORIZED;
  const report = await x.run(); assert.equal(report.status, 'PASS'); assert.equal(report.full_homologation, false);
  assert.equal(report.parent_checkpoint_unchanged, true); assert.equal(x.calls.runtime, 0); assert.equal(x.calls.reserve, 0);
  assert.deepEqual(x.calls.save, []); assert.equal(x.calls.probes, 0); assert.equal(x.calls.network, 0);
  assert.equal(report.gates.specific_authorization, 'BLOCKED'); assert.equal(report.gates.exclusive_window, 'BLOCKED');
});
for (const gate of ['git', 'catalog', 'security', 'parent', 'identity', 'isolation', 'baseline', 'reserved']) test(`SIMULATED child ${gate} gate fails before runtime reservation or writes`, async () => {
  const x = setup();
  if (gate === 'git') x.dependencies.git = () => 'SYNTHETIC_WRONG';
  if (gate === 'catalog') x.catalog.public_schema.authenticated_create = true;
  if (gate === 'security') x.dependencies.validateSecurity = () => { throw new StockSignal('C1_CHILD_SECURITY_REVIEWED_DIGEST_MISMATCH'); };
  if (gate === 'parent') x.setParentBad();
  if (gate === 'identity') x.dependencies.openClient = async () => { throw new StockSignal('C1_OWNER_OR_TENANT_MISMATCH'); };
  if (gate === 'isolation') x.client.isolation = async () => { throw new StockSignal('C1_READ_ISOLATION_FAILED'); };
  if (gate === 'baseline') x.setCurrent({ ...structuredClone(x.parent.fixture), stocks: x.parent.fixture.stocks.map(row => ({ ...row, qty: 2.125 })), audit: [] });
  if (gate === 'reserved') x.store.assertUnreserved = () => { throw new StockSignal('C1_CHILD_ALREADY_RESERVED_NO_REPLAY'); };
  const report = await x.run(['--execute']); assert.equal(report.status, 'BLOCKED');
  assert.equal(x.calls.runtime, 0); assert.equal(x.calls.reserve, 0); assert.equal(x.calls.stock, 0); assert.equal(x.calls.probes, 0);
});
test('SIMULATED child happy path reserves first and durably records all eight intents before bounded sends', async () => {
  const x = setup(), before = Buffer.from(x.parentBytes); const report = await x.run(['--execute']);
  assert.equal(report.status, 'PASS', report.code); assert.equal(report.code, 'C1_CHILD_REAL_UI_CYCLE_RESTORED');
  assert.equal(report.full_homologation, true); assert.equal(report.reconciliation.movement_rows, 6);
  assert.equal(report.reconciliation.audit_rows_added, 4); assert.equal(x.calls.stock, 4); assert.equal(x.calls.audit, 4);
  assert.equal(x.calls.save.filter(phase => phase === 'MOVEMENT_PENDING').length, 4);
  assert.equal(x.calls.save.filter(phase => phase === 'AUDIT_PENDING').length, 4);
  assert.equal(x.calls.probes, 0); assert.ok(x.parentBytes.equals(before));
});
test('SIMULATED child expiration during fsync blocks the send after durable intent and never clears it', async () => {
  const x = setup(), save = x.store.save;
  x.store.save = phase => { save(phase); x.env.QA_C1_CHILD_EXCLUSIVE_UNTIL = new Date(Date.now() - 1).toISOString(); };
  const report = await x.run(['--execute']); assert.equal(report.status, 'BLOCKED');
  assert.equal(report.code, 'C1_CHILD_PENDING_RESULT_READONLY_RECOVERY_REQUIRED');
  assert.equal(x.calls.stock, 0); assert.equal(x.calls.audit, 0); assert.equal(x.store.load().state.pending, 'MOVEMENT');
});
test('SIMULATED child lost confirmation save uses the durable pending intent even if memory was already cleared', async () => {
  const x = setup(), save = x.store.save;
  x.store.save = phase => { if (phase === 'MOVEMENT_CONFIRMED') throw Error('Bearer SYNTHETIC_PRIVATE C:\\private'); save(phase); };
  const report = await x.run(['--execute']); assert.equal(report.status, 'BLOCKED');
  assert.equal(x.getState().pending, null); assert.equal(x.store.load().state.pending, 'MOVEMENT');
  assert.equal(report.code, 'C1_CHILD_PENDING_RESULT_READONLY_RECOVERY_REQUIRED'); assert.equal(x.calls.stock, 1); assert.equal(x.calls.audit, 0);
  assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC_PRIVATE|Bearer|private/);
});
test('SIMULATED child parent change during final session cleanup cannot return a stale PASS or intact flag', async () => {
  const x = setup(); x.client.close = async () => x.setParentBad(); const report = await x.run();
  assert.equal(report.status, 'BLOCKED'); assert.equal(report.parent_checkpoint_unchanged, false);
  assert.equal(report.gates.parent_integrity, 'BLOCKED'); assert.equal(report.full_homologation, false);
});
test('SIMULATED child baseline requires timestamp metadata to remain unchanged before any new operation', () => {
  const x = setup(), view = { ...structuredClone(x.parent.fixture), audit: [] };
  view.stocks[0].updated_at = '2026-10-23T00:01:00Z';
  assert.throws(() => assertC1ChildBaseline(x.parent, view), /C1_CHILD_BASELINE_METADATA_CHANGED/);
});
test('SIMULATED child window rejects old tokens future start expired or overlong windows', () => {
  const x = setup(); assert.doesNotThrow(() => c1ChildWindow(x.env));
  for (const patch of [{ QA_C1_CHILD_EXCLUSIVE_WINDOW: 'TEST_ONLY_C1_EXCLUSIVE_WINDOW' },
    { QA_C1_CHILD_EXCLUSIVE_AT: new Date(Date.now() + 60000).toISOString() },
    { QA_C1_CHILD_EXCLUSIVE_UNTIL: new Date(Date.now() - 1).toISOString() },
    { QA_C1_CHILD_EXCLUSIVE_UNTIL: new Date(Date.now() + 3600000).toISOString() }])
    assert.throws(() => c1ChildWindow({ ...x.env, ...patch }));
});

test('SIMULATED child complete runner persists the real store lineage and every intent while leaving original parent bytes unchanged', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const { openC1ChildStore } = await import('./stock-c1-child-store.mjs');
  const sandbox = mkdtempSync(join(tmpdir(), 'nexalvo-child-runner-private-'));
  const previous = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
  try {
    for (const name of Object.keys(previous)) process.env[name] = sandbox;
    const x = setup(), parentDir = join(sandbox, 'nexalvo-stock-c1-parent-synthetic'); mkdirSync(parentDir, { mode: 0o700 });
    const parentFile = join(parentDir, 'stock-recovery.json'); writeFileSync(parentFile, x.parentBytes, { mode: 0o600 });
    x.env.QA_C1_PARENT_FILE = parentFile;
    const actual = openC1ChildStore({ parentFile, parentSha256: x.env.QA_C1_PARENT_SHA256, env: x.env });
    x.dependencies.openStore = () => ({ ...actual,
      reserve: (state, hash) => { const result = actual.reserve(state, hash); x.store.reserve(state, hash); return result; },
      save: phase => { const result = actual.save(phase); x.store.save(phase);
        assert.equal(actual.load().state.phase, phase); return result; } });
    const report = await x.run(['--execute']); assert.equal(report.status, 'PASS', report.code);
    assert.ok(readFileSync(parentFile).equals(x.parentBytes)); assert.equal(actual.load().state.phase, 'RESTORED');
    assert.equal(actual.load().state.probes.length, 0); assert.equal(actual.load().state.confirmed, 4);
    assert.throws(() => actual.assertUnreserved(), /C1_CHILD_ALREADY_RESERVED_NO_REPLAY/);
    assert.equal(x.calls.network, 0); assert.equal(x.calls.probes, 0);
  } finally {
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    rmSync(sandbox, { recursive: true, force: true }); // only this test's synthetic files
  }
});

test('SIMULATED child recovery remains read-only with expired execution window and no execution authorization', async () => {
  const x = setup();
  const child = makeC1State(structuredClone(x.parent.fixture), [], sha, 'd'.repeat(64),
    { at: Date.now() - 7200000, until: Date.now() - 7100000 });
  child.probes = []; x.setDurable(child);
  delete x.env.QA_C1_CHILD_EXECUTION_AUTHORIZED;
  x.env.QA_C1_CHILD_EXCLUSIVE_UNTIL = new Date(Date.now() - 1).toISOString();
  const report = await x.run(['--recover-readonly', 'SYNTHETIC_CHILD']);
  assert.equal(report.status, 'PASS', report.code); assert.equal(report.reconciliation.stage, 0);
  assert.equal(report.full_homologation, false); assert.equal(report.resume_allowed, false);
  assert.equal(report.child_checkpoint_unchanged, true); assert.equal(x.calls.reserve, 0);
  assert.equal(x.calls.runtime, 0); assert.equal(x.calls.probes, 0); assert.deepEqual(x.calls.save, []);
});
test('SIMULATED child change during session cleanup downgrades whole-command recovery and does not conceal it', async () => {
  const x = setup(), child = makeC1State(structuredClone(x.parent.fixture), [], sha, 'd'.repeat(64),
    { at: Date.now(), until: Date.now() + 60000 });
  x.setDurable(child); x.client.close = async () => { child.checks.checkpoint_integrity = 'PASS'; x.setDurable(child); };
  const report = await x.run(['--recover-readonly', 'SYNTHETIC_CHILD']);
  assert.equal(report.status, 'BLOCKED'); assert.equal(report.child_checkpoint_unchanged, false);
  assert.equal(report.code, 'C1_CHILD_RECOVERY_CHECKPOINT_CHANGED'); assert.equal(x.calls.reserve, 0);
});

test('SIMULATED child refuses a parent from an unverified code history before authentication or reservation', async () => {
  const x = setup(), previous = x.dependencies.git;
  x.dependencies.git = (...args) => { if (args[0] === 'merge-base' && args[2] === x.parent.sourceSha) throw Error('SYNTHETIC_PRIVATE'); return previous(...args); };
  const report = await x.run();
  assert.equal(report.code, 'C1_CHILD_PARENT_CODE_NOT_ANCESTOR'); assert.equal(report.status, 'BLOCKED');
  assert.equal(x.calls.client, 0); assert.equal(x.calls.reserve, 0); assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC_PRIVATE/);
});
