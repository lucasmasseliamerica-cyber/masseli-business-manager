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

async function isolated({ loseSaleResponse = false, mobile = false, language = 'en', cardMode, photoFault, purchaseScenario = false, initialStockUnknown = false, saleFault, csvName } = {}) {
  const business = '11111111-1111-4111-8111-111111111111';
  const owner = '22222222-2222-4222-8222-222222222222';
  const location = '33333333-3333-4333-8333-333333333333';
  const product = '44444444-4444-4444-8444-444444444444';
  const item = '55555555-5555-4555-8555-555555555555';
  const now = new Date().toISOString();
  const state = { sales: [], saleItems: [], customers: [], stock: 100, saleAttempts: [], blocked: [], remoteRequests: 0,
    images: new Map(), photoUploads: [], photoDeletes: [], productWrites: [], purchaseWrites: [], purchaseOrders: [], purchaseLines: [], initialStockWrites: [] };
  const tables = {
    users: [{ id: owner, business_id: business, name: 'OWNER LOCAL SIMULADO', role: 'OWNER', active: true, permission_overrides: {} }],
    businesses: [{ id: business, name: 'MASSELI QA HTTP SIMULADO', currency: 'BRL', timezone: 'America/Sao_Paulo', tax_enabled: false, tax_rate: 0, status: 'ACTIVE' }],
    locations: [{ id: location, business_id: business, name: 'Unidade simulada', active: true, created_at: now }],
    products: [{ id: product, business_id: business, name: 'Bowl QA', price: 10, active: true, category: 'Bowls', image_url: null, created_at: now }],
    product_recipes: [{ id: randomUUID(), product_id: product, inventory_item_id: item, qty_per_unit: 1 }],
    inventory_items: [{ id: item, business_id: business, name: 'Açaí QA', unit: 'Units', active: true, min_qty: 0, max_qty: 200, created_at: now }],
  };
  if (purchaseScenario) {
    const supplier = '88888888-8888-4888-8888-888888888888';
    tables.suppliers = [
      { id: '99999999-9999-4999-8999-999999999999', business_id: business, name: 'Inactive supplier', active: false },
      { id: supplier, business_id: business, name: 'Active QA supplier', active: true },
    ];
    tables.locations.unshift({ id: '77777777-7777-4777-8777-777777777777', business_id: business, name: 'Other QA location', active: true });
    tables.inventory_items[0] = { ...tables.inventory_items[0], min_qty: 5, max_qty: 10, supplier_id: supplier };
    tables.inventory_items.unshift({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', business_id: business, name: 'Inactive ingredient', active: false, unit: 'Units' });
    state.stock = 1;
  }
  if (saleFault === 'missing-ingredient') tables.inventory_items = [];
  if (saleFault === 'inactive-ingredient') tables.inventory_items[0].active = false;
  if (saleFault === 'negative-recipe') tables.product_recipes[0].qty_per_unit = -1;
  if (saleFault === 'negative-price') tables.products[0].price = -1;
  if (saleFault === 'invalid-stock') state.stock = 'NaN';
  if (csvName) tables.inventory_items[0].name = csvName;
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 } });
  context.setDefaultTimeout(10000);
  await context.addInitScript(({ owner, language }) => {
    localStorage.setItem('nexalvo.ui.language.v1', language);
    localStorage.setItem('nexalvo.supabase.session.v1', JSON.stringify({ accessToken: 'LOCAL_HTTP_SIMULATED_SESSION', expiresAt: Date.now() + 3600000, user: { id: owner, app_metadata: {} } }));
    window.print = () => { window.__qaPrinted = true; };
  }, { owner, language });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === local) {
      if (cardMode && url.pathname === '/src/App.jsx') {
        // Select a build-time mode in this isolated HTTP fixture only. No environment file or
        // developer configuration changes; the actual Vite-transformed React component runs.
        const response = await route.fetch();
        const body = await response.text();
        assert.ok(body.includes('const PAYMENT_MODE ='), 'expected Vite payment mode boundary');
        return route.fulfill({ response, body: body.replace('const PAYMENT_MODE =', `import.meta.env.VITE_CARD_PAYMENT_MODE = ${JSON.stringify(cardMode)};\nconst PAYMENT_MODE =`) });
      }
      return route.continue();
    }
    if (url.hostname !== host) return route.abort();
    const reply = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
    if (url.pathname.startsWith('/storage/v1/object/sign/nexalvo-product-images/') && request.method() === 'GET') {
      const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/sign/nexalvo-product-images/'.length));
      const png = state.images.get(path);
      return png ? route.fulfill({ status: 200, contentType: 'image/png', body: png }) : reply({}, 404);
    }
    if (url.pathname === '/storage/v1/object/sign/nexalvo-product-images' && request.method() === 'POST') {
      return reply(request.postDataJSON().paths.map(path => state.images.has(path)
        ? { path, signedURL: `/object/sign/nexalvo-product-images/${path}?token=LOCAL_SIMULATED` } : { path, error: 'not found' }));
    }
    if (url.pathname.startsWith('/storage/v1/object/nexalvo-product-images/') && request.method() === 'POST') {
      const path = decodeURIComponent(url.pathname.slice('/storage/v1/object/nexalvo-product-images/'.length));
      assert.ok(path.startsWith(`${business}/${product}/`));
      state.photoUploads.push(path);
      state.images.set(path, request.postDataBuffer());
      return reply({}, photoFault === 'upload-unknown' ? 504 : 200);
    }
    if (url.pathname === '/storage/v1/object/nexalvo-product-images' && request.method() === 'DELETE') {
      for (const path of request.postDataJSON().prefixes) { state.photoDeletes.push(path); state.images.delete(path); }
      return reply([]);
    }
    if (url.pathname === '/auth/v1/user') return reply({ id: owner, app_metadata: {} });
    if (url.pathname === '/rest/v1/') return reply({});
    const name = url.pathname.replace('/rest/v1/', '');
    if (request.method() === 'GET') {
      let rows = name === 'sales' ? state.sales : name === 'customers' ? state.customers
        : name === 'purchase_orders' ? state.purchaseOrders : name === 'rpc/fn_read_purchase_order_items_secure' ? state.purchaseLines
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
    if (name === 'rpc/fn_create_purchase_order' && request.method() === 'POST') {
      assert.equal(body.p_business_id, business);
      state.purchaseWrites.push(body);
      const po = { id: randomUUID(), business_id: business, po_number: 30001, supplier_id: body.p_supplier_id, location_id: body.p_location_id,
        order_date: body.p_order_date, expected_date: body.p_expected_date, status: body.p_status, payment_method: body.p_payment_method,
        discount: body.p_discount, tax: body.p_tax, notes: body.p_notes };
      state.purchaseOrders.push(po);
      state.purchaseLines.push(...body.p_items.map(line => ({ ...line, id: randomUUID(), purchase_order_id: po.id, qty_ordered: line.qty, received_qty: 0 })));
      return reply(po);
    }
    if (name === 'rpc/fn_add_initial_stock' && request.method() === 'POST' && initialStockUnknown) {
      assert.equal(body.p_business_id, business);
      state.initialStockWrites.push(body);
      tables.inventory_items.push({ id: randomUUID(), business_id: business, name: body.p_name, unit: body.p_unit, active: true, created_at: now });
      return reply({}, 504);
    }
    if (name === 'rpc/fn_save_product' && request.method() === 'POST') {
      assert.equal(body.p_product_id, product); assert.equal(body.p_business_id, business);
      assert.equal(body.p_operation, 'upsert');
      state.productWrites.push(body);
      tables.products[0] = { ...tables.products[0], image_url: body.p_image_url, updated_at: new Date().toISOString() };
      return reply(tables.products[0], photoFault === 'save-unknown' && state.productWrites.length === 1 ? 504 : 200);
    }
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

test('SIMULATED HTTP: inventory CSV download treats an untrusted name as text', { timeout: 30000 }, async () => {
  const { context, page, state, errors } = await isolated({ csvName: '=1+1' });
  try {
    await page.getByText('Inventory', { exact: true }).first().click();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), 'nexalvo-inventory-valuation.csv');
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    assert.match(csv, /\n'=1\+1,/);
    assert.doesNotMatch(csv, /\n=1\+1,/);
    assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
  } finally { await context.close(); }
});

