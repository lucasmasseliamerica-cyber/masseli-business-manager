// Opt-in C1 only. Ordinary CI parses/tests this file but never executes TEST stock writes.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, existsSync, realpathSync, lstatSync, readdirSync, openSync, closeSync, unlinkSync, fsyncSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { StockSignal, STOCK_HOST, requireStock, stockConfiguration, validateStockCatalog, stockHash } from './stock-journey-core.mjs';
import { C1_FIXTURE, C1_CHECKS, c1Mode, c1Scope, c1Window, c1Precision, c1AuditContract, c1Fixture, c1Plan, makeC1State,
  verifyC1View, sealC1Checkpoint, unsealC1Checkpoint } from './stock-c1-protocol.mjs';
import { openC1Client } from './stock-c1-client.mjs';
import { createC1BrowserGuard } from './stock-c1-browser-guard.mjs';
import { sanitizeC1Diagnostic, sanitizeC1ExecutionStage, sanitizeC1RuntimeDiagnostic } from './stock-c1-diagnostics.mjs';
import { prepareC1Runtime } from './stock-c1-browser-runtime.mjs';

const LOCAL = 'http://127.0.0.1:4189';
const delay = ms => new Promise(r => setTimeout(r, ms));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function privateC1Path(env, recoveryFile) {
  requireStock(typeof env.QA_STOCK_PRIVATE_DIR === 'string', 'C1_PRIVATE_DIRECTORY_REQUIRED');
  const directory = resolve(env.QA_STOCK_PRIVATE_DIR), root = realpathSync(tmpdir());
  const rel = relative(root, realpathSync(directory));
  requireStock(rel && !rel.startsWith('..') && !isAbsolute(rel) && basename(directory).startsWith('nexalvo-stock-c1-'), 'C1_PRIVATE_TEMP_REQUIRED');
  let ancestor = directory;
  while (ancestor !== dirname(ancestor)) {
    requireStock(!lstatSync(ancestor).isSymbolicLink(), 'C1_PRIVATE_LINK_FORBIDDEN');
    if (ancestor === root) break;
    ancestor = dirname(ancestor);
  }
  const file = join(directory, 'stock-recovery.json');
  if (recoveryFile) requireStock(resolve(recoveryFile) === file && !lstatSync(file).isSymbolicLink(), 'C1_RECOVERY_FILE_REQUIRED');
  if (process.platform === 'win32') requireStock(env.QA_STOCK_PRIVATE_DIRECTORY_ACL === 'CURRENT_USER_ONLY', 'C1_WINDOWS_PRIVATE_ACL_REQUIRED');
  else for (const path of recoveryFile ? [directory, file] : [directory]) {
    const stat = lstatSync(path);
    requireStock(stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 'C1_PRIVATE_PERMISSIONS_REQUIRED');
  }
  return file;
}
export async function reconcileC1Readonly(checkpoint, client) {
  const before = readFileSync(checkpoint), state = unsealC1Checkpoint(before);
  try {
    const view = await client.view();
    // A timeout is never evidence that a request rolled back. Matching rows can prove a commit;
    // an empty read cannot authorize retry, resume or compensation.
    requireStock(!state.pending?.startsWith('PROBE_') && state.probes.every(probe => probe.status === 'DENIED'), 'C1_UNSETTLED_PROBE_REQUIRES_REVIEW');
    const stages = state.pending === 'MOVEMENT' ? [state.confirmed + 1] : [state.confirmed];
    let proof;
    for (const stage of stages) for (const audits of [...new Set([stage, Math.max(0, stage - 1)])]) {
      try { proof = verifyC1View(state, view, stage, audits); } catch { /* only fixed failure below */ }
      if (proof) break;
    }
    requireStock(proof, 'C1_UNKNOWN_RESULT_NOT_PROVEN_NO_RETRY');
    if (state.confirmed === 0 && state.pending === null && state.operations.length === 0) {
      // A preserved baseline before the first stock request is not a partial or
      // restored cycle. Historical denied probes must never be executed again.
      const checks = { ...state.checks, checkpoint_integrity: 'PASS' };
      for (const name of ['ui_adjustment', 'ui_transfer', 'ui_reverse_transfer', 'persist_reload', 'ui_history',
        'unique_movements', 'audit_history', 'stock_restored', 'cost_restored']) checks[name] = 'BLOCKED';
      const probesConfirmed = state.probes.length === 2 && state.probes.every((probe, index) =>
        probe.actor === ['B', 'anon'][index] && probe.status === 'DENIED');
      return { scope: 'C1_READONLY_RECOVERY', status: 'PASS',
        code: 'C1_BASELINE_CONFIRMED_NO_STOCK_OPERATIONS_NOT_FULL_HOMOLOGATION', checks,
        restored: false, restoration_performed: false, baseline_unchanged: true, stock_and_cost_unchanged: true,
        original_negative_probes_confirmed: probesConfirmed,
        historical_negative_requests: state.probes.length, historical_stock_requests: 0, historical_audit_requests: 0,
        reconciliation: { stage: proof.stage, movement_rows: proof.movement_rows, audit_rows_added: proof.audit_rows_added,
          positions: proof.positions, baseline_unchanged: true },
        stock_requests_forwarded: 0, audit_requests_forwarded: 0, negative_requests_forwarded: 0,
        recovery_checkpoint_unchanged: true, recovery_checkpoint_sha256: digest(before), full_homologation: false };
    }
    return { scope: 'C1_READONLY_RECOVERY', status: 'PASS', code: proof.stock_restored ? 'C1_RESTORED_READONLY_NOT_FULL_HOMOLOGATION' : 'C1_PARTIAL_CYCLE_CONFIRMED_READONLY_NO_RESUME',
      checks: { ...state.checks, unique_movements: 'PASS', audit_history: proof.audit_rows_added === proof.stage ? 'PASS' : 'BLOCKED',
        stock_restored: proof.stock_restored ? 'PASS' : 'BLOCKED', cost_restored: proof.stock_restored ? 'PASS' : 'BLOCKED', checkpoint_integrity: 'PASS' },
      restored: proof.stock_restored, reconciliation: proof, stock_requests_forwarded: 0, audit_requests_forwarded: 0,
      recovery_checkpoint_unchanged: true, recovery_checkpoint_sha256: digest(before), full_homologation: false };
  } finally { requireStock(readFileSync(checkpoint).equals(before), 'C1_RECOVERY_CHECKPOINT_CHANGED'); }
}

