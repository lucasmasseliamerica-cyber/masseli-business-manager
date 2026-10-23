import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { assessC1Continuation } from './stock-c1-continuation-plan.mjs';
import { STOCK_ACTORS, STOCK_FINGERPRINTS, STOCK_TABLES, STOCK_PRECISION_TARGET_FINGERPRINT } from './stock-journey-core.mjs';
import { C1_FIXTURE, C1_CHECKS, makeC1State, sealC1Checkpoint, c1Mode } from './stock-c1-protocol.mjs';
import { C1_AUDIT_CONTRACT } from './stock-c1-audit-contract.mjs';
import { STOCK_WASTE_READER_CONTRACT } from './stock-waste-reader-contract.mjs';
const now = Date.parse('2026-10-23T12:00:00Z');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function setup() {
  const fixture = { item: { id: C1_FIXTURE.item, business_id: STOCK_ACTORS.A.business, name: C1_FIXTURE.name,
    active: true, supplier_id: null, unit: 'unit', notes: 'SYNTHETIC_METADATA' },
    locations: [[C1_FIXTURE.source, C1_FIXTURE.sourceName], [C1_FIXTURE.target, C1_FIXTURE.targetName]]
      .map(([id, name]) => ({ id, name, business_id: STOCK_ACTORS.A.business, active: true })),
    stocks: [C1_FIXTURE.source, C1_FIXTURE.target].map(location_id => ({ id: randomUUID(), inventory_item_id: C1_FIXTURE.item,
      location_id, qty: 2, avg_cost_per_unit: 0.1 })), transactions: [], recipes: [], purchaseLines: [], waste: [] };
  const state = makeC1State(fixture, [{ id: randomUUID(), action: 'Client: Existing synthetic audit', details: 'SYNTHETIC_HISTORY' }],
    'a'.repeat(40), 'b'.repeat(64), { at: now - 3600000, until: now - 1800000 });
  state.startedAt = new Date(now - 3600000).toISOString(); state.phase = 'PROBES_CONFIRMED';
  state.probes = [{ actor: 'B', status: 'DENIED' }, { actor: 'anon', status: 'DENIED' }];
  for (const name of C1_CHECKS.slice(0, 8)) state.checks[name] = 'PASS';
  const catalog = { project_ref_expected: 'msinksoilkluooxenecy', mode: 'READ_ONLY', status: 'PASS_MATCHED_HISTORICAL_CONTRACTS',
    captured_at: new Date(now).toISOString(), public_schema: { anon_create: false, authenticated_create: false },
    functions: Object.entries(STOCK_FINGERPRINTS).map(([name, fingerprint]) => ({ name,
      fingerprint: name === 'fn_record_inventory_movement' ? STOCK_PRECISION_TARGET_FINGERPRINT : fingerprint,
      present: true, anon_execute: false, authenticated_execute: name !== 'fn_record_inventory_movement' })),
    tables: STOCK_TABLES.map(name => ({ name, present: true, rls: true, anon_select: false })),
    c1_audit_contract: { ...C1_AUDIT_CONTRACT.expected }, waste_reader_contract: { ...STOCK_WASTE_READER_CONTRACT.expected } };
  const view = { ...structuredClone(fixture), audit: structuredClone(state.audit) };
  const checkpointBytes = Buffer.from(sealC1Checkpoint(state));
  return { state, input: { checkpointBytes, expectedCheckpointSha256: hash(checkpointBytes), view, catalog,
    observedAt: new Date(now).toISOString() } };
}
function repack(input, state) { input.checkpointBytes = Buffer.from(sealC1Checkpoint(state)); input.expectedCheckpointSha256 = hash(input.checkpointBytes); }
function noExecution(report) {
  assert.equal(report.execution_enabled, false); assert.equal(report.persistent_authorized, false);
  assert.equal(report.full_homologation, false);
  assert.deepEqual([report.stock_requests_forwarded, report.audit_requests_forwarded, report.negative_requests_forwarded, report.checkpoints_modified], [0, 0, 0, 0]);
}
function blocked(input) { const report = assessC1Continuation(input, now); noExecution(report); assert.equal(report.status, 'BLOCKED'); return report; }

