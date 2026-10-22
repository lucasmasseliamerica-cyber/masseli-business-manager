// Opt-in C1 only. Ordinary CI parses/tests this file but never executes TEST stock writes.
import { execFileSync, spawn } from 'node:child_process';
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
    requireStock(!state.pending?.startsWith('PROBE_'), 'C1_UNSETTLED_PROBE_REQUIRES_REVIEW');
    const stages = state.pending === 'MOVEMENT' ? [state.confirmed + 1] : [state.confirmed];
    let proof;
    for (const stage of stages) for (const audits of [...new Set([stage, Math.max(0, stage - 1)])]) {
      try { proof = verifyC1View(state, view, stage, audits); } catch { /* only fixed failure below */ }
      if (proof) break;
    }
    requireStock(proof, 'C1_UNKNOWN_RESULT_NOT_PROVEN_NO_RETRY');
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
  let mode, config, client, state, checkpoint, browser, server, routeFailure, lockFd, lockFile;
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
    config = stockConfiguration(env); c1Scope(config);
    requireStock(git('branch', '--show-current') === 'automation/nexalvo-qa-actions' && !git('status', '--porcelain'), 'C1_CLEAN_QA_REQUIRED');
    requireStock(/^[0-9a-f]{40}$/.test(env.QA_STOCK_VALIDATED_CODE_SHA || ''), 'C1_VALIDATED_SHA_REQUIRED');
    git('merge-base', '--is-ancestor', env.QA_STOCK_VALIDATED_CODE_SHA, 'HEAD');
    requireStock(git('diff', '--name-only', `${env.QA_STOCK_VALIDATED_CODE_SHA}..HEAD`).split('\n').every(p => !p || p.startsWith('docs/')), 'C1_UNVALIDATED_CODE');
    report.source_sha = git('rev-parse', 'HEAD');
    let catalog;
    try { catalog = validateStockCatalog(JSON.parse(readFileSync(env.QA_STOCK_CATALOG_FILE, 'utf8'))); }
    catch (error) { throw error instanceof StockSignal ? error : new StockSignal('C1_CATALOG_REQUIRED'); }
    c1Precision(catalog); c1AuditContract(catalog); pass('catalog'); report.catalog_sha256 = stockHash(catalog);
    // Persistent mode needs a private local single-process lock AND the independent operational window.
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
    client = await openC1Client(config, env, fetchImpl); pass('owner_a_b'); pass('permissions');
    await client.isolation(); pass('read_isolation');
    if (mode === 'recovery') return { ...report, ...await reconcileC1Readonly(checkpoint, client) };
    const initial = await client.view(), { audit, ...fixture } = initial;
    c1Fixture(fixture); pass('exclusive_fixture');
    if (mode === 'preflight') return { ...report, scope: 'C1_READONLY_PREFLIGHT', status: 'PASS', code: 'C1_READ_GATES_PASS_WINDOW_AND_EXECUTION_NOT_PROVEN', persistent_authorized: false };
    windowGate(); pass('exclusive_window');
    state = makeC1State(fixture, audit, report.source_sha, report.catalog_sha256, c1Window(env));
    state.checks = { ...report.checks };
    const fd = openSync(checkpoint, 'wx', 0o600); closeSync(fd);
    pass('snapshot'); save('SNAPSHOT');
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    await delay(1000); verifyC1View(state, await client.view(), 0);
    for (const actor of ['B', 'anon']) {
      windowGate(); verifyC1View(state, await client.view(), 0);
      state.pending = 'PROBE_' + actor; state.probes.push({ actor, status: 'DISPATCHED' }); save('NEGATIVE_PROBE_PENDING');
      windowGate(); report.negative_requests_forwarded++;
      await client.negativeProbe(actor, state);
      verifyC1View(state, await client.view(), 0);
      state.probes.at(-1).status = 'DENIED'; state.pending = null; save('NEGATIVE_PROBE_DENIED');
    }
    pass('write_isolation'); save('PROBES_CONFIRMED');
    const { chromium } = await import('playwright');
    requireStock(!await fetchImpl(LOCAL, { signal: AbortSignal.timeout(1000) }).then(() => true).catch(() => false), 'C1_LOCAL_PORT_IN_USE');
    const childEnv = Object.fromEntries(['PATH', 'SystemRoot', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'WINDIR'].filter(n => env[n]).map(n => [n, env[n]]));
    Object.assign(childEnv, { VITE_SUPABASE_URL: config.origin, VITE_SUPABASE_ANON_KEY: config.key });
    server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4189', '--strictPort'], { env: childEnv, stdio: 'ignore' });
    let ready = false;
    for (let i = 0; i < 40; i++) { if (await fetchImpl(LOCAL).then(r => r.ok).catch(() => false)) { ready = true; break; } await delay(250); }
    requireStock(ready, 'C1_LOCAL_SERVER_UNAVAILABLE');
    browser = await chromium.launch({ headless: true, ...(env.NEXALVO_QA_CHROMIUM_PATH ? { executablePath: env.NEXALVO_QA_CHROMIUM_PATH } : {}) });
    const context = await browser.newContext({ serviceWorkers: 'block' }); context.setDefaultTimeout(15000);
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('nexalvo.ui.language.v1', 'en');
      localStorage.setItem('nexalvo.supabase.session.v1', JSON.stringify({ accessToken: token, expiresAt: Date.now() + 1800000, user }));
    }, client.browserSession());
    await context.route('**/*', createC1BrowserGuard({ local: LOCAL, state, readView: () => client.view(), save,
      windowGate, counters: report, authorizedToken: client.browserSession().token,
      onFailure: failure => { routeFailure ||= failure; } }));
    const page = await context.newPage();
    const inventory = async () => {
      await page.getByText('Inventory', { exact: true }).first().click();
      await page.locator(`[data-inventory-item-id="${C1_FIXTURE.item}"]`).waitFor();
    };
    const fixtureRow = () => page.locator(`[data-inventory-item-id="${C1_FIXTURE.item}"]`);
    const checkUi = async stage => {
      await page.reload({ waitUntil: 'domcontentloaded' }); await inventory();
      await fixtureRow().getByRole('button', { name: 'Adjust', exact: true }).click();
      const dialog = page.getByRole('dialog');
      for (const [id, qty] of [[C1_FIXTURE.source, [2, 2.125, 1.625, 2.125, 2][stage]], [C1_FIXTURE.target, [2, 2, 2.5, 2, 2][stage]]]) {
        await dialog.getByText('Location', { exact: true }).locator('..').locator('select').selectOption(id);
        requireStock(Number(await dialog.locator('input[type=number]').inputValue()) === qty, 'C1_UI_RELOAD_BALANCE_MISMATCH');
      }
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      verifyC1View(state, await client.view(), stage);
    };
    await page.goto(LOCAL, { waitUntil: 'domcontentloaded' }); await inventory();
    for (let i = 0; i < 4; i++) {
      windowGate(); const step = c1Plan(state)[i];
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
      await dialog.getByRole('button', { name: step.rpc === 'fn_adjust_inventory_count' ? 'Save' : 'Transfer Stock', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      if (routeFailure) throw routeFailure;
      requireStock(state.confirmed === i + 1 && !state.pending && state.operations[i].auditRow, 'C1_UI_OPERATION_NOT_CONFIRMED');
      if (i < 3) pass(['ui_adjustment', 'ui_transfer', 'ui_reverse_transfer'][i]);
      save('UI_CONFIRMED'); await checkUi(i + 1);
    }
    pass('persist_reload');
    await fixtureRow().getByRole('button', { name: 'History', exact: true }).click();
    const history = page.getByRole('dialog'); await history.getByText('Recent Stock Movements', { exact: true }).waitFor();
    for (const step of c1Plan(state)) await history.getByText(step.payload.p_notes, { exact: false }).first().waitFor();
    pass('ui_history'); await browser.close(); browser = null;
    const proof = verifyC1View(state, await client.view(), 4);
    report.reconciliation = proof;
    for (const check of ['unique_movements', 'audit_history', 'stock_restored', 'cost_restored', 'checkpoint_integrity']) pass(check);
    save('RESTORED');
    requireStock(readFileSync(checkpoint).toString('utf8') === sealC1Checkpoint(state), 'C1_FINAL_CHECKPOINT_MISMATCH');
    report.status = 'PASS'; report.code = 'C1_REAL_UI_CYCLE_RESTORED'; report.restored = true;
    report.full_homologation = C1_CHECKS.every(c => report.checks[c] === 'PASS');
    report.checkpoint_sha256 = digest(readFileSync(checkpoint));
  } catch (error) {
    report.code = routeFailure?.code || (error instanceof StockSignal ? error.code : 'C1_EXECUTION_UNCONFIRMED');
    if (state?.pending) report.code = 'C1_PENDING_RESULT_READONLY_RECOVERY_REQUIRED';
    report.recovery_checkpoint_retained = !!checkpoint && existsSync(checkpoint);
    // No automatic compensation, restart or retry after any failure. This includes UI/timeout failures.
  } finally {
    try { await browser?.close(); } catch { /* no raw exceptions */ }
    try { if (server) server.kill(); } catch { /* no stock writes during cleanup */ }
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