test('SIMULATED HTTP: inventory reorder preserves location and uses the purchase RPC', { timeout: 30000 }, async () => {
  const { context, page, state, errors } = await isolated({ purchaseScenario: true });
  try {
    await page.getByText('Inventory', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Create Purchase', exact: true }).click();
    const dialog = page.getByRole('dialog');
    // Opening the shortcut must retain the ingredient's location rather than the first location.
    assert.equal(await dialog.locator('select').nth(1).inputValue(), '33333333-3333-4333-8333-333333333333');
    await dialog.getByRole('button', { name: 'Submit Order', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(state.purchaseWrites.length, 1);
    const request = state.purchaseWrites[0];
    assert.equal(request.p_location_id, '33333333-3333-4333-8333-333333333333');
    assert.equal(request.p_supplier_id, '88888888-8888-4888-8888-888888888888');
    assert.equal(request.p_items[0].inventory_item_id, '55555555-5555-4555-8555-555555555555');
    assert.equal(state.stock, 1, 'creating an order must not receive stock');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('Purchases', { exact: true }).first().click();
    await page.getByText(/^PO-30001 ·/).waitFor();
    assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
  } finally { await context.close(); }
});

test('SIMULATED HTTP: purchase preview matches canonical costs, discount and tax after reload', { timeout: 30000 }, async () => {
  const { context, page, state, errors } = await isolated({ purchaseScenario: true });
  try {
    await page.getByText('Purchases', { exact: true }).first().click();
    await page.getByRole('button', { name: 'New Purchase', exact: true }).click();
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.locator('select').first().inputValue(), '88888888-8888-4888-8888-888888888888');
    assert.equal(await dialog.locator('select').last().inputValue(), '55555555-5555-4555-8555-555555555555');
    const inputs = dialog.locator('input[type="number"]');
    await inputs.nth(0).fill('3'); await inputs.nth(1).fill('1.234');
    await inputs.nth(2).fill('0.005'); await inputs.nth(3).fill('0.004');
    assert.match(await dialog.getByText('Subtotal', { exact: true }).locator('..').innerText(), /3[.,]69/);
    assert.match(await dialog.getByText('Grand Total', { exact: true }).locator('..').innerText(), /3[.,]68/);
    await dialog.getByRole('button', { name: 'Submit Order', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(state.purchaseWrites.length, 1);
    const request = state.purchaseWrites[0];
    assert.equal(request.p_items[0].unit_cost, 1.23);
    assert.equal(request.p_discount, 0.01); assert.equal(request.p_tax, 0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('Purchases', { exact: true }).first().click();
    await page.getByText(/^PO-30001 ·/).click();
    assert.match(await page.getByRole('dialog').getByText('Grand Total', { exact: true }).locator('..').innerText(), /3[.,]68/);
    assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
  } finally { await context.close(); }
});

test('SIMULATED HTTP: unknown initial-stock creation freezes save and cannot replay after reopening', { timeout: 30000 }, async () => {
  const { context, page, state, errors } = await isolated({ initialStockUnknown: true });
  try {
    await page.getByText('Inventory', { exact: true }).first().click();
    await page.getByRole('button', { name: 'New Item', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.locator('input').first().fill('Unknown initial stock QA');
    await dialog.getByRole('button', { name: 'Save Item', exact: true }).click();
    assert.equal(await dialog.getByRole('button', { name: 'Refresh required', exact: true }).isDisabled(), true);
    assert.equal(state.initialStockWrites.length, 1);
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'New Item', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.locator('input').first().fill('Another initial stock QA');
    await dialog.getByRole('button', { name: 'Save Item', exact: true }).click();
    assert.equal(await dialog.getByRole('button', { name: 'Refresh required', exact: true }).isDisabled(), true);
    assert.equal(state.initialStockWrites.length, 1);
    assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
  } finally { await context.close(); }
});

for (const saleFault of ['missing-ingredient', 'inactive-ingredient', 'negative-recipe', 'negative-price', 'invalid-stock']) {
  test(`SIMULATED HTTP: ${saleFault} blocks external payment before confirmation`, { timeout: 30000 }, async () => {
    const { context, page, state, errors } = await isolated({ saleFault });
    try {
      await page.getByText('Sales', { exact: true }).first().click();
      await page.getByRole('button', { name: 'New Sale', exact: true }).click();
      await page.getByRole('button', { name: 'Add Bowl QA', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('select').filter({ has: page.locator('option[value="Credit Card"]') }).selectOption('Credit Card');
      await dialog.getByRole('button', { name: /Record Card Payment/ }).click();
      const message = saleFault === 'negative-price' ? 'Selling price must be a valid number, zero or greater.'
        : saleFault === 'invalid-stock' ? 'Refresh inventory before taking payment.' : 'Check the product recipe before taking payment.';
      await dialog.getByText(message, { exact: true }).waitFor();
      assert.equal(await dialog.getByText('EXTERNAL CARD PAYMENT', { exact: true }).count(), 0);
      assert.equal(state.saleAttempts.length, 0);
      assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
    } finally { await context.close(); }
  });
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

test('SIMULATED HTTP: Stripe mode shows disconnected in PT and blocks card before any sale/processor request, including reload', { timeout: 60000 }, async () => {
  const { context, page, state, errors } = await isolated({ mobile: true, language: 'pt-BR', cardMode: 'stripe_terminal' });
  try {
    for (let visit = 0; visit < 2; visit++) {
      await page.locator('button:visible').filter({ hasText: /^Vendas$/ }).click();
      await page.getByRole('button', { name: 'Nova venda', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Adicionar Bowl QA', exact: true }).click();
      const methods = dialog.locator('select').filter({ has: page.locator('option[value="Credit Card"]') });
      await methods.selectOption('Credit Card');
      await dialog.getByRole('status').getByText('Stripe Terminal · Desconectado', { exact: true }).waitFor();
      await dialog.getByText(/Pagamentos offline não são permitidos/).waitFor();
      assert.equal(await dialog.getByRole('button', { name: 'Stripe Terminal indisponível', exact: true }).isDisabled(), true);
      assert.equal(await dialog.getByRole('button', { name: 'Pagamento recebido na maquininha externa', exact: true }).count(), 0);
      // This block is specific to integrated card processing; it must not disable other methods.
      await methods.selectOption('Other');
      assert.equal(await dialog.getByRole('button', { name: /Concluir venda/ }).isEnabled(), true);
      assert.equal(state.saleAttempts.length, 0); assert.equal(state.stock, 100);
      assert.deepEqual(state.blocked, []); assert.deepEqual(errors, []);
      if (!visit) await page.reload({ waitUntil: 'domcontentloaded' });
    }
  } finally { await context.close(); }
});

const photoPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
async function editPhoto(page) {
  await page.getByRole('button', { name: 'Products', exact: true }).first().click();
  await page.getByText('Bowl QA', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  return dialog;
}

for (const photoFault of ['upload-unknown', 'save-unknown']) {
  test(`SIMULATED HTTP: ${photoFault} freezes product photo retries without deleting the uncertain object`, { timeout: 60000 }, async () => {
    const { context, page, state, errors } = await isolated({ photoFault });
    try {
      const dialog = await editPhoto(page);
      await dialog.locator('input[type=file]').setInputFiles({ name: 'one.png', mimeType: 'image/png', buffer: photoPng });
      await dialog.locator('img[src^="blob:"]').waitFor();
      await dialog.getByRole('button', { name: 'Save Product', exact: true }).click();
      await dialog.getByText(photoFault === 'upload-unknown' ? /The upload result is unknown/ : /The uploaded image was preserved/).waitFor();
      assert.equal(await dialog.getByRole('button', { name: 'Save Product', exact: true }).isDisabled(), true);
      assert.equal(await dialog.getByRole('button', { name: 'Deactivate', exact: true }).isDisabled(), true);
      assert.equal(await dialog.locator('input[type=file]').isDisabled(), true);
      assert.equal(state.photoUploads.length, 1); assert.equal(state.photoDeletes.length, 0); assert.equal(state.images.size, 1);
      assert.equal(state.productWrites.length, photoFault === 'upload-unknown' ? 0 : 1);
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      const reopenedUnknown = await editPhoto(page);
      assert.equal(await reopenedUnknown.getByRole('button', { name: 'Save Product', exact: true }).isDisabled(), true, 'closing a modal cannot reset an uncertain attempt');
      assert.equal(state.photoUploads.length, 1);
      if (photoFault === 'save-unknown') {
        await page.reload({ waitUntil: 'domcontentloaded' });
        const reopened = await editPhoto(page);
        const image = reopened.locator('img'); await image.waitFor(); await image.scrollIntoViewIfNeeded();
        assert.equal(await image.evaluate(async img => { try { await img.decode(); return img.naturalWidth > 0; } catch { return false; } }), true);
        assert.equal(state.productWrites.length, 1, 'reload reconciles and never repeats the write');
      }
      assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
    } finally { await context.close(); }
  });
}

test('SIMULATED HTTP: photo upload, reload, replacement and removal preserve the product and leave no simulated objects', { timeout: 60000 }, async () => {
  const { context, page, state, errors } = await isolated();
  try {
    for (let file = 0; file < 2; file++) {
      const dialog = await editPhoto(page);
      await dialog.locator('input[type=file]').setInputFiles({ name: `${file}.png`, mimeType: 'image/png', buffer: photoPng });
      await dialog.locator('img[src^="blob:"]').waitFor();
      await dialog.getByRole('button', { name: 'Save Product', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(state.images.size, 1);
    }
    const dialog = await editPhoto(page);
    await dialog.getByRole('button', { name: 'Remove photo', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save Product', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const final = await editPhoto(page);
    assert.equal(await final.locator('img').count(), 0);
    assert.equal(state.photoUploads.length, 2); assert.equal(state.photoDeletes.length, 2);
    assert.equal(state.images.size, 0); assert.equal(state.productWrites.length, 3);
    assert.ok(state.productWrites.every(args => args.p_name === 'Bowl QA' && args.p_price === 10 && args.p_active === true));
    assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
  } finally { await context.close(); }
});