test('C1 pure continuation assessment preserves parent bytes and proposes only review of a bounded same-fixture plan', () => {
  const { input } = setup(), before = Buffer.from(input.checkpointBytes), previous = JSON.stringify(input);
  const report = assessC1Continuation(input, now); noExecution(report);
  assert.equal(report.status, 'READY_FOR_REVIEW'); assert.notEqual(report.status, 'PASS');
  assert.equal(report.code, 'C1_ZERO_OPERATION_CONTINUATION_CANDIDATE_NOT_AUTHORIZED');
  assert.equal(report.baseline_unchanged, true); assert.equal(report.same_fixture_candidate, true);
  assert.equal(report.new_fixture_required_by_current_evidence, false); assert.equal(report.negative_probes_planned, 0);
  assert.equal(report.future_maximum_budget.stock_operations, 4); assert.equal(report.future_maximum_budget.movement_rows, 6);
  assert.equal(report.future_maximum_budget.audit_entries, 4);
  assert.equal(report.future_checkpoint_policy.immutable_parent, true); assert.equal(report.future_checkpoint_policy.child_executor_implemented, false);
  assert.equal(report.live_identity_permissions_and_exclusivity_verified, false);
  assert.ok(report.required_external_gates.includes('NEW_EXPLICIT_CONTINUATION_AUTHORIZATION'));
  assert.ok(report.required_external_gates.includes('CURRENT_TEST_CONTRACTS_ACL_POLICIES_REVIEWED'));
  assert.ok(input.checkpointBytes.equals(before)); assert.equal(JSON.stringify(input), previous);
  assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC_|business_id|user_id|checkpointBytes|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/i);
});
test('C1 continuation rejects missing bytes original hash and tampered envelope even if its outer hash is recomputed', () => {
  for (const patch of [{ checkpointBytes: undefined }, { checkpointBytes: '{}' }, { expectedCheckpointSha256: undefined },
    { expectedCheckpointSha256: 'a'.repeat(64) }]) { const { input } = setup(); blocked({ ...input, ...patch }); }
  const { input } = setup(); const envelope = JSON.parse(input.checkpointBytes); envelope.state.phase = 'SYNTHETIC_TAMPER';
  input.checkpointBytes = Buffer.from(JSON.stringify(envelope)); input.expectedCheckpointSha256 = hash(input.checkpointBytes);
  assert.equal(blocked(input).code, 'C1_CONTINUATION_PARENT_REJECTED');
});
for (const phase of ['SNAPSHOT', 'MOVEMENT_PENDING', 'RESTORED', 'SYNTHETIC_OTHER']) test(`C1 continuation rejects parent phase ${phase}`, () => {
  const { input, state } = setup(); state.phase = phase; repack(input, state);
  assert.equal(blocked(input).code, 'C1_CONTINUATION_ZERO_OPERATION_PARENT_REQUIRED');
});
test('C1 continuation rejects pending or previously confirmed operations and never converts unknown results into permission', () => {
  const { input, state } = setup(); state.pending = 'PROBE_B'; repack(input, state); blocked(input);
  state.pending = 'MOVEMENT'; state.operations = [{ name: 'COUNT', status: 'DISPATCHED', auditAttempted: false }];
  repack(input, state); blocked(input);
  state.pending = null; state.confirmed = 1; state.operations = [{ name: 'COUNT', status: 'CONFIRMED', auditAttempted: false, rows: [{}] }];
  repack(input, state); blocked(input);
});
test('C1 continuation requires exactly the two original settled negative probes without planning any replay', () => {
  for (const probes of [[], [{ actor: 'B', status: 'DENIED' }], [{ actor: 'B', status: 'DISPATCHED' }, { actor: 'anon', status: 'DENIED' }]]) {
    const { input, state } = setup(); state.probes = probes; repack(input, state);
    assert.equal(blocked(input).code, 'C1_CONTINUATION_SETTLED_PROBES_REQUIRED');
  }
});
test('C1 continuation requires all eight historical gates and does not mint missing evidence', () => {
  for (const name of C1_CHECKS.slice(0, 8)) { const { input, state } = setup(); state.checks[name] = 'BLOCKED'; repack(input, state);
    assert.equal(blocked(input).code, 'C1_CONTINUATION_HISTORICAL_GATES_REQUIRED'); }
});
for (const drift of ['quantity', 'cost', 'metadata', 'locations', 'recipe', 'purchase', 'waste', 'movement', 'old-audit', 'new-audit'])
  test(`C1 continuation rejects current ${drift} drift without changing parent bytes`, () => {
    const { input } = setup(), before = Buffer.from(input.checkpointBytes);
    if (drift === 'quantity') input.view.stocks[0].qty = 2.125;
    if (drift === 'cost') input.view.stocks[1].avg_cost_per_unit = 0.2;
    if (drift === 'metadata') input.view.item.notes = 'CHANGED';
    if (drift === 'locations') input.view.locations[0].active = false;
    if (drift === 'recipe') input.view.recipes.push({ id: randomUUID() });
    if (drift === 'purchase') input.view.purchaseLines.push({ id: randomUUID() });
    if (drift === 'waste') input.view.waste.push({ id: randomUUID() });
    if (drift === 'movement') input.view.transactions.push({ id: randomUUID() });
    if (drift === 'old-audit') input.view.audit[0].details = 'CHANGED';
    if (drift === 'new-audit') input.view.audit.push({ id: randomUUID() });
    assert.equal(blocked(input).code, 'C1_CONTINUATION_BASELINE_DRIFT'); assert.ok(input.checkpointBytes.equals(before));
  });