export async function stockJourney(env = process.env, args = process.argv.slice(2), fetchImpl = fetch) {
  const report = { scope: 'C1_REAL_TEST_STOCK', status: 'BLOCKED', code: 'NOT_STARTED',
    checks: Object.fromEntries(C1_CHECKS.map(c => [c, 'BLOCKED'])), restored: false, stock_requests_forwarded: 0,
    audit_requests_forwarded: 0, negative_requests_forwarded: 0, history_rows_deleted: 0, fixtures_created: 0, full_homologation: false };
  let mode, config, client, state, checkpoint, browser, runtime, routeFailure, lockFd, lockFile;
  let executionStage = 'CONFIGURATION';
  const stage = value => { executionStage = sanitizeC1ExecutionStage(value) || 'CONFIGURATION'; };
  let stopped = false;
  const stop = () => { stopped = true; };
  const save = phase => {
    requireStock(mode === 'execute', 'C1_READONLY_CHECKPOINT_WRITE_FORBIDDEN');
    state.phase = phase;
    const next = checkpoint + '.next';
    const fd = openSync(next, 'wx', 0o600);
    try { writeFileSync(fd, sealC1Checkpoint(state)); fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(next, checkpoint);
  };
  const pass = name => { report.checks[name] = 'PASS'; if (state) state.checks[name] = 'PASS'; };
  const windowGate = () => {
    requireStock(!stopped, 'C1_INTERRUPTED_RECOVERY_REQUIRED'); const window = c1Window(env);
    requireStock(!state || (state.window.at === window.at && state.window.until === window.until), 'C1_WINDOW_CHANGED_REQUIRES_REVIEW');
  };
  try {
    mode = c1Mode(args);
    if (mode === 'execute') c1Window(env);
    config = stockConfiguration(env); c1Scope(config); stage('GIT');
    requireStock(git('branch', '--show-current') === 'automation/nexalvo-qa-actions' && !git('status', '--porcelain'), 'C1_CLEAN_QA_REQUIRED');
    requireStock(/^[0-9a-f]{40}$/.test(env.QA_STOCK_VALIDATED_CODE_SHA || ''), 'C1_VALIDATED_SHA_REQUIRED');
    git('merge-base', '--is-ancestor', env.QA_STOCK_VALIDATED_CODE_SHA, 'HEAD');
    requireStock(git('diff', '--name-only', `${env.QA_STOCK_VALIDATED_CODE_SHA}..HEAD`).split('\n').every(p => !p || p.startsWith('docs/')), 'C1_UNVALIDATED_CODE');
    report.source_sha = git('rev-parse', 'HEAD');
    stage('CATALOG'); let catalog;
    try { catalog = validateStockCatalog(JSON.parse(readFileSync(env.QA_STOCK_CATALOG_FILE, 'utf8'))); }
    catch (error) { throw error instanceof StockSignal ? error : new StockSignal('C1_CATALOG_REQUIRED'); }
    c1Precision(catalog); c1AuditContract(catalog); pass('catalog'); report.catalog_sha256 = stockHash(catalog);
    // Persistent mode needs a private local single-process lock AND the independent operational window.
    stage('PRIVATE_CHECKPOINT');
    if (mode === 'execute') {
      checkpoint = privateC1Path(env);
      lockFile = join(tmpdir(), 'nexalvo-stock-c1-execution.lock');
      try { lockFd = openSync(lockFile, 'wx', 0o600); } catch { throw new StockSignal('C1_LOCAL_EXECUTION_LOCKED'); }
      for (const dir of readdirSync(tmpdir(), { withFileTypes: true }).filter(d => d.isDirectory() && d.name.startsWith('nexalvo-stock-c1-'))) {
        const previous = join(tmpdir(), dir.name, 'stock-recovery.json');
        requireStock(!existsSync(previous), 'C1_PREVIOUS_CHECKPOINT_REQUIRES_REVIEW_NO_REPLAY');
      }
      requireStock(!existsSync(checkpoint), 'C1_CHECKPOINT_ALREADY_EXISTS');
    } else if (mode === 'recovery') checkpoint = privateC1Path(env, args[1]);
    stage('AUTHENTICATION');
    client = await openC1Client(config, env, fetchImpl); pass('owner_a_b'); pass('permissions');
    stage('READ_ISOLATION');
    await client.isolation(); pass('read_isolation');
    stage('BASELINE_READ');
    if (mode === 'recovery') return { ...report, ...await reconcileC1Readonly(checkpoint, client) };
    const initial = await client.view(), { audit, ...fixture } = initial;
    c1Fixture(fixture); pass('exclusive_fixture');
    if (mode === 'preflight') return { ...report, scope: 'C1_READONLY_PREFLIGHT', status: 'PASS', code: 'C1_READ_GATES_PASS_WINDOW_AND_EXECUTION_NOT_PROVEN', persistent_authorized: false };
    stage('EXCLUSIVE_WINDOW'); windowGate(); pass('exclusive_window');
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    // Readiness has no Auth/stock calls and must pass BEFORE the checkpoint and
    // negative probes. Do not leave a probe checkpoint for a missing browser.
    runtime = await prepareC1Runtime({ env, config, onStage: stage });
    browser = runtime.browser;
    report.runtime_readiness = { local_server_verified: runtime.proof.local_server_verified === true,
      browser_launched: runtime.proof.browser_launched === true, port: 4189 };
    stage('EXCLUSIVE_WINDOW'); windowGate();
    stage('SNAPSHOT');
    state = makeC1State(fixture, audit, report.source_sha, report.catalog_sha256, c1Window(env));
    state.checks = { ...report.checks };
    const fd = openSync(checkpoint, 'wx', 0o600); closeSync(fd);
    pass('snapshot'); save('SNAPSHOT');
    await delay(1000); verifyC1View(state, await client.view(), 0);
    for (const actor of ['B', 'anon']) {
      stage('EXCLUSIVE_WINDOW'); windowGate(); stage('NEGATIVE_PROBES'); verifyC1View(state, await client.view(), 0);
      state.pending = 'PROBE_' + actor; state.probes.push({ actor, status: 'DISPATCHED' }); save('NEGATIVE_PROBE_PENDING');
      windowGate(); report.negative_requests_forwarded++;
      await client.negativeProbe(actor, state);
      verifyC1View(state, await client.view(), 0);
      state.probes.at(-1).status = 'DENIED'; state.pending = null; save('NEGATIVE_PROBE_DENIED');
    }
    pass('write_isolation'); save('PROBES_CONFIRMED');
    stage('BROWSER_CONTEXT');
    const context = await browser.newContext({ serviceWorkers: 'block' }); context.setDefaultTimeout(15000);
    stage('BROWSER_SESSION');
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('nexalvo.ui.language.v1', 'en');
      localStorage.setItem('nexalvo.supabase.session.v1', JSON.stringify({ accessToken: token, expiresAt: Date.now() + 1800000, user }));
    }, client.browserSession());
    stage('BROWSER_GUARD');
    await context.route('**/*', createC1BrowserGuard({ local: LOCAL, state, readView: () => client.view(), save,
      windowGate, counters: report, authorizedToken: client.browserSession().token,
      onFailure: failure => { routeFailure ||= failure; } }));
    stage('BROWSER_CONTEXT'); const page = await context.newPage();
    const inventory = async () => {
      stage('INVENTORY_OPEN');
      await page.getByText('Inventory', { exact: true }).first().click();
      await page.locator(`[data-inventory-item-id="${C1_FIXTURE.item}"]`).waitFor();
    };
    const fixtureRow = () => page.locator(`[data-inventory-item-id="${C1_FIXTURE.item}"]`);
    const checkUi = async reconciliationStage => {
      stage('UI_RELOAD');
      await page.reload({ waitUntil: 'domcontentloaded' }); await inventory();
      stage('UI_RELOAD');
      await fixtureRow().getByRole('button', { name: 'Adjust', exact: true }).click();
      const dialog = page.getByRole('dialog');
      for (const [id, qty] of [[C1_FIXTURE.source, [2, 2.125, 1.625, 2.125, 2][reconciliationStage]], [C1_FIXTURE.target, [2, 2, 2.5, 2, 2][reconciliationStage]]]) {
        await dialog.getByText('Location', { exact: true }).locator('..').locator('select').selectOption(id);
        requireStock(Number(await dialog.locator('input[type=number]').inputValue()) === qty, 'C1_UI_RELOAD_BALANCE_MISMATCH');
      }
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      verifyC1View(state, await client.view(), reconciliationStage);
    };
    stage('PAGE_OPEN'); await page.goto(LOCAL, { waitUntil: 'domcontentloaded', timeout: 15000 }); await inventory();
    for (let i = 0; i < 4; i++) {
      stage('EXCLUSIVE_WINDOW'); windowGate(); const step = c1Plan(state)[i];
      stage(step.rpc === 'fn_adjust_inventory_count' ? 'UI_ADJUSTMENT_FORM' : 'UI_TRANSFER_FORM');
      await fixtureRow().getByRole('button', { name: step.rpc === 'fn_adjust_inventory_count' ? 'Adjust' : 'Transfer', exact: true }).click();
      const dialog = page.getByRole('dialog');
      if (step.rpc === 'fn_adjust_inventory_count') {
        await dialog.getByText('Location', { exact: true }).locator('..').locator('select').selectOption(C1_FIXTURE.source);
        await dialog.locator('input[type=number]').fill(String(step.payload.p_new_qty));
      } else {
        await dialog.getByText('From Location', { exact: true }).locator('..').locator('select').selectOption(step.payload.p_from_location_id);
        await dialog.getByText('To Location', { exact: true }).locator('..').locator('select').selectOption(step.payload.p_to_location_id);
        await dialog.locator('input[type=number]').fill('0.5');
      }
      await dialog.locator('textarea').fill(step.payload.p_notes);
      stage('UI_SUBMIT');
      await dialog.getByRole('button', { name: step.rpc === 'fn_adjust_inventory_count' ? 'Save' : 'Transfer Stock', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      if (routeFailure) throw routeFailure;
      requireStock(state.confirmed === i + 1 && !state.pending && state.operations[i].auditRow, 'C1_UI_OPERATION_NOT_CONFIRMED');
      if (i < 3) pass(['ui_adjustment', 'ui_transfer', 'ui_reverse_transfer'][i]);
      save('UI_CONFIRMED'); await checkUi(i + 1);
    }
    pass('persist_reload');
    stage('UI_HISTORY'); await fixtureRow().getByRole('button', { name: 'History', exact: true }).click();
    const history = page.getByRole('dialog'); await history.getByText('Recent Stock Movements', { exact: true }).waitFor();
    for (const step of c1Plan(state)) await history.getByText(step.payload.p_notes, { exact: false }).first().waitFor();
    pass('ui_history'); await runtime.close(); browser = null;
    stage('FINAL_RECONCILIATION'); const proof = verifyC1View(state, await client.view(), 4);
    report.reconciliation = proof;
    for (const check of ['unique_movements', 'audit_history', 'stock_restored', 'cost_restored', 'checkpoint_integrity']) pass(check);
    save('RESTORED');
    requireStock(readFileSync(checkpoint).toString('utf8') === sealC1Checkpoint(state), 'C1_FINAL_CHECKPOINT_MISMATCH');
    report.status = 'PASS'; report.code = 'C1_REAL_UI_CYCLE_RESTORED'; report.restored = true;
    report.full_homologation = C1_CHECKS.every(c => report.checks[c] === 'PASS');
    report.checkpoint_sha256 = digest(readFileSync(checkpoint));
  } catch (error) {
    const uiCodes = { BROWSER_CONTEXT: 'C1_BROWSER_CONTEXT_FAILED', BROWSER_SESSION: 'C1_BROWSER_SESSION_FAILED',
      BROWSER_GUARD: 'C1_BROWSER_GUARD_FAILED', PAGE_OPEN: 'C1_LOCAL_PAGE_UNAVAILABLE', INVENTORY_OPEN: 'C1_INVENTORY_UI_UNAVAILABLE',
      UI_ADJUSTMENT_FORM: 'C1_ADJUSTMENT_FORM_UNAVAILABLE', UI_TRANSFER_FORM: 'C1_TRANSFER_FORM_UNAVAILABLE',
      UI_SUBMIT: 'C1_UI_SUBMISSION_UNCONFIRMED', UI_RELOAD: 'C1_UI_RELOAD_UNCONFIRMED', UI_HISTORY: 'C1_UI_HISTORY_UNAVAILABLE' };
    report.code = routeFailure?.code || (error instanceof StockSignal ? error.code : uiCodes[executionStage] || 'C1_EXECUTION_UNCONFIRMED');
    report.blocked_stage = sanitizeC1ExecutionStage(executionStage);
    const diagnostic = sanitizeC1Diagnostic(routeFailure?.diagnostic || (error instanceof StockSignal ? error.diagnostic : null));
    if (diagnostic) report.diagnostic = diagnostic;
    const reason = { BROWSER_CONTEXT: 'BROWSER_CONTEXT_REJECTED', BROWSER_SESSION: 'BROWSER_SESSION_REJECTED',
      BROWSER_GUARD: 'BROWSER_ROUTE_REJECTED' }[executionStage] || 'LOCAL_UI_UNCONFIRMED';
    const runtimeDiagnostic = sanitizeC1RuntimeDiagnostic(routeFailure?.runtimeDiagnostic
      || (error instanceof StockSignal ? error.runtimeDiagnostic : null)
      || (!diagnostic && uiCodes[executionStage] ? { stage: executionStage, reason, port: 4189, exit_code: null } : null));
    if (runtimeDiagnostic) { report.runtime_diagnostic = runtimeDiagnostic; report.blocked_stage = runtimeDiagnostic.stage; }
    if (state?.pending) report.code = 'C1_PENDING_RESULT_READONLY_RECOVERY_REQUIRED';
    report.recovery_checkpoint_retained = !!checkpoint && existsSync(checkpoint);
    // No automatic compensation, restart or retry after any failure. This includes UI/timeout failures.
  } finally {
    try { await runtime?.close(); } catch { /* close only our own child; never print paths or raw exceptions */ }
    await client?.close();
    if (lockFd !== undefined) { closeSync(lockFd); try { unlinkSync(lockFile); } catch { /* stale lock blocks the next run */ } }
    if (mode === 'execute' && checkpoint && existsSync(checkpoint)) {
      try { report.checkpoint_sha256 = digest(readFileSync(checkpoint)); } catch { report.code = 'C1_CHECKPOINT_UNREADABLE'; report.status = 'BLOCKED'; }
    }
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
  }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await stockJourney(); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.status === 'PASS' ? 0 : 2;
}
