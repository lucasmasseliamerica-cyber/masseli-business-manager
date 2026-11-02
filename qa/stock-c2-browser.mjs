// One guarded UI loss plus its separate audit; all other business writes are forbidden.
import { STOCK_HOST } from './stock-journey-core.mjs';
import { C2, need, same, wastePayload, auditPayload, reconcileC2 } from './stock-c2-protocol.mjs';
const LOCAL = 'http://127.0.0.1:4191';
export function createC2Guard({ state, save, gate, view, token, report, onFailure }) {
  let busy = false, failed = false;
  return async route => {
    const req = route.request(), url = new URL(req.url()); let owns = false;
    try {
      if (url.origin === LOCAL) { need(['GET', 'HEAD'].includes(req.method()), 'LOCAL_WRITE_FORBIDDEN'); return await route.continue(); }
      if (url.origin !== `https://${STOCK_HOST}` && !url.hostname.endsWith('.supabase.co') && ['GET', 'HEAD'].includes(req.method())) return await route.abort();
      need(url.origin === `https://${STOCK_HOST}` && !url.username && !url.password && !url.hash, 'BROWSER_TEST_TARGET_REQUIRED');
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return await route.continue();
      need(!url.search, 'WRITE_QUERY_FORBIDDEN');
      if (url.pathname === '/rest/v1/rpc/fn_reconcile_business_alerts') return await route.abort();
      // Exact source/attributes of this read-only POST are pinned by the security catalog.
      if (url.pathname === '/rest/v1/rpc/fn_session_access_status' && req.method() === 'POST'
        && same(req.postDataJSON() || {}, {})) return await route.continue();
      need(req.method() === 'POST' && req.headers().authorization === `Bearer ${token}` && !busy && !failed, 'OVERLAP_OR_SESSION_REJECTED');
      busy = true; owns = true; gate();
      const loss = url.pathname === '/rest/v1/rpc/fn_record_waste';
      const audit = url.pathname === '/rest/v1/rpc/fn_write_audit';
      need(loss || audit, 'WRITE_OUTSIDE_BUDGET');
      need(same(req.postDataJSON(), loss ? wastePayload() : auditPayload()), 'PAYLOAD_OUTSIDE_SCOPE');
      need(state.phase === (loss ? 'RESERVED' : 'LOSS_CONFIRMED'), 'REPLAY_FORBIDDEN');
      const before = await view();
      reconcileC2(state.baseline, before, loss ? 0 : 1, 0, state.startedAt);
      if (audit) need(same(state.lossReceipt, before.waste[0]) && same(state.movementReceipt, before.transactions[0]), 'CONFIRMED_RECEIPTS_CHANGED');
      gate(); need(!failed, 'CONCURRENT_FAILURE');
      state.phase = loss ? 'LOSS_INTENT' : 'AUDIT_INTENT';
      if (loss) state.intentAt = Date.now();
      save(); // file fsync + readback precedes *any* forwarding
      gate(); need(!failed, 'CONCURRENT_FAILURE');
      const counter = loss ? 'stock_requests_forwarded' : 'audit_requests_forwarded';
      need(report[counter] === 0, 'BUDGET_EXCEEDED'); report[counter]++;
      const response = await route.fetch({ maxRetries: 0, maxRedirects: 0, timeout: 20000 });
      need(response.ok(), 'RESULT_UNCONFIRMED_NO_REPLAY');
      const receipt = await response.json(), observed = await view();
      reconcileC2(state.baseline, observed, 1, loss ? 0 : 1, state.intentAt);
      const row = loss ? observed.waste[0] : observed.audit[0];
      need(receipt?.id === row.id, 'RECEIPT_MISMATCH');
      state[loss ? 'lossReceipt' : 'auditReceipt'] = row;
      if (loss) state.movementReceipt = observed.transactions[0];
      state.phase = loss ? 'LOSS_CONFIRMED' : 'AUDIT_CONFIRMED'; save(); gate();
      return await route.fulfill({ response });
    } catch { failed = true; onFailure(); try { await route.abort(); } catch { /* preserve journal, no retry */ } }
    finally { if (owns) busy = false; }
  };
}
export async function runC2Browser({ runtime, client, state, save, gate, report }) {
  let context, failure = false;
  const healthy = () => need(!failure, 'BROWSER_RESULT_UNCONFIRMED');
  try {
    const session = client.browserSession();
    context = await runtime.browser.newContext({ serviceWorkers: 'block' }); context.setDefaultTimeout(15000);
    await context.addInitScript(({ token, user }) => {
      localStorage.setItem('nexalvo.ui.language.v1', 'en');
      localStorage.setItem('nexalvo.supabase.session.v1', JSON.stringify({ accessToken: token, expiresAt: Date.now() + 1200000, user }));
    }, session);
    await context.route('**/*', createC2Guard({ state, save, gate, view: () => client.view(), token: session.token, report,
      onFailure: () => { failure = true; } }));
    const page = await context.newPage();
    const row = () => page.locator(`[data-inventory-item-id="${C2.item}"]`);
    const inventory = async () => { await page.getByText('Inventory', { exact: true }).first().click(); await row().waitFor(); healthy(); };
    await page.goto(LOCAL, { waitUntil: 'domcontentloaded' }); await inventory(); gate();
    await row().getByRole('button', { name: 'Waste', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Location', { exact: true }).locator('..').locator('select').selectOption(C2.location);
    await dialog.locator('input[type=number]').fill('0.125');
    await dialog.getByText('Reason', { exact: true }).locator('..').locator('select').selectOption('Other');
    await dialog.locator('textarea').fill(C2.note); healthy(); gate();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' }); healthy(); need(state.phase === 'AUDIT_CONFIRMED', 'AUDIT_REQUIRED_DESPITE_UI_SUCCESS');
    await page.reload({ waitUntil: 'domcontentloaded' }); await inventory();
    await row().getByRole('button', { name: 'Adjust', exact: true }).click();
    await dialog.getByText('Location', { exact: true }).locator('..').locator('select').selectOption(C2.location);
    need(Number(await dialog.locator('input[type=number]').inputValue()) === 1.875, 'UI_RELOAD_QTY_MISMATCH');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await row().getByRole('button', { name: 'History', exact: true }).click();
    await dialog.getByText('Recent Stock Movements', { exact: true }).waitFor();
    await dialog.getByText('Reason: Other', { exact: false }).first().waitFor(); healthy();
    report.ui_cycle = 'PASS'; report.persist_reload = 'PASS'; report.ui_history = 'PASS';
  } finally { await context?.close(); }
}
