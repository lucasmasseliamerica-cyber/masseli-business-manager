import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';

// Actual React and Chromium, synthetic backend only. No login or remote write is forwarded.
const local = 'http://127.0.0.1:4192', host = 'msinksoilkluooxenecy.supabase.co';
for (const language of ['en', 'pt-BR']) test(`SIMULATED HTTP ${language}: Cash Sales excludes opening balance through reload and preserves the stored balanced close`, { timeout: 60000 }, async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.NEXALVO_QA_CHROMIUM_PATH ? { executablePath: process.env.NEXALVO_QA_CHROMIUM_PATH } : {}) });
  const business = randomUUID(), owner = randomUUID(), location = randomUUID(), sale = randomUUID(), register = randomUUID();
  const date = '2026-11-17T17:00:00Z', errors = [], attemptedWrites = [], reads = [];
  const ledger = [
    { id: randomUUID(), type: 'opening_balance', amount: 100, sale_id: sale, related_cash_register_id: randomUUID() },
    { id: randomUUID(), type: 'opening_balance', amount: 10, sale_id: null, related_cash_register_id: register },
    { id: randomUUID(), type: 'income', amount: 45, sale_id: sale, related_cash_register_id: register },
    { id: randomUUID(), type: 'income', amount: 5, category: 'Cash Addition', sale_id: null, related_cash_register_id: register },
  ].map(r => ({ ...r, business_id: business, location_id: location, transaction_date: date, payment_method: 'Cash', status: 'completed' }));
  const tables = {
    users: [{ id: owner, business_id: business, name: 'SYNTHETIC OWNER', role: 'OWNER', active: true, permission_overrides: {} }],
    businesses: [{ id: business, name: 'SYNTHETIC CASH REPORT', currency: 'USD', timezone: 'America/New_York', tax_enabled: false, tax_rate: 0, platform_status: 'ACTIVE' }],
    locations: [{ id: location, business_id: business, name: 'SYNTHETIC LOCATION', active: true }],
    sales: [{ id: sale, business_id: business, location_id: location, order_no: 1, status: 'completed', sale_date: date,
      fulfillment_status: 'Completed', payment_method: 'Cash', subtotal: 45, discount: 0, tax: 0, total: 45 }],
    cash_flow: ledger,
    cash_registers: [{ id: register, business_id: business, location_id: location, opened_at: date, closed_at: date,
      opened_by: owner, closed_by: owner, status: 'closed', opening_cash: 10, expected_cash: 60, actual_cash: 60, difference: 0 }],
  };
  const context = await browser.newContext({ viewport: language === 'pt-BR' ? { width: 390, height: 844 } : { width: 1280, height: 900 }, serviceWorkers: 'block' });
  try {
    await context.addInitScript(({ owner, language }) => {
      localStorage.setItem('nexalvo.ui.language.v1', language);
      localStorage.setItem('nexalvo.supabase.session.v1', JSON.stringify({ accessToken: 'SYNTHETIC_CASH_READONLY', expiresAt: Date.now() + 3600000, user: { id: owner, app_metadata: {} } }));
    }, { owner, language });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === local && ['GET', 'HEAD'].includes(request.method())) return route.continue();
      if (url.hostname !== host) return route.abort();
      const reply = (body, headers = {}) => route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) });
      if (url.pathname === '/auth/v1/user' && request.method() === 'GET') return reply({ id: owner, app_metadata: {} });
      if (['GET', 'HEAD'].includes(request.method())) {
      const name = url.pathname.replace('/rest/v1/', ''); reads.push(name);
        let rows = tables[name] || [];
        for (const [key, value] of url.searchParams) if (value.startsWith('eq.')) rows = rows.filter(r => String(r[key]) === value.slice(3));
        const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || rows.length || 1);
        return reply(rows.slice(offset, offset + limit), { 'content-range': `${rows.length ? `${offset}-${Math.min(offset + limit, rows.length) - 1}` : '*'}/${rows.length}` });
      }
      if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/current_business_id') return reply(business);
      if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/user_can') return reply(true);
      if (request.method() === 'POST' && url.pathname === '/rest/v1/rpc/fn_session_access_status') return reply('ACTIVE');
      attemptedWrites.push(url.pathname); return route.abort();
    });
    const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', () => errors.push('PAGE_ERROR'));
    const reports = language === 'pt-BR' ? 'Relatórios' : 'Reports';
    const rowText = label => page.getByText(label, { exact: true }).locator('..').innerText();
    const inspect = async () => {
      if (language === 'pt-BR') await page.getByRole('button', { name: 'Mais', exact: true }).click();
      await page.getByText(reports, { exact: true }).filter({ visible: true }).first().click();
      await page.getByRole('button', { name: language === 'pt-BR' ? 'Intervalo personalizado' : 'Custom Range', exact: true }).click();
      await page.locator('input[type=date]').nth(0).fill('2026-11-17');
      await page.locator('input[type=date]').nth(1).fill('2026-11-17');
      const label = language === 'pt-BR' ? 'Vendas em dinheiro' : 'Cash Sales';
      await page.getByText(label, { exact: true }).locator('..').getByText(/(?:^|[^0-9])45[.,]00/).waitFor();
      assert.match(await rowText(label), /(?:^|[^0-9])45[.,]00/);
      assert.doesNotMatch(await rowText(label), /145[.,]00/);
      assert.match(await rowText(language === 'pt-BR' ? 'Caixas fechados' : 'Registers Closed'), /1/);
      assert.match(await rowText(language === 'pt-BR' ? 'Fechamentos sem diferença' : 'Balanced Closes'), /1/);
    };
    await page.goto(local, { waitUntil: 'domcontentloaded' }); await inspect();
    await page.reload({ waitUntil: 'domcontentloaded' }); await inspect();
    assert.ok(reads.includes('cash_flow')); assert.ok(reads.includes('cash_registers'));
    assert.ok(attemptedWrites.every(p => p === '/rest/v1/rpc/fn_reconcile_business_alerts'), 'all accessory writes blocked; no business write attempted');
    assert.deepEqual(errors, []); assert.equal(ledger[0].type, 'opening_balance');
    assert.equal(tables.cash_registers[0].actual_cash, 60); assert.equal(tables.cash_registers[0].difference, 0);
    assert.equal(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth + 1), true);
  } finally { await context.close(); await browser.close(); }
});