test('C1 continuation rejects stale catalogue precision downgrade ACL drift missing reader or tenant security drift', () => {
  for (const change of [c => { c.captured_at = new Date(now - 86400001).toISOString(); },
    c => { c.functions.find(f => f.name === 'fn_record_inventory_movement').fingerprint = STOCK_FINGERPRINTS.fn_record_inventory_movement; },
    c => { c.c1_audit_contract.authenticated_execute = false; }, c => { c.c1_audit_contract.owner = 'authenticated'; },
    c => { delete c.waste_reader_contract; }, c => { c.tables[0].rls = false; },
    c => { c.functions[0].anon_execute = true; }, c => { c.public_schema.authenticated_create = true; }]) {
    const { input } = setup(); change(input.catalog); assert.equal(blocked(input).code, 'C1_CONTINUATION_CATALOG_REJECTED');
  }
});
test('C1 continuation rejects invalid stale future or pre-parent observations rather than treating past recovery as a current write gate', () => {
  for (const observedAt of [undefined, null, 'SYNTHETIC_INVALID', new Date(now - 300001).toISOString(), new Date(now + 60001).toISOString()]) {
    const { input } = setup(); input.observedAt = observedAt; assert.equal(blocked(input).code, 'C1_CONTINUATION_FRESH_OBSERVATION_REQUIRED');
  }
  const { input, state } = setup(); state.startedAt = new Date(now + 1000).toISOString(); repack(input, state);
  assert.equal(blocked(input).code, 'C1_CONTINUATION_FRESH_OBSERVATION_REQUIRED');
});
test('C1 continuation rejects invalid or future parent start time and invalid current time', () => {
  for (const value of [undefined, 'SYNTHETIC_INVALID', new Date(now + 60001).toISOString()]) {
    const { input, state } = setup(); state.startedAt = value; repack(input, state);
    assert.equal(blocked(input).code, 'C1_CONTINUATION_PARENT_TIME_REJECTED');
  }
  const report = assessC1Continuation(setup().input, NaN); noExecution(report); assert.equal(report.status, 'BLOCKED');
});
test('C1 continuation catches unexpected input exceptions without exposing raw messages identities or paths', () => {
  const input = Object.defineProperty({}, 'checkpointBytes', { get() { throw Error('Bearer SYNTHETIC_PRIVATE person@example.invalid C:\\private'); } });
  const report = blocked(input);
  assert.equal(report.code, 'C1_CONTINUATION_INPUT_REQUIRED');
  assert.doesNotMatch(JSON.stringify(report), /Bearer|SYNTHETIC_PRIVATE|example\.invalid|C:\\private/);
  for (const value of [undefined, null, {}, [], 'SYNTHETIC_INVALID']) blocked(value);
});
test('C1 existing execution mode still rejects continue resume and mixed arguments; planner adds no execution entrypoint', () => {
  for (const args of [['--continue'], ['--resume'], ['--execute', '--continue'], ['--reconcile-readonly', 'file', '--execute']])
    assert.throws(() => c1Mode(args), /C1_EXPLICIT_MODE_REQUIRED/);
});
