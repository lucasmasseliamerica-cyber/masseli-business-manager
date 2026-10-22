// C1 authorization is fixture-specific. No I/O, sessions or database access in this module.
import { randomUUID } from 'node:crypto';
import { STOCK_ACTORS, STOCK_PRECISION_TARGET_FINGERPRINT, requireStock, stockHash, validateStockFixture } from './stock-journey-core.mjs';

export const C1_FIXTURE = Object.freeze({
  item: '6ebfef52-f6c2-4561-b2ac-b3d4bfca1c5f', source: 'f06c0bdd-8c55-4dc2-93b3-5ffcc085206f',
  target: 'd524ae32-48b8-497c-a2ab-9b4777c44f6d', name: 'ZZ_QA_STOCK_C_20261022_EXCLUSIVE',
  sourceName: 'ZZ_QA_STOCK_C_20261022_SOURCE', targetName: 'ZZ_QA_STOCK_C_20261022_TARGET',
});
export const C1_CHECKS = Object.freeze(['catalog', 'owner_a_b', 'permissions', 'read_isolation', 'exclusive_fixture',
  'exclusive_window', 'snapshot', 'write_isolation', 'ui_adjustment', 'ui_transfer', 'ui_reverse_transfer',
  'persist_reload', 'ui_history', 'unique_movements', 'audit_history', 'stock_restored', 'cost_restored', 'checkpoint_integrity']);
export const stableStockRows = rows => rows.map(row => Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))))
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));
const same = (a, b) => stockHash(a) === stockHash(b);
const num = (value, expected) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value) - expected) < 1e-9;

