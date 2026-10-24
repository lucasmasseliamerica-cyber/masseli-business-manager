// Dedicated child UI driver. Admission, authorization and durable child ownership belong to its caller.
// Reuses the bounded transport guard; never probes, retries, compensates or opens a parent checkpoint.
import { StockSignal, STOCK_ACTORS, requireStock } from './stock-journey-core.mjs';
import { C1_FIXTURE, C1_CHECKS, c1Plan, validateC1State, verifyC1View } from './stock-c1-protocol.mjs';
import { createC1BrowserGuard } from './stock-c1-browser-guard.mjs';
import { sanitizeC1ExecutionStage, sanitizeC1RuntimeDiagnostic } from './stock-c1-diagnostics.mjs';

const LOCAL = 'http://127.0.0.1:4189';
const uiCodes = Object.freeze({ BROWSER_CONTEXT: 'C1_CHILD_BROWSER_CONTEXT_FAILED', BROWSER_SESSION: 'C1_CHILD_BROWSER_SESSION_FAILED',
  BROWSER_GUARD: 'C1_CHILD_BROWSER_GUARD_FAILED', PAGE_OPEN: 'C1_CHILD_PAGE_UNAVAILABLE', INVENTORY_OPEN: 'C1_CHILD_INVENTORY_UNAVAILABLE',
  UI_ADJUSTMENT_FORM: 'C1_CHILD_ADJUSTMENT_FORM_UNAVAILABLE', UI_TRANSFER_FORM: 'C1_CHILD_TRANSFER_FORM_UNAVAILABLE',
  UI_SUBMIT: 'C1_CHILD_UI_SUBMISSION_UNCONFIRMED', UI_RELOAD: 'C1_CHILD_UI_RELOAD_UNCONFIRMED', UI_HISTORY: 'C1_CHILD_UI_HISTORY_UNAVAILABLE' });

