import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';

// SIMULATED HTTP only: the actual React/Vite application runs, but all Supabase requests are
// intercepted. No test session or mutation can reach any remote database or payment processor.
const local = 'http://127.0.0.1:4179';
const host = 'msinksoilkluooxenecy.supabase.co';
let browser;
before(async () => {
  browser = await chromium.launch({ headless: true, ...(process.env.NEXALVO_QA_CHROMIUM_PATH ? { executablePath: process.env.NEXALVO_QA_CHROMIUM_PATH } : {}) });
});
after(async () => { await browser?.close(); });

async function isolated({ loseSaleResponse = false, mobile = false, language = 'en' } = {}) {
  const business = '11111111-1111-4111-8111-111111111111';
  const owner = '22222222-2222-4222-8222-222222222222';
  const location = '33333333-3333-4333-8333-333333333333';
  const product = '44444444-4444-4444-8444-444444444444';
  const item = '55555555-5555-4555-8555-555555555555';
  const now = new Date().toISOString();
  const state = { sales: [], saleItems: [], customers: [], stock: 100, saleAttempts: [], blocked: [], remoteRequests: 0 };
  const tables = {
    users: [{ id: owner, business_id: business, name: 'OWNER LOCAL SIMULADO', role: 'OWNER', active: true, permission_overrides: {} }],
    businesses: [{ id: business, name: 'MASSELI QA HTTP SIMULADO', currency: 'BRL', timezone: 'America/Sao_Paulo', tax_enabled: false, tax_rate: 0, status: 'ACTIVE' }],
    locations: [{ id: location, business_id: business, name: 'Unidade simulada', active: true, created_at: now }],
    products: [{ id: product, business_id: business, name: 'Bowl QA', price: 10, active: true, category: 'Bowls', created_at: now }],
    product_recipes: [{ id: randomUUID(), product_id: product, inventory_item_id: item, qty_per_unit: 1 }],
    inventory_items: [{ id: item, business_id: business, name: 'Açaí QA', unit: 'Units', active: true, min_qty: 0, max_qty: 200, created_at: now }],
  };
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  await context.addInitScript(({ owner, language }) => {
    localStorage.setItem('nexalvo.ui.language.v1', language);
    localStorage.setItem('nexalvo.supabase.session.v1', JSON.stringify({ accessToken: 'LOCAL_HTTP_SIMULATED_SESSION', expiresAt: Date.now() + 3600000, user: { id: owner, app_metadata: {} } }));
    window.print = () => { window.__qaPrinted = true; };
  }, { owner, language });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === local) return route.continue();
    if (url.hostname !== host) return route.abort();
    const reply = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return reply({ id: owner, app_metadata: {} });
    if (url.pathname === '/rest/v1/') return reply({});
    const name = url.pathname.replace('/rest/v1/', '');
    if (request.method() === 'GET') {
      let rows = name === 'sales' ? state.sales : name === 'customers' ? state.customers
        : name === 'rpc/fn_read_sale_items_secure' ? state.saleItems
        : name === 'rpc/fn_read_inventory_stock_secure' ? [{ id: '66666666-6666-4666-8666-666666666666', inventory_item_id: item, location_id: location, qty: state.stock, avg_cost_per_unit: 2 }]
        : tables[name] || [];
      for (const [key, value] of url.searchParams) {
        if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === value.slice(3));
        if (value.startsWith('in.(')) rows = rows.filter(row => value.slice(4, -1).split(',').includes(row[key]));
      }
      const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || rows.length || 1);
      return reply(rows.slice(offset, offset + limit), 200, { 'content-range': `${rows.length ? `${offset}-${Math.min(offset + limit, rows.length) - 1}` : '*'}/${rows.length}` });
    }
    const body = request.postDataJSON();
    if (name === 'rpc/fn_create_sale' && request.method() === 'POST') {
      assert.equal(body.p_business_id, business);
      state.saleAttempts.push(body.p_sale_id);
      let sale = state.sales.find(row => row.id === body.p_sale_id);
      if (!sale) {
        sale = { id: body.p_sale_id, business_id: business, order_no: 20001, sale_date: now, status: 'completed', payment_method: body.p_payment_method, location_id: location,
          fulfillment_status: body.p_fulfillment_status, subtotal: 10, total: 10, discount: body.p_discount, tax: body.p_tax, channel: body.p_channel, created_by: owner };
        state.sales.push(sale);
        state.saleItems.push({ id: randomUUID(), sale_id: sale.id, product_id: product, product_name_snapshot: 'Bowl QA', qty: 1, unit_price: 10, unit_cost_snapshot: 2 });
        state.stock--;
      }
      if (loseSaleResponse && state.saleAttempts.length === 1) return reply({}, 504);
      return reply(sale);
    }
    if (name === 'customers' && ['POST', 'PATCH'].includes(request.method())) {
      const values = Array.isArray(body) ? body : [{ ...state.customers.find(row => 'eq.' + row.id === url.searchParams.get('id')), ...body }];
      for (const value of values) {
        assert.equal(value.business_id, business);
        const index = state.customers.findIndex(row => row.id === value.id);
        if (index < 0) state.customers.push(value); else state.customers[index] = value;
      }
      return reply(values);
    }
    if (name === 'rpc/fn_write_audit') return reply({});
    if (name === 'rpc/fn_reconcile_business_alerts') return reply([]);
    state.blocked.push({ method: request.method(), resource: name });
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(local, { waitUntil: 'domcontentloaded' });
  await page.locator('main').waitFor();
  return { context, page, state, errors };
}

