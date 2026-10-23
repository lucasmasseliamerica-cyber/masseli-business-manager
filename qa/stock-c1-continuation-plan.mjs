// Pure local planning only. No Auth, environment, filesystem, browser, network or execution mode.
import { createHash } from 'node:crypto';
import { validateStockCatalog } from './stock-journey-core.mjs';
import { unsealC1Checkpoint, c1Precision, c1AuditContract, c1Fixture, verifyC1View } from './stock-c1-protocol.mjs';

const originalGates = Object.freeze(['catalog', 'owner_a_b', 'permissions', 'read_isolation',
  'exclusive_fixture', 'exclusive_window', 'snapshot', 'write_isolation']);
const externalGates = Object.freeze(['FINAL_QA_SHA_CI_APPROVED', 'AUTHENTICATED_OWNER_A_B_AND_PERMISSIONS',
  'CURRENT_TEST_CONTRACTS_ACL_POLICIES_REVIEWED', 'CURRENT_PARENT_HASH_PRIVATE_ACL_AND_FULL_BASELINE',
  'EXCLUSIVE_OPERATIONAL_WINDOW', 'NEW_EXPLICIT_CONTINUATION_AUTHORIZATION',
  'NO_OTHER_CHILD_FOR_PARENT_OR_PENDING_REQUEST', 'REVIEWED_SINGLE_USE_CHILD_EXECUTOR_NOT_IMPLEMENTED']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

// READY_FOR_REVIEW is a local candidate assessment, never a live preflight or permission to write.
export function assessC1Continuation(input, now = Date.now()) {
  const report = { scope: 'C1_CONTINUATION_PLAN_ONLY', status: 'BLOCKED', code: 'C1_CONTINUATION_INPUT_REQUIRED',
    execution_enabled: false, persistent_authorized: false, full_homologation: false,
    stock_requests_forwarded: 0, audit_requests_forwarded: 0, negative_requests_forwarded: 0,
    checkpoints_modified: 0, required_external_gates: [...externalGates] };
  let code = 'C1_CONTINUATION_INPUT_REQUIRED';
  const require = (ok, reason) => { if (!ok) { code = reason; throw new Error('BLOCKED'); } };
  try {
    require(input && typeof input === 'object' && Number.isFinite(now), code);
    require(Buffer.isBuffer(input.checkpointBytes) || input.checkpointBytes instanceof Uint8Array,
      'C1_CONTINUATION_ORIGINAL_BYTES_REQUIRED');
    const bytes = Buffer.from(input.checkpointBytes);
    require(typeof input.expectedCheckpointSha256 === 'string' && /^[a-f0-9]{64}$/i.test(input.expectedCheckpointSha256),
      'C1_CONTINUATION_ORIGINAL_HASH_REQUIRED');
    require(digest(bytes) === input.expectedCheckpointSha256.toLowerCase(), 'C1_CONTINUATION_ORIGINAL_HASH_MISMATCH');
    code = 'C1_CONTINUATION_PARENT_REJECTED';
    const parent = unsealC1Checkpoint(bytes);
    require(parent.phase === 'PROBES_CONFIRMED' && parent.pending === null && parent.confirmed === 0
      && parent.operations.length === 0, 'C1_CONTINUATION_ZERO_OPERATION_PARENT_REQUIRED');
    require(parent.probes.length === 2 && parent.probes.every((probe, index) =>
      probe.actor === ['B', 'anon'][index] && probe.status === 'DENIED'), 'C1_CONTINUATION_SETTLED_PROBES_REQUIRED');
    require(originalGates.every(name => parent.checks[name] === 'PASS'), 'C1_CONTINUATION_HISTORICAL_GATES_REQUIRED');
    const startedAt = typeof parent.startedAt === 'string' ? Date.parse(parent.startedAt) : NaN;
    require(Number.isFinite(startedAt) && startedAt <= now + 60000, 'C1_CONTINUATION_PARENT_TIME_REJECTED');
    const observedAt = typeof input.observedAt === 'string' ? Date.parse(input.observedAt) : NaN;
    require(Number.isFinite(observedAt) && now - observedAt <= 300000 && observedAt - now <= 60000
      && observedAt >= startedAt, 'C1_CONTINUATION_FRESH_OBSERVATION_REQUIRED');
    code = 'C1_CONTINUATION_CATALOG_REJECTED';
    const catalog = validateStockCatalog(input.catalog, now);
    c1Precision(catalog); c1AuditContract(catalog);
    code = 'C1_CONTINUATION_BASELINE_DRIFT';
    c1Fixture(input.view);
    const baseline = verifyC1View(parent, input.view, 0, 0);
    require(baseline.stage === 0 && baseline.movement_rows === 0 && baseline.audit_rows_added === 0,
      'C1_CONTINUATION_BASELINE_DRIFT');
    require(digest(bytes) === input.expectedCheckpointSha256.toLowerCase(), 'C1_CONTINUATION_ORIGINAL_HASH_MISMATCH');
    return { ...report, status: 'READY_FOR_REVIEW', code: 'C1_ZERO_OPERATION_CONTINUATION_CANDIDATE_NOT_AUTHORIZED',
      parent_input_integrity: 'MATCHED_ORIGINAL_HASH', parent_phase: 'PROBES_CONFIRMED', stage: 0,
      baseline_unchanged: true, same_fixture_candidate: true, new_fixture_required_by_current_evidence: false,
      historical_negative_probes: 2, negative_probes_planned: 0,
      future_maximum_budget: { stock_operations: 4, movement_rows: 6, audit_entries: 4,
        quantity_per_transfer: 0.5, count_delta: 0.125, final_source_qty: 2, final_target_qty: 2, average_cost: 0.1 },
      future_checkpoint_policy: { immutable_parent: true, new_child_required: true, child_executor_implemented: false,
        single_child_per_parent_required: true, parent_write_allowed: false },
      unknown_result_policy: 'STOP_READ_ONLY_NO_REPLAY_OR_AUTOMATIC_COMPENSATION',
      live_identity_permissions_and_exclusivity_verified: false };
  } catch { return { ...report, code }; }
}
