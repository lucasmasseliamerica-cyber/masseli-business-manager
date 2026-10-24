// Dedicated C1 child executor. CLI never inherits permission from the normal journey.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { StockSignal, requireStock, stockConfiguration, stockHash, validateStockCatalog } from './stock-journey-core.mjs';
import { C1_CHECKS, c1Scope, c1Precision, c1AuditContract, makeC1State, verifyC1View, stableStockRows } from './stock-c1-protocol.mjs';
import { assessC1Continuation } from './stock-c1-continuation-plan.mjs';
import { openC1Client } from './stock-c1-client.mjs';
import { prepareC1Runtime } from './stock-c1-browser-runtime.mjs';
import { sanitizeC1Diagnostic, sanitizeC1RuntimeDiagnostic } from './stock-c1-diagnostics.mjs';
import { openC1ChildStore } from './stock-c1-child-store.mjs';
import { validateC1ChildSecurity } from './stock-c1-child-security.mjs';
import { runC1ChildBrowserCycle } from './stock-c1-child-browser.mjs';

const AUTHORIZATION = 'TEST_ONLY_EXPLICIT_C1_CHILD_20261023';
const gates = ['parent_integrity', 'identity_permissions', 'current_security', 'unchanged_baseline',
  'exclusive_window', 'single_child_reservation', 'durable_intents', 'specific_authorization'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const hashPattern = /^[a-f0-9]{64}$/;
const safeCode = error => error instanceof StockSignal && /^C[A-Z0-9_]{1,110}$/.test(error.code || '')
  ? error.code : 'C1_CHILD_EXECUTION_UNCONFIRMED';
const stages = new Set(['CONFIGURATION', 'AUTHORIZATION', 'GIT', 'CATALOG', 'SECURITY_REVIEW', 'PARENT_INTEGRITY',
  'AUTHENTICATION', 'READ_ISOLATION', 'BASELINE_READ', 'EXCLUSIVE_WINDOW', 'CHILD_RESERVATION', 'CHILD_RECOVERY',
  'RUNTIME_DEPENDENCIES', 'LOCAL_PORT', 'VITE_START', 'VITE_READY', 'CHROMIUM_LAUNCH', 'BROWSER_CONTEXT',
  'BROWSER_SESSION', 'BROWSER_GUARD', 'PAGE_OPEN', 'INVENTORY_OPEN', 'UI_ADJUSTMENT_FORM', 'UI_TRANSFER_FORM',
  'UI_SUBMIT', 'UI_RELOAD', 'UI_HISTORY', 'FINAL_RECONCILIATION']);
export function c1ChildMode(args) {
  if (args.length === 1 && args[0] === '--preflight') return 'preflight';
  if (args.length === 1 && args[0] === '--execute') return 'execute';
  if (args.length === 2 && args[0] === '--recover-readonly' && args[1]) return 'recovery';
  throw new StockSignal('C1_CHILD_EXPLICIT_MODE_REQUIRED');
}
export function c1ChildWindow(env, now = Date.now()) {
  const at = Date.parse(env.QA_C1_CHILD_EXCLUSIVE_AT), until = Date.parse(env.QA_C1_CHILD_EXCLUSIVE_UNTIL);
  requireStock(env.QA_C1_CHILD_EXCLUSIVE_WINDOW === 'TEST_ONLY_C1_CHILD_EXCLUSIVE_WINDOW'
    && Number.isFinite(now) && Number.isFinite(at) && Number.isFinite(until) && at <= now && now < until
    && until > at && until - at <= 30 * 60000, 'C1_CHILD_EXCLUSIVE_WINDOW_REQUIRED');
  return { at, until, authority: 'OPERATOR_ATTESTATION_NOT_DISTRIBUTED_LOCK' };
}
export function c1ChildAuthorization(env) {
  requireStock(env.QA_C1_CHILD_EXECUTION_AUTHORIZED === AUTHORIZATION
    && /^[a-f0-9]{40}$/.test(env.QA_STOCK_VALIDATED_CODE_SHA || '')
    && hashPattern.test(env.QA_C1_PARENT_SHA256 || '')
    && env.QA_C1_CHILD_AUTHORIZED_CODE_SHA === env.QA_STOCK_VALIDATED_CODE_SHA
    && env.QA_C1_CHILD_AUTHORIZED_PARENT_SHA256 === env.QA_C1_PARENT_SHA256,
  'C1_CHILD_SPECIFIC_AUTHORIZATION_REQUIRED');
}
// A changed timestamp before ANY child stock operation is also evidence of concurrent activity.
export function assertC1ChildBaseline(parent, view) {
  const proof = verifyC1View(parent, view, 0, 0);
  requireStock(stockHash(stableStockRows(view.stocks)) === stockHash(stableStockRows(parent.fixture.stocks)),
    'C1_CHILD_BASELINE_METADATA_CHANGED');
  return proof;
}
export async function reconcileC1ChildReadonly(store, client) {
  store.assertParentUnchanged();
  const before = store.load(), { state } = before;
  try {
    requireStock(state.probes.length === 0 && !state.pending?.startsWith('PROBE_'), 'C1_CHILD_UNSETTLED_PROBE_FORBIDDEN');
    const view = await client.view();
    const stage = state.pending === 'MOVEMENT' ? state.confirmed + 1 : state.confirmed;
    let proof;
    for (const auditCount of [...new Set([stage, Math.max(0, stage - 1)])]) {
      try { proof = verifyC1View(state, view, stage, auditCount); break; } catch { /* fixed fail-closed result below */ }
    }
    requireStock(proof, 'C1_CHILD_RESULT_UNKNOWN_NO_REPLAY');
    if (stage === 0) assertC1ChildBaseline(state, view);
    const auditComplete = proof.audit_rows_added === proof.stage;
    return { scope: 'C1_CHILD_READONLY_RECOVERY', status: 'PASS',
      code: stage === 0 ? 'C1_CHILD_BASELINE_CONFIRMED_NO_OPERATIONS_NO_RESUME'
        : proof.stock_restored && auditComplete ? 'C1_CHILD_RESTORED_OBSERVED_NOT_FULL_HOMOLOGATION'
          : 'C1_CHILD_COMMITTED_STAGE_OBSERVED_NO_REPLAY',
      reconciliation: proof, restored: proof.stock_restored, audit_history: auditComplete ? 'PASS' : 'BLOCKED',
      parent_checkpoint_unchanged: true, child_checkpoint_unchanged: true,
      pending_intent_retained: state.pending !== null, resume_allowed: false, full_homologation: false,
      stock_requests_forwarded: 0, audit_requests_forwarded: 0, negative_requests_forwarded: 0 };
  } finally {
    store.assertParentUnchanged();
    requireStock(store.load().childSha256 === before.childSha256, 'C1_CHILD_RECOVERY_CHECKPOINT_CHANGED');
  }
}
export async function stockC1Child(env = process.env, args = process.argv.slice(2), fetchImpl = fetch, dependencies = {}) {
  // Dependency injection is an in-process test seam only; the CLI always uses these defaults.
  const d = { git, readJson, openStore: openC1ChildStore, openClient: openC1Client,
    prepareRuntime: prepareC1Runtime, validateSecurity: validateC1ChildSecurity,
    runBrowser: runC1ChildBrowserCycle, pause: delay, ...dependencies };
  const report = { scope: 'C1_CHILD_REAL_TEST_STOCK', status: 'BLOCKED', code: 'NOT_STARTED',
    checks: Object.fromEntries(C1_CHECKS.map(name => [name, 'BLOCKED'])),
    gates: Object.fromEntries(gates.map(name => [name, 'BLOCKED'])),
    stock_requests_forwarded: 0, audit_requests_forwarded: 0, negative_requests_forwarded: 0,
    history_rows_deleted: 0, fixtures_created: 0, parent_checkpoint_unchanged: false,
    restored: false, full_homologation: false, resume_allowed: false };
  let mode, store, client, runtime, state, executionStage = 'CONFIGURATION', window, recoveryBefore;
  let stopped = false;
  const stop = () => { stopped = true; };
  const mark = next => { executionStage = stages.has(next) ? next : 'CONFIGURATION'; };
  const windowGate = () => {
    requireStock(!stopped, 'C1_CHILD_INTERRUPTED_NO_REPLAY'); c1ChildAuthorization(env);
    const current = c1ChildWindow(env);
    requireStock(current.at === window.at && current.until === window.until, 'C1_CHILD_WINDOW_CHANGED');
    store.assertParentUnchanged();
  };
  try {
    mode = c1ChildMode(args);
    if (mode === 'execute') {
      mark('AUTHORIZATION'); c1ChildAuthorization(env); window = c1ChildWindow(env);
      report.gates.specific_authorization = 'PASS';
    }
    const config = stockConfiguration(env); c1Scope(config);
    mark('GIT');
    requireStock(d.git('branch', '--show-current') === 'automation/nexalvo-qa-actions'
      && !d.git('status', '--porcelain'), 'C1_CHILD_CLEAN_QA_REQUIRED');
    requireStock(/^[a-f0-9]{40}$/.test(env.QA_STOCK_VALIDATED_CODE_SHA || ''), 'C1_CHILD_VALIDATED_SHA_REQUIRED');
    d.git('merge-base', '--is-ancestor', env.QA_STOCK_VALIDATED_CODE_SHA, 'HEAD');
    requireStock(d.git('diff', '--name-only', `${env.QA_STOCK_VALIDATED_CODE_SHA}..HEAD`).split('\n')
      .every(path => !path || path.startsWith('docs/')), 'C1_CHILD_UNVALIDATED_CODE');
    report.source_sha = d.git('rev-parse', 'HEAD'); report.validated_code_sha = env.QA_STOCK_VALIDATED_CODE_SHA;
    mark('CATALOG'); const catalog = validateStockCatalog(d.readJson(env.QA_STOCK_CATALOG_FILE));
    c1Precision(catalog); c1AuditContract(catalog); report.checks.catalog = 'PASS';
    mark('SECURITY_REVIEW');
    const security = d.validateSecurity(d.readJson(env.QA_C1_SECURITY_FILE), env.QA_C1_REVIEWED_SECURITY_SHA256);
    requireStock(hashPattern.test(security.securityHash || ''), 'C1_CHILD_REVIEWED_SECURITY_REQUIRED');
    report.security_sha256 = security.securityHash; report.gates.current_security = 'PASS';
    mark('PARENT_INTEGRITY'); store = d.openStore({ parentFile: env.QA_C1_PARENT_FILE, parentSha256: env.QA_C1_PARENT_SHA256, env });
    store.assertParentUnchanged();
    try { d.git('merge-base', '--is-ancestor', store.parentState.sourceSha, 'HEAD'); }
    catch { throw new StockSignal('C1_CHILD_PARENT_CODE_NOT_ANCESTOR'); }
    report.gates.parent_integrity = 'PASS';
    if (mode !== 'recovery') store.assertUnreserved();
    else recoveryBefore = store.load(args[1]).childSha256;
    mark('AUTHENTICATION'); client = await d.openClient(config, env, fetchImpl);
    report.checks.owner_a_b = 'PASS'; report.checks.permissions = 'PASS'; report.gates.identity_permissions = 'PASS';
    mark('READ_ISOLATION'); await client.isolation(); report.checks.read_isolation = 'PASS';
    if (mode === 'recovery') {
      mark('CHILD_RECOVERY'); return Object.assign(report, await reconcileC1ChildReadonly({
        assertParentUnchanged: () => store.assertParentUnchanged(), load: () => store.load(args[1]),
      }, client));
    }
    mark('BASELINE_READ');
    const view = await client.view();
    const candidate = assessC1Continuation({ checkpointBytes: store.parentBytes, expectedCheckpointSha256: store.parentHash,
      view, catalog, observedAt: new Date().toISOString() });
    requireStock(candidate.status === 'READY_FOR_REVIEW', 'C1_CHILD_PARENT_NOT_ELIGIBLE');
    assertC1ChildBaseline(store.parentState, view); report.checks.exclusive_fixture = 'PASS';
    report.gates.unchanged_baseline = 'PASS'; report.reservation_available = true;
    report.historical_negative_probes_confirmed = 2;
    report.write_isolation_basis = 'PARENT_DENIED_RECEIPTS_AND_CURRENT_SECURITY_REVIEW_NO_REPLAY';
    if (mode === 'preflight') return Object.assign(report, { scope: 'C1_CHILD_READONLY_PREFLIGHT', status: 'PASS',
      code: 'C1_CHILD_READONLY_GATES_PASS_EXECUTION_NOT_AUTHORIZED', persistent_authorized: false,
      parent_checkpoint_unchanged: true, full_homologation: false });
    mark('EXCLUSIVE_WINDOW'); windowGate(); report.gates.exclusive_window = 'PASS';
    report.checks.exclusive_window = 'PASS';
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    runtime = await d.prepareRuntime({ env, config, onStage: mark });
    windowGate(); await d.pause(1000); const stable = await client.view();
    assertC1ChildBaseline(store.parentState, stable); windowGate();
    // Fresh reads were compared fully; retain the parent's exact order and representation in the child lineage.
    state = makeC1State(structuredClone(store.parentState.fixture), structuredClone(store.parentState.audit),
      report.source_sha, stockHash(catalog), window);
    requireStock(state.runId !== store.parentState.runId, 'C1_CHILD_NEW_RUN_ID_REQUIRED');
    state.probes = []; // historical denied probes remain only in the immutable parent
    Object.assign(state.checks, report.checks, { snapshot: 'PASS', write_isolation: 'PASS' });
    report.checks = state.checks;
    mark('CHILD_RESERVATION'); windowGate();
    store.reserve(state, security.securityHash); report.gates.single_child_reservation = 'PASS';
    report.checks.snapshot = 'PASS';
    const save = phase => { windowGate(); store.save(phase); windowGate(); report.gates.durable_intents = 'PASS'; };
    const proof = await d.runBrowser({ runtime, client, state, save, windowGate, report, onStage: mark });
    mark('FINAL_RECONCILIATION'); windowGate();
    requireStock(report.stock_requests_forwarded === 4 && report.audit_requests_forwarded === 4
      && report.negative_requests_forwarded === 0 && state.confirmed === 4 && state.pending === null,
    'C1_CHILD_BUDGET_OR_RESULT_MISMATCH');
    const independent = verifyC1View(state, await client.view(), 4);
    requireStock(stockHash(independent) === stockHash(proof), 'C1_CHILD_FINAL_RECONCILIATION_MISMATCH');
    for (const name of ['unique_movements', 'audit_history', 'stock_restored', 'cost_restored', 'checkpoint_integrity']) state.checks[name] = 'PASS';
    save('RESTORED'); const sealed = store.load();
    requireStock(stockHash(sealed.state) === stockHash(state), 'C1_CHILD_FINAL_CHECKPOINT_MISMATCH');
    store.assertParentUnchanged(); report.parent_checkpoint_unchanged = true;
    report.child_checkpoint_sha256 = sealed.childSha256; report.reconciliation = independent;
    requireStock(C1_CHECKS.every(name => report.checks[name] === 'PASS') && gates.every(name => report.gates[name] === 'PASS'),
      'C1_CHILD_REQUIRED_CHECK_UNPROVEN');
    report.status = 'PASS'; report.code = 'C1_CHILD_REAL_UI_CYCLE_RESTORED';
    report.restored = true; report.full_homologation = true;
  } catch (error) {
    report.code = safeCode(error); report.blocked_stage = executionStage;
    const diagnostic = sanitizeC1Diagnostic(error?.diagnostic);
    if (diagnostic) report.diagnostic = diagnostic;
    const runtimeDiagnostic = sanitizeC1RuntimeDiagnostic(error?.runtimeDiagnostic);
    if (runtimeDiagnostic) report.runtime_diagnostic = runtimeDiagnostic;
    let durablePending = null;
    try { if (mode === 'execute' && state) durablePending = store.load().state.pending; } catch { /* preserve causal code; never clear an uncertain file */ }
    if (state?.pending || durablePending) report.code = 'C1_CHILD_PENDING_RESULT_READONLY_RECOVERY_REQUIRED';
    report.child_checkpoint_retained = typeof store?.childFile === 'string' && existsSync(store.childFile);
    report.child_reservation_retained = typeof store?.reservationFile === 'string' && existsSync(store.reservationFile);
  } finally {
    try { await runtime?.close(); } catch { /* no raw paths or browser error */ }
    try { await client?.close(); } catch { /* never replace the causal error or expose sessions */ }
    if (store) {
      try { store.assertParentUnchanged(); report.parent_checkpoint_unchanged = true; }
      catch { report.status = 'BLOCKED'; report.code = 'C1_CHILD_PARENT_CHANGED_STOP'; report.full_homologation = false;
        report.parent_checkpoint_unchanged = false; report.gates.parent_integrity = 'BLOCKED'; }
    }
    if (mode === 'recovery' && recoveryBefore) {
      try { requireStock(store.load(args[1]).childSha256 === recoveryBefore, 'C1_CHILD_RECOVERY_CHECKPOINT_CHANGED'); }
      catch { report.status = 'BLOCKED'; report.code = 'C1_CHILD_RECOVERY_CHECKPOINT_CHANGED';
        report.full_homologation = false; report.child_checkpoint_unchanged = false; }
    }
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
  }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let report;
  try { report = await stockC1Child(); }
  catch { report = { scope: 'C1_CHILD_REAL_TEST_STOCK', status: 'BLOCKED', code: 'C1_CHILD_RUNNER_UNCONFIRMED', full_homologation: false }; }
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.status === 'PASS' ? 0 : 2;
}