for (const loseSaleResponse of [false, true]) {
  test(`SIMULATED HTTP: external-card sale, ${loseSaleResponse ? 'lost commit response and stable retry' : 'cancel then confirm'}, reload and stock`, { timeout: 60000 }, async () => {
    const { context, page, state, errors } = await isolated({ loseSaleResponse });
    try {
      await page.getByText('Sales', { exact: true }).first().click();
      await page.getByRole('button', { name: 'New Sale', exact: true }).click();
      await page.getByRole('button', { name: 'Add Bowl QA', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('select').filter({ has: page.locator('option[value="Credit Card"]') }).selectOption('Credit Card');
      await dialog.getByRole('button', { name: /Record Card Payment/ }).click();
      await dialog.getByText('EXTERNAL CARD PAYMENT', { exact: true }).waitFor();
      assert.equal(state.saleAttempts.length, 0);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      assert.equal(state.saleAttempts.length, 0);
      await dialog.getByRole('button', { name: /Record Card Payment/ }).click();
      await dialog.getByRole('button', { name: 'Payment received on external terminal', exact: true }).click();
      if (loseSaleResponse) {
        await dialog.getByRole('button', { name: /Retry Saving Same Sale/ }).click();
      }
      await dialog.getByText('Payment Successful', { exact: true }).waitFor();
      if (loseSaleResponse) {
        assert.equal(state.saleAttempts.length, 2);
        assert.equal(state.saleAttempts[0], state.saleAttempts[1]);
      }
      assert.equal(state.sales.length, 1); assert.equal(state.stock, 99);
      if (!loseSaleResponse) {
        // Exercise the actual preview renderer without invoking an OS printer or paper output.
        await dialog.getByRole('button', { name: 'Payment Receipt', exact: true }).click();
        const receipt = page.frameLocator('iframe');
        await receipt.getByText('RECORDED IN NEXALVO', { exact: true }).waitFor();
        assert.doesNotMatch(await receipt.locator('body').innerText(), /sim_|APPROVED/);
        const download = page.waitForEvent('download');
        await page.getByRole('dialog').last().getByRole('button', { name: 'Export Document', exact: true }).click();
        assert.match((await download).suggestedFilename(), /\.html$/);
        await page.getByRole('dialog').last().getByRole('button', { name: 'Close', exact: true }).last().click();
      }
      await dialog.getByRole('button', { name: 'Done', exact: true }).click();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText('Sales', { exact: true }).first().click();
      await page.getByText('20001', { exact: false }).first().waitFor();
      assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
    } finally { await context.close(); }
  });
}

test('SIMULATED HTTP: customer create, edit contact/notes, reload and consult', { timeout: 60000 }, async () => {
  const { context, page, state, errors } = await isolated();
  try {
    await page.getByText('Customers', { exact: true }).first().click();
    await page.getByRole('button', { name: 'New Customer', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill('CLIENTE LOCAL SIMULADO');
    await dialog.locator('input').nth(1).fill('5550101234');
    await dialog.locator('input').nth(2).fill('qa@example.invalid');
    await dialog.locator('textarea').fill('Observação inicial');
    await dialog.getByRole('button', { name: 'Create Customer', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Customer', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('input').nth(0).fill('CLIENTE QA EDITADO');
    await dialog.locator('input').nth(1).fill('5550105678');
    await dialog.locator('input').nth(2).fill('edited@example.invalid');
    await dialog.locator('textarea').fill('Observação editada');
    await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.getByText('CLIENTE QA EDITADO', { exact: true }).first().waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('Customers', { exact: true }).first().click();
    await page.getByText('CLIENTE QA EDITADO', { exact: true }).first().click();
    await page.getByText('Observação editada', { exact: false }).waitFor();
    assert.equal(state.customers.length, 1);
    assert.equal(state.customers[0].email, 'edited@example.invalid');
    assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
  } finally { await context.close(); }
});

test('SIMULATED HTTP: Portuguese mobile PDV keeps external-card instructions and actions visible', { timeout: 60000 }, async () => {
  const { context, page, state } = await isolated({ mobile: true, language: 'pt-BR' });
  try {
    await page.locator('button:visible').filter({ hasText: /^Vendas$/ }).click();
    await page.getByRole('button', { name: 'Nova venda', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Adicionar Bowl QA', exact: true }).click();
    await dialog.locator('select').filter({ has: page.locator('option[value="Credit Card"]') }).selectOption('Credit Card');
    const record = dialog.getByRole('button', { name: /Registrar pagamento com cartão/ });
    await record.scrollIntoViewIfNeeded(); await record.click();
    await dialog.getByText('PAGAMENTO EM MAQUININHA EXTERNA', { exact: true }).waitFor();
    await dialog.getByRole('button', { name: 'Pagamento recebido na maquininha externa', exact: true }).waitFor();
    assert.equal(state.saleAttempts.length, 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  } finally { await context.close(); }
});