export async function runC1ChildBrowserCycle({ runtime, client, state, save, windowGate, report, onStage = () => {} }) {
  let context, routeFailure, stage = 'BROWSER_CONTEXT';
  const mark = value => { stage = sanitizeC1ExecutionStage(value) || 'BROWSER_CONTEXT'; onStage(stage); };
  const pass = name => { report.checks[name] = 'PASS'; state.checks[name] = 'PASS'; };
  const budget = () => requireStock(report.stock_requests_forwarded <= 4 && report.audit_requests_forwarded <= 4
    && report.negative_requests_forwarded === 0, 'C1_CHILD_REQUEST_BUDGET_EXCEEDED');
  const healthy = () => { if (routeFailure) throw routeFailure; budget(); };
  try {
    requireStock(typeof save === 'function' && typeof windowGate === 'function' && runtime?.browser
      && typeof client?.view === 'function' && typeof client.browserSession === 'function'
      && report?.checks && C1_CHECKS.every(name => ['PASS', 'BLOCKED'].includes(report.checks[name])), 'C1_CHILD_BROWSER_ADMISSION_REQUIRED');
    validateC1State(state);
    requireStock(state.confirmed === 0 && state.pending === null && state.operations.length === 0
      && state.probes.length === 0
      && report.stock_requests_forwarded === 0 && report.audit_requests_forwarded === 0 && report.negative_requests_forwarded === 0,
    'C1_CHILD_FRESH_BROWSER_STATE_REQUIRED');
    requireStock(C1_CHECKS.slice(0, 8).every(name => state.checks[name] === 'PASS' && report.checks[name] === 'PASS'), 'C1_CHILD_BROWSER_GATES_REQUIRED');
    const session = client.browserSession();
    requireStock(typeof session?.token === 'string' && session.token.length > 0 && session.user?.id === STOCK_ACTORS.A.owner, 'C1_CHILD_BROWSER_OWNER_REQUIRED');
    windowGate(); verifyC1View(state, await client.view(), 0, 0);
    mark('BROWSER_CONTEXT'); context = await runtime.browser.newContext({ serviceWorkers: 'block' }); context.setDefaultTimeout(15000);
    mark('BROWSER_SESSION');
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('nexalvo.ui.language.v1', 'en');
      localStorage.setItem('nexalvo.supabase.session.v1', JSON.stringify({ accessToken: token, expiresAt: Date.now() + 1800000, user }));
    }, session);
    mark('BROWSER_GUARD');
    await context.route('**/*', createC1BrowserGuard({ local: LOCAL, state, readView: () => client.view(), save,
      windowGate: () => { healthy(); windowGate(); }, counters: report, authorizedToken: session.token,
      onFailure: error => { routeFailure ||= error; } }));
    mark('BROWSER_CONTEXT'); const page = await context.newPage();
    const fixtureRow = () => page.locator(`[data-inventory-item-id="${C1_FIXTURE.item}"]`);
    const inventory = async () => {
      healthy(); mark('INVENTORY_OPEN'); await page.getByText('Inventory', { exact: true }).first().click();
      await fixtureRow().waitFor(); healthy();
    };
    const verifyReload = async reconciliationStage => {
      mark('UI_RELOAD'); await page.reload({ waitUntil: 'domcontentloaded' }); await inventory();
      mark('UI_RELOAD'); await fixtureRow().getByRole('button', { name: 'Adjust', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const values = [[2, 2], [2.125, 2], [1.625, 2.5], [2.125, 2], [2, 2]][reconciliationStage];
      for (const [index, id] of [C1_FIXTURE.source, C1_FIXTURE.target].entries()) {
        await dialog.getByText('Location', { exact: true }).locator('..').locator('select').selectOption(id);
        requireStock(Number(await dialog.locator('input[type=number]').inputValue()) === values[index], 'C1_CHILD_UI_RELOAD_BALANCE_MISMATCH');
      }
      await dialog.getByRole('button', { name: 'Close', exact: true }).click(); healthy();
      verifyC1View(state, await client.view(), reconciliationStage);
    };
    mark('PAGE_OPEN'); await page.goto(LOCAL, { waitUntil: 'domcontentloaded', timeout: 15000 }); await inventory();
    for (let index = 0; index < 4; index++) {
      healthy(); windowGate(); const step = c1Plan(state)[index];
      mark(step.rpc === 'fn_adjust_inventory_count' ? 'UI_ADJUSTMENT_FORM' : 'UI_TRANSFER_FORM');
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
      await dialog.locator('textarea').fill(step.payload.p_notes); healthy();
      mark('UI_SUBMIT'); await dialog.getByRole('button', { name: step.rpc === 'fn_adjust_inventory_count' ? 'Save' : 'Transfer Stock', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' }); healthy();
      requireStock(state.confirmed === index + 1 && !state.pending && state.operations[index].auditRow, 'C1_CHILD_UI_OPERATION_NOT_CONFIRMED');
      if (index < 3) pass(['ui_adjustment', 'ui_transfer', 'ui_reverse_transfer'][index]);
      save('UI_CONFIRMED'); await verifyReload(index + 1);
    }
    pass('persist_reload'); mark('UI_HISTORY'); await fixtureRow().getByRole('button', { name: 'History', exact: true }).click();
    const history = page.getByRole('dialog'); await history.getByText('Recent Stock Movements', { exact: true }).waitFor();
    for (const step of c1Plan(state)) await history.getByText(step.payload.p_notes, { exact: false }).first().waitFor();
    healthy(); pass('ui_history'); mark('FINAL_RECONCILIATION');
    const proof = verifyC1View(state, await client.view(), 4, 4);
    requireStock(report.stock_requests_forwarded === 4 && report.audit_requests_forwarded === 4
      && report.negative_requests_forwarded === 0 && proof.movement_rows === 6 && proof.audit_rows_added === 4,
    'C1_CHILD_FINAL_REQUEST_BUDGET_MISMATCH');
    return proof;
  } catch (error) {
    if (routeFailure) throw routeFailure;
    if (error instanceof StockSignal) throw error;
    const sanitized = new StockSignal(uiCodes[stage] || 'C1_CHILD_BROWSER_UNCONFIRMED');
    const reason = { BROWSER_CONTEXT: 'BROWSER_CONTEXT_REJECTED', BROWSER_SESSION: 'BROWSER_SESSION_REJECTED',
      BROWSER_GUARD: 'BROWSER_ROUTE_REJECTED' }[stage] || 'LOCAL_UI_UNCONFIRMED';
    const diagnostic = sanitizeC1RuntimeDiagnostic({ stage, reason, port: 4189, exit_code: null });
    if (diagnostic) sanitized.runtimeDiagnostic = diagnostic;
    throw sanitized;
  } finally {
    if (context) {
      let timer;
      try { await Promise.race([Promise.resolve().then(() => context.close()).catch(() => {}),
        new Promise(resolve => { timer = setTimeout(resolve, 2000); })]); }
      finally { clearTimeout(timer); }
    }
    // Runtime/process cleanup remains owned by the caller even if context shutdown stalled.
  }
}