export function c1Mode(args) {
  if (args.length === 1 && args[0] === '--preflight') return 'preflight';
  if (args.length === 1 && args[0] === '--execute') return 'execute';
  if (args.length === 2 && args[0] === '--reconcile-readonly' && args[1]) return 'recovery';
  requireStock(false, 'C1_EXPLICIT_MODE_REQUIRED');
}
export function c1Scope(config) {
  requireStock(config.itemId === C1_FIXTURE.item && config.sourceId === C1_FIXTURE.source && config.targetId === C1_FIXTURE.target, 'C1_AUTHORIZED_FIXTURE_ONLY');
}
export function c1Window(env, now = Date.now()) {
  requireStock(env.QA_STOCK_C1_AUTHORIZED === 'TEST_ONLY_EXPLICIT_C1_20261022', 'C1_AUTHORIZATION_REQUIRED');
  const at = Date.parse(env.QA_STOCK_EXCLUSIVE_AT), until = Date.parse(env.QA_STOCK_EXCLUSIVE_UNTIL);
  requireStock(env.QA_STOCK_EXCLUSIVE_WINDOW === 'TEST_ONLY_C1_EXCLUSIVE_WINDOW' && Number.isFinite(at) && Number.isFinite(until)
    && at <= now && now < until && until - at <= 30 * 60000 && until > at, 'C1_EXCLUSIVE_WINDOW_REQUIRED');
  return { at, until, authority: 'OPERATOR_ATTESTATION_NOT_DISTRIBUTED_LOCK' };
}
export function c1Precision(catalog) {
  requireStock(catalog.functions.find(f => f.name === 'fn_record_inventory_movement')?.fingerprint === STOCK_PRECISION_TARGET_FINGERPRINT, 'C1_INSTALLED_PRECISION_PATCH_REQUIRED');
}
export function c1AuditContract(catalog) {
  const a = catalog.c1_audit_contract;
  // prosrc body hash from versioned hardening; excludes pretty-print/search_path variations.
  requireStock(a?.body_fingerprint === '75c32789a68a73e29a8a82d33e3aad27' && a.security_definer === true
    && a.owner === 'postgres' && a.empty_search_path === true && a.anon_execute === false
    && a.authenticated_execute === true && a.overloads === 1, 'C1_CURRENT_AUDIT_CONTRACT_REQUIRED');
}
export function c1Fixture(fixture) {
  validateStockFixture(fixture);
  requireStock(fixture.item.id === C1_FIXTURE.item && fixture.item.name === C1_FIXTURE.name, 'C1_AUTHORIZED_FIXTURE_ONLY');
  for (const [id, name] of [[C1_FIXTURE.source, C1_FIXTURE.sourceName], [C1_FIXTURE.target, C1_FIXTURE.targetName]]) {
    requireStock(fixture.locations.some(l => l.id === id && l.name === name), 'C1_AUTHORIZED_FIXTURE_ONLY');
    const position = fixture.stocks.find(p => p.location_id === id);
    requireStock(position && num(position.qty, 2) && num(position.avg_cost_per_unit, 0.1), 'C1_EXACT_BASELINE_REQUIRED');
  }
}
export function c1Plan(state) {
  const common = { p_business_id: STOCK_ACTORS.A.business, p_inventory_item_id: C1_FIXTURE.item };
  const tag = step => `NEXALVO_C1_${state.runId}_${step}`;
  const adjust = (name, target) => ({ name, rpc: 'fn_adjust_inventory_count', payload: { ...common,
    p_location_id: C1_FIXTURE.source, p_new_qty: target, p_reason: 'Physical Count', p_notes: tag(name) } });
  const transfer = (name, from, to) => ({ name, rpc: 'fn_transfer_inventory', payload: { ...common,
    p_from_location_id: from, p_to_location_id: to, p_qty: 0.5, p_notes: tag(name) } });
  return [adjust('COUNT', 2.125), transfer('TRANSFER', C1_FIXTURE.source, C1_FIXTURE.target),
    transfer('RETURN', C1_FIXTURE.target, C1_FIXTURE.source), adjust('RESTORE', 2)];
}
export function makeC1State(fixture, audit, sourceSha, catalogHash, window) {
  c1Fixture(fixture);
  requireStock(Array.isArray(audit), 'C1_AUDIT_SNAPSHOT_REQUIRED');
  return { version: 1, scope: 'C1_TEST_STOCK', runId: randomUUID(), fixture, audit, sourceSha, catalogHash,
    startedAt: new Date().toISOString(), window, phase: 'SNAPSHOT', confirmed: 0, pending: null,
    operations: [], probes: [], checks: Object.fromEntries(C1_CHECKS.map(c => [c, 'BLOCKED'])) };
}
export function validateC1State(state) {
  requireStock(state?.version === 1 && state.scope === 'C1_TEST_STOCK' && /^[0-9a-f-]{36}$/.test(state.runId || '')
    && /^[0-9a-f]{40}$/.test(state.sourceSha || '') && /^[0-9a-f]{64}$/.test(state.catalogHash || ''), 'C1_CHECKPOINT_SCOPE_INVALID');
  c1Fixture(state.fixture);
  requireStock(Number.isInteger(state.confirmed) && state.confirmed >= 0 && state.confirmed <= 4
    && Array.isArray(state.operations) && state.operations.length <= 4 && Array.isArray(state.probes) && state.probes.length <= 2
    && [null, 'MOVEMENT', 'AUDIT', 'PROBE_B', 'PROBE_anon'].includes(state.pending)
    && state.operations.length === state.confirmed + (state.pending === 'MOVEMENT' ? 1 : 0)
    && state.operations.every((op, i) => op.name === c1Plan(state)[i].name && op.status === (i < state.confirmed ? 'CONFIRMED' : 'DISPATCHED')
      && typeof op.auditAttempted === 'boolean' && (i >= state.confirmed || (Array.isArray(op.rows) && op.rows.length > 0)))
    && state.probes.every((p, i) => p.actor === ['B', 'anon'][i] && ['DISPATCHED', 'DENIED'].includes(p.status))
    && (state.pending !== 'AUDIT' || (state.confirmed > 0 && state.operations.at(-1).auditAttempted && !state.operations.at(-1).auditRow))
    && Object.keys(state.checks || {}).length === C1_CHECKS.length && C1_CHECKS.every(c => ['PASS', 'BLOCKED'].includes(state.checks[c])), 'C1_CHECKPOINT_STATE_INVALID');
  return state;
}
export function c1Payload(state, rpc, payload) {
  const intent = c1Plan(state)[state.confirmed];
  requireStock(intent && state.pending === null && state.operations.length === state.confirmed
    && state.operations.every(op => op.status === 'CONFIRMED' && op.auditAttempted && op.auditRow)
    && rpc === intent.rpc && same(payload, intent.payload), 'C1_REPLAY_OR_OUT_OF_SCOPE_WRITE');
  return intent;
}
export function c1ExpectedAudit(state, index) {
  const step = c1Plan(state)[index], item = state.fixture.item;
  if (step.rpc === 'fn_adjust_inventory_count') return { action: 'Client: Stock Adjusted', details: `${item.name} target ${step.payload.p_new_qty} ${item.unit} · Physical Count` };
  const from = state.fixture.locations.find(l => l.id === step.payload.p_from_location_id).name;
  const to = state.fixture.locations.find(l => l.id === step.payload.p_to_location_id).name;
  return { action: 'Client: Stock Transferred', details: `${item.name} 0.5 ${item.unit} · ${from} → ${to} · ${step.payload.p_notes}` };
}
export function c1AuditPayload(state, payload) {
  requireStock(state.confirmed > 0 && !state.pending, 'C1_AUDIT_WITHOUT_CONFIRMED_MOVEMENT');
  const expected = c1ExpectedAudit(state, state.confirmed - 1);
  requireStock(same(payload, { p_action: expected.action.replace('Client: ', ''), p_details: expected.details }), 'C1_AUDIT_OUT_OF_SCOPE');
  const op = state.operations[state.confirmed - 1];
  requireStock(op.status === 'CONFIRMED' && !op.auditAttempted, 'C1_AUDIT_REPLAY_FORBIDDEN');
  return op;
}
export function c1ExpectedMovements(state, stage) {
  return c1Plan(state).slice(0, stage).flatMap((step, i) => {
    const base = { note: step.payload.p_notes, step: i };
    if (step.rpc === 'fn_adjust_inventory_count') return [{ ...base, location: C1_FIXTURE.source, type: 'ADJUSTMENT', qty: i === 0 ? 0.125 : -0.125,
      note: 'Reason: Physical Count — ' + step.payload.p_notes }];
    return [{ ...base, location: step.payload.p_from_location_id, type: 'TRANSFER_OUT', qty: -0.5 },
      { ...base, location: step.payload.p_to_location_id, type: 'TRANSFER_IN', qty: 0.5 }];
  });
}
export function verifyC1View(state, view, stage, auditStages = stage) {
  requireStock(Number.isInteger(stage) && stage >= 0 && stage <= 4 && auditStages >= 0 && auditStages <= stage, 'C1_INVALID_RECONCILIATION_STAGE');
  const baseline = state.fixture;
  requireStock(same(view.item, baseline.item) && same(stableStockRows(view.locations), stableStockRows(baseline.locations)), 'C1_FIXTURE_METADATA_CHANGED');
  for (const name of ['recipes', 'purchaseLines', 'waste']) requireStock(same(stableStockRows(view[name]), stableStockRows(baseline[name])), 'C1_DEPENDENCY_OR_WASTE_CHANGED');
  const expectedQty = [[2, 2], [2.125, 2], [1.625, 2.5], [2.125, 2], [2, 2]][stage];
  requireStock(view.stocks.length === 2, 'C1_STOCK_POSITION_CHANGED');
  for (let i = 0; i < 2; i++) {
    const id = [C1_FIXTURE.source, C1_FIXTURE.target][i];
    const old = baseline.stocks.find(s => s.location_id === id), row = view.stocks.find(s => s.id === old.id);
    requireStock(row && row.location_id === id && row.inventory_item_id === C1_FIXTURE.item && num(row.qty, expectedQty[i]) && num(row.avg_cost_per_unit, 0.1), 'C1_BALANCE_OR_COST_MISMATCH');
    const stable = s => Object.fromEntries(Object.entries(s).filter(([key]) => !['qty', 'avg_cost_per_unit', 'updated_at'].includes(key)));
    requireStock(same(stable(row), stable(old)), 'C1_STOCK_METADATA_CHANGED');
  }
  const expected = c1ExpectedMovements(state, stage), rows = view.transactions;
  requireStock(rows.length === expected.length && new Set(rows.map(r => r.id)).size === rows.length
    && rows.every(r => /^[a-f0-9-]{36}$/.test(r.id || '') && Number.isFinite(Date.parse(r.created_at))
      && Date.parse(r.created_at) >= Date.parse(state.startedAt) - 120000 && Date.parse(r.created_at) <= Date.now() + 60000), 'C1_MOVEMENT_CARDINALITY_MISMATCH');
  for (const e of expected) {
    const found = rows.filter(r => r.type === e.type && r.location_id === e.location && r.note === e.note);
    requireStock(found.length === 1, 'C1_UNEXPECTED_OR_DUPLICATED_MOVEMENT');
    const row = found[0];
    requireStock(row.business_id === STOCK_ACTORS.A.business && row.inventory_item_id === C1_FIXTURE.item
      && row.created_by === STOCK_ACTORS.A.owner && row.unit === baseline.item.unit
      && num(row.qty_change, e.qty) && num(row.unit_cost, 0.1) && num(row.prev_avg_cost, 0.1) && num(row.new_avg_cost, 0.1)
      && num(row.total_cost, Math.sign(e.qty) * Math.round(Math.abs(e.qty * 0.1) * 100 + 1e-8) / 100)
      && row.sale_id == null && row.purchase_order_id == null, 'C1_MOVEMENT_VALUE_OR_OWNER_MISMATCH');
    if (e.type === 'TRANSFER_IN') {
      const out = rows.find(r => r.type === 'TRANSFER_OUT' && r.note === e.note);
      requireStock(out && row.related_transaction_id === out.id, 'C1_TRANSFER_LINK_MISMATCH');
    } else requireStock(row.related_transaction_id == null, 'C1_UNEXPECTED_MOVEMENT_LINK');
  }
  // Never alter or omit a previous receipt. New movements/returned IDs must agree with prior reads.
  for (const op of state.operations.filter(op => op.status === 'CONFIRMED')) {
    for (const row of op.rows) requireStock(same(rows.find(r => r.id === row.id), row), 'C1_CONFIRMED_HISTORY_CHANGED');
  }
  const audit = view.audit;
  for (const row of state.audit) requireStock(same(audit.find(r => r.id === row.id), row), 'C1_ORIGINAL_AUDIT_CHANGED');
  const created = audit.filter(r => !state.audit.some(old => old.id === r.id));
  requireStock(created.length === auditStages && new Set(audit.map(r => r.id)).size === audit.length, 'C1_AUDIT_CARDINALITY_MISMATCH');
  for (let i = 0; i < auditStages; i++) {
    const e = c1ExpectedAudit(state, i);
    const found = created.filter(r => r.action === e.action && r.details === e.details && r.business_id === STOCK_ACTORS.A.business && r.user_id === STOCK_ACTORS.A.owner);
    requireStock(found.length === 1, 'C1_AUDIT_NOT_CONFIRMED');
    const receipt = state.operations[i]?.auditRow;
    if (receipt) requireStock(same(found[0], receipt), 'C1_CONFIRMED_AUDIT_CHANGED');
  }
  return { stage, stock_restored: stage === 4, cost_restored: true, movement_rows: rows.length, audit_rows_added: created.length,
    positions: expectedQty.map((qty, i) => ({ position: i + 1, qty_before: 2, qty_after: qty, average_cost_before: 0.1, average_cost_after: 0.1 })) };
}
export function sealC1Checkpoint(state) {
  validateC1State(state);
  const text = JSON.stringify(state);
  requireStock(!/Bearer\s|eyJ[A-Za-z0-9_-]{16,}\.|sb_secret_|@|-----BEGIN|[?&](?:token|access_token)=/i.test(text), 'C1_SECRET_IN_CHECKPOINT');
  return JSON.stringify({ integrity: stockHash(state), state });
}
export function unsealC1Checkpoint(bytes) {
  let envelope; try { envelope = JSON.parse(bytes.toString('utf8')); } catch { requireStock(false, 'C1_CHECKPOINT_INVALID'); }
  requireStock(envelope?.integrity === stockHash(envelope?.state), 'C1_CHECKPOINT_CHECKSUM_MISMATCH');
  return validateC1State(envelope.state);
}
