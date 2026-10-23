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

async function isolated({ loseSaleResponse = false, mobile = false, language = 'en', cardMode, photoFault, purchaseScenario = false, initialStockUnknown = false, saleFault, csvName, photoProductActive = true, saleJourneyFixture = false, inventoryScenario = false, c1Baseline = false, inventoryAuditFault } = {}) {
  const business = '11111111-1111-4111-8111-111111111111';
  const owner = '22222222-2222-4222-8222-222222222222';
  const location = '33333333-3333-4333-8333-333333333333';
  const product = '44444444-4444-4444-8444-444444444444';
  const item = '55555555-5555-4555-8555-555555555555';
  const now = new Date().toISOString();
  const state = { sales: [], saleItems: [], customers: [], stock: 100, saleAttempts: [], blocked: [], remoteRequests: 0,
    images: new Map(), photoUploads: [], photoDeletes: [], productWrites: [], purchaseWrites: [], purchaseOrders: [], purchaseLines: [], purchaseReceipts: [], initialStockWrites: [], cashMovements: [], inventoryMovements: [], reversalAttempts: [] };
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
  if (inventoryScenario) {
    tables.locations.push({ id: '77777777-7777-4777-8777-777777777777', business_id: business, name: 'Secondary QA location', active: true });
    tables.inventory_items.push({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', business_id: business, name: 'Inactive ingredient', active: false, unit: 'Units' });
    state.stockSlots = tables.locations.map((l, index) => ({ id: randomUUID(), inventory_item_id: item, location_id: l.id, qty: index ? 2.125 : 1.125, avg_cost_per_unit: 0.1234 }));
    if (c1Baseline) state.stockSlots.forEach(s => { s.qty = 2; s.avg_cost_per_unit = 0.1; });
    state.inventoryWrites = [];
  }
  if (saleFault === 'missing-ingredient') tables.inventory_items = [];
  if (saleFault === 'inactive-ingredient') tables.inventory_items[0].active = false;
  if (saleFault === 'negative-recipe') tables.product_recipes[0].qty_per_unit = -1;
  if (saleFault === 'negative-price') tables.products[0].price = -1;
  if (saleFault === 'invalid-stock') state.stock = 'NaN';
  if (csvName) tables.inventory_items[0].name = csvName;
  if(saleJourneyFixture){
    tables.businesses[0]={...tables.businesses[0],currency:'USD',tax_enabled:true,tax_rate:7.25};
    tables.products[0]={...tables.products[0],name:'ZZ_QA_SALE_BROWSER',price:0.5};
    tables.product_recipes[0].qty_per_unit=0.25;
  }
  tables.products[0].active = photoProductActive;
  if (!photoProductActive) {
    tables.products[0].sku = 'QA-INACTIVE-PHOTO';
    tables.product_recipes = [];
  }
  state.productBaseline = structuredClone(tables.products[0]);
  state.recipeBaseline = structuredClone(tables.product_recipes);
  state.uploadProductSnapshots = [];
  state.auditRows = [{ id: randomUUID(), business_id: business, action: 'Prior QA event', details: 'Historical event to preserve', occurred_at: now, user_id: owner }];
  state.auditBaseline = structuredClone(state.auditRows);
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
      state.uploadProductSnapshots.push(structuredClone(tables.products[0]));
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
      let rows = name === 'sales' ? state.sales : name === 'customers' ? state.customers : name === 'audit_logs' ? state.auditRows
        : name === 'purchase_orders' ? state.purchaseOrders : name === 'rpc/fn_read_purchase_order_items_secure' ? state.purchaseLines
        : name === 'cash_flow' ? state.cashMovements : name === 'rpc/fn_read_inventory_transactions_secure' ? state.inventoryMovements
        : name === 'rpc/fn_read_sale_items_secure' ? state.saleItems
        : name === 'rpc/fn_read_inventory_stock_secure' ? (state.stockSlots || [{ id: '66666666-6666-4666-8666-666666666666', inventory_item_id: item, location_id: location, qty: state.stock, avg_cost_per_unit: 2 }])
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
    if (purchaseScenario && name === 'rpc/fn_receive_purchase_order' && request.method() === 'POST') {
      const po=state.purchaseOrders.find(row=>row.id===body.p_purchase_order_id);assert.ok(po);
      state.purchaseReceipts.push(body);
      for(const receipt of body.p_receive_lines) {
        const line=state.purchaseLines.find(row=>row.id===receipt.po_item_id&&row.purchase_order_id===po.id);assert.ok(line);
        assert.ok(receipt.qty>0&&receipt.qty<=line.qty_ordered-line.received_qty+0.0001);
        line.received_qty=Math.round((line.received_qty+receipt.qty)*1000)/1000;
        state.stock=Math.round((state.stock+receipt.qty)*1000)/1000;
      }
      po.status=state.purchaseLines.filter(line=>line.purchase_order_id===po.id).every(line=>line.received_qty>=line.qty_ordered)?'Received':'Partially Received';
      return reply(po);
    }
    if (inventoryScenario && ['rpc/fn_adjust_inventory_count','rpc/fn_record_waste','rpc/fn_transfer_inventory'].includes(name)) {
      assert.equal(body.p_business_id, business); assert.equal(body.p_inventory_item_id, item);
      state.inventoryWrites.push({ name, body });
      const stock = state.stockSlots.find(row => row.location_id === (body.p_location_id || body.p_from_location_id));
      assert.ok(stock);
      const delta = name.endsWith('fn_adjust_inventory_count') ? body.p_new_qty - stock.qty : -body.p_qty;
      stock.qty = Math.round((stock.qty + delta) * 1000) / 1000;
      const tx = { id: randomUUID(), business_id: business, inventory_item_id: item, location_id: stock.location_id,
        type: name.endsWith('fn_record_waste') ? 'WASTE' : name.endsWith('fn_transfer_inventory') ? 'TRANSFER_OUT' : 'ADJUSTMENT', qty_change: delta, created_at: now,
        note: name.endsWith('fn_adjust_inventory_count') ? `Reason: ${body.p_reason} — ${body.p_notes}` : body.p_notes };
      state.inventoryMovements.push(tx);
      if (name.endsWith('fn_transfer_inventory')) {
        const target = state.stockSlots.find(row => row.location_id === body.p_to_location_id); assert.ok(target);
        target.qty = Math.round((target.qty + body.p_qty) * 1000) / 1000;
        state.inventoryMovements.push({ ...tx, id: randomUUID(), location_id: target.location_id, type: 'TRANSFER_IN', qty_change: body.p_qty, related_transaction_id: tx.id });
      }
      return reply(tx);
    }
    if (inventoryScenario && name === 'rpc/fn_add_initial_stock') {
      assert.equal(body.p_business_id, business); state.initialStockWrites.push(body);
      const row = { id: randomUUID(), business_id: business, name: body.p_name, category: body.p_category, unit: body.p_unit, active: true, created_at: now };
      tables.inventory_items.push(row);
      state.stockSlots.push({ id: randomUUID(), inventory_item_id: row.id, location_id: body.p_location_id, qty: body.p_starting_qty, avg_cost_per_unit: body.p_starting_cost });
      return reply(row);
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
      const baseline = state.productBaseline;
      assert.equal(body.p_active, baseline.active);
      assert.equal(body.p_name, baseline.name); assert.equal(body.p_price, baseline.price);
      assert.equal(body.p_sku, baseline.sku || null); assert.equal(body.p_category, baseline.category);
      assert.equal(body.p_description, baseline.description || null);
      assert.deepEqual(body.p_recipe, state.recipeBaseline.map(row => ({ inventory_item_id: row.inventory_item_id, qty_per_unit: row.qty_per_unit })));
      state.productWrites.push(body);
      tables.products[0] = { ...tables.products[0], active: body.p_active, image_url: body.p_image_url, updated_at: new Date().toISOString() };
      return reply(tables.products[0], photoFault === 'save-unknown' && state.productWrites.length === 1 ? 504 : 200);
    }
    if (name === 'rpc/fn_create_sale' && request.method() === 'POST') {
      assert.equal(body.p_business_id, business);
      state.saleAttempts.push(body.p_sale_id);
      let sale = state.sales.find(row => row.id === body.p_sale_id);
      if (!sale) {
        const unitPrice=Number(body.p_items[0].unit_price),qty=Number(body.p_items[0].qty);
        const subtotal=Math.round(unitPrice*qty*100)/100,total=Math.round((subtotal-body.p_discount+body.p_tax)*100)/100;
        sale = { id: body.p_sale_id, business_id: business, order_no: 20001, sale_date: now, status: 'completed', payment_method: body.p_payment_method, location_id: location,
          fulfillment_status: body.p_fulfillment_status, subtotal, total, discount: body.p_discount, tax: body.p_tax, channel: body.p_channel, notes:body.p_notes,created_by: owner };
        state.sales.push(sale);
        state.saleItems.push({ id: randomUUID(), sale_id: sale.id, product_id: product, product_name_snapshot: tables.products[0].name, qty, unit_price: unitPrice, unit_cost_snapshot: 2 });
        const deduction=Number(tables.product_recipes[0].qty_per_unit)*qty;state.stock-=deduction;
        state.cashMovements.push({id:randomUUID(),business_id:business,location_id:location,sale_id:sale.id,type:'income',amount:total,payment_method:body.p_payment_method});
        state.inventoryMovements.push({id:randomUUID(),business_id:business,location_id:location,inventory_item_id:item,sale_id:sale.id,type:'SALE',qty_change:-deduction});
      }
      if (loseSaleResponse && state.saleAttempts.length === 1) return reply({}, 504);
      return reply(sale);
    }
    if(name==='rpc/fn_reverse_sale'&&saleJourneyFixture){
      const sale=state.sales.find(row=>row.id===body.p_sale_id);assert.ok(sale);assert.notEqual(sale.status,'cancelled');
      state.reversalAttempts.push(body.p_sale_id);sale.status='cancelled';sale.cancelled_at=new Date().toISOString();
      const deduction=-state.inventoryMovements.find(row=>row.sale_id===sale.id&&row.type==='SALE').qty_change;state.stock+=deduction;
      state.inventoryMovements.push({id:randomUUID(),business_id:business,location_id:location,inventory_item_id:item,sale_id:sale.id,type:'REVERSAL',qty_change:deduction});
      state.cashMovements.push({id:randomUUID(),business_id:business,location_id:location,sale_id:sale.id,type:'expense',category:'Sale Cancellation',amount:sale.total,payment_method:sale.payment_method});
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
    if (name === 'rpc/fn_write_audit') {
      const entry = { id: randomUUID(), business_id: business, action: body.p_action, details: body.p_details, user_id: owner, occurred_at: new Date().toISOString() };
      state.auditRows.push(entry);
      if (inventoryAuditFault === 'unknown' && body.p_action === 'Stock Transferred') return route.abort();
      return reply(entry);
    }
    if (name === 'rpc/fn_reconcile_business_alerts') return reply([]);
    state.blocked.push({ method: request.method(), resource: name });
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(local, { waitUntil: 'domcontentloaded' });
  await page.locator('main').waitFor();
  return { context, page, state, errors, catalog: tables };
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

test('SIMULATED HTTP: B-Jornada Other sale below USD 1, same-ID replay, reload, UI reversal and PT/EN', {timeout:60000}, async()=>{
  const {context,page,state,errors}=await isolated({saleJourneyFixture:true,loseSaleResponse:true});
  try{
    await page.getByText('Sales',{exact:true}).first().click();await page.getByRole('button',{name:'New Sale',exact:true}).click();
    let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Add ZZ_QA_SALE_BROWSER',exact:true}).click();
    await dialog.getByText('Payment Method',{exact:true}).locator('..').locator('select').selectOption('Other');
    await dialog.locator('input[type=number]').last().fill('0.01');await dialog.locator('textarea').fill('NEXALVO_B_BROWSER_SIMULATED');
    assert.match(await dialog.getByText('Subtotal',{exact:true}).locator('..').innerText(),/0\.50/);
    assert.match(await dialog.getByText('Tax (7.25%)',{exact:true}).locator('..').innerText(),/0\.04/);
    assert.match(await dialog.getByText('Total',{exact:true}).locator('..').innerText(),/0\.53/);
    await dialog.getByRole('button',{name:/^Complete Sale/}).click();
    await dialog.getByRole('button',{name:'Retry Saving Same Sale',exact:true}).waitFor();
    assert.equal(state.sales.length,1);assert.equal(state.stock,99.75);assert.equal(state.cashMovements.length,1);
    assert.equal(await dialog.getByRole('button',{name:/^Complete Sale/}).count(),0);
    await dialog.getByRole('button',{name:'Retry Saving Same Sale',exact:true}).click();
    await dialog.getByText('Payment Successful',{exact:true}).waitFor();
    await dialog.getByRole('button',{name:'Done',exact:true}).click();
    assert.equal(state.saleAttempts.length,2);assert.equal(state.saleAttempts[0],state.saleAttempts[1]);
    await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Sales',{exact:true}).first().click();
    await page.getByText('Order #20001 · In Store',{exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Cancel Sale',exact:true}).click();
    await page.getByRole('alertdialog').getByRole('button',{name:'Cancel Sale',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Sales',{exact:true}).first().click();
    await page.getByText('Order #20001 · In Store',{exact:true}).click();
    dialog=page.getByRole('dialog');await dialog.getByText('CANCELLED',{exact:false}).first().waitFor();
    await page.getByLabel('Language',{exact:true}).first().selectOption('pt-BR');
    await dialog.getByText('CANCELADO',{exact:false}).first().waitFor();
    assert.equal(state.reversalAttempts.length,1);assert.equal(state.stock,100);
    assert.equal(state.inventoryMovements.length,2);assert.equal(state.sales[0].status,'cancelled');assert.equal(state.saleItems.length,1);
    assert.equal(state.cashMovements.reduce((sum,row)=>sum+(row.type==='income'?1:-1)*Math.round(row.amount*100),0),0);
    assert.equal(state.sales[0].payment_method,'Other');assert.deepEqual(errors,[]);assert.deepEqual(state.blocked,[]);
  }finally{await context.close();}
});

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

for (const photoProductActive of [true, false]) {
test(`SIMULATED HTTP: ${photoProductActive ? 'active' : 'inactive'} product photo upload, reload, replacement and removal preserve state and leave no simulated objects`, { timeout: 60000 }, async () => {
  const { context, page, state, errors, catalog } = await isolated({ photoProductActive });
  try {
    for (let file = 0; file < 2; file++) {
      const dialog = await editPhoto(page);
      assert.equal(await dialog.locator('input[type=checkbox]').isChecked(), photoProductActive);
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
    assert.equal(await final.locator('input[type=checkbox]').isChecked(), photoProductActive);
    assert.equal(await final.locator('img').count(), 0);
    assert.equal(state.photoUploads.length, 2); assert.equal(state.photoDeletes.length, 2);
    assert.equal(state.images.size, 0); assert.equal(state.productWrites.length, 3);
    assert.ok(state.productWrites.every(args => args.p_name === 'Bowl QA' && args.p_price === 10 && args.p_active === photoProductActive));
    const unchangedFields = product => Object.fromEntries(Object.entries(product).filter(([key]) => !['image_url', 'updated_at'].includes(key)));
    for (const duringUpload of state.uploadProductSnapshots) assert.deepEqual(unchangedFields(duringUpload), unchangedFields(state.productBaseline));
    assert.deepEqual(unchangedFields(catalog.products[0]), unchangedFields(state.productBaseline));
    assert.equal(catalog.products[0].image_url, null);
    assert.deepEqual(catalog.product_recipes, state.recipeBaseline);
    assert.equal(state.sales.length, 0); assert.equal(state.saleItems.length, 0);
    assert.deepEqual(state.auditRows.slice(0, state.auditBaseline.length), state.auditBaseline);
    assert.equal(state.auditRows.length, state.auditBaseline.length + 3, 'photo saves append audit events without rewriting prior history');
    assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
  } finally { await context.close(); }
});
}


test('SIMULATED HTTP C: count preserves three decimals at the selected location through reload and rejects excess precision', { timeout: 30000 }, async () => {
  const { context, page, state, errors } = await isolated({ inventoryScenario: true });
  try {
    await page.getByText('Inventory', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Adjust', exact: true }).first().click();
    let dialog = page.getByRole('dialog');
    const itemSelect = dialog.getByText('Item', { exact: true }).locator('..').locator('select');
    assert.equal(await itemSelect.locator('option').filter({ hasText: 'Inactive ingredient' }).count(), 0);
    await dialog.getByText('Location', { exact: true }).locator('..').locator('select').selectOption('77777777-7777-4777-8777-777777777777');
    let counted = dialog.locator('input[type=number]');
    await counted.fill('2.1261'); await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await dialog.getByText('Stock quantities support up to 3 decimal places.', { exact: true }).waitFor();
    assert.equal(state.inventoryWrites.length, 0);
    await counted.fill('2.126'); await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(state.inventoryWrites.length, 1); assert.equal(state.inventoryWrites[0].body.p_new_qty, 2.126);
    assert.equal(state.inventoryWrites[0].body.p_location_id, '77777777-7777-4777-8777-777777777777');
    assert.equal(state.stockSlots[0].qty, 1.125); assert.equal(state.stockSlots[1].qty, 2.126);
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByText('Inventory', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Adjust', exact: true }).first().click(); dialog = page.getByRole('dialog');
    await dialog.getByText('Location', { exact: true }).locator('..').locator('select').selectOption('77777777-7777-4777-8777-777777777777');
    assert.equal(await dialog.locator('input[type=number]').inputValue(), '2.126');
    assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
  } finally { await context.close(); }
});

test('SIMULATED HTTP C: new item preserves starting quantity and four-place average cost', { timeout: 30000 }, async () => {
  const { context, page, state, errors } = await isolated({ inventoryScenario: true });
  try {
    await page.getByText('Inventory', { exact: true }).first().click(); await page.getByRole('button', { name: 'New Item', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input').first().fill('Fractional QA ingredient');
    await dialog.getByText('Starting Quantity', { exact: true }).locator('..').locator('input').fill('0.125');
    const cost = dialog.getByText('Cost per Unit ($)', { exact: true }).locator('..').locator('input');
    await cost.fill('0.12345'); await dialog.getByRole('button', { name: 'Save Item', exact: true }).click();
    await dialog.getByText('Stock costs support up to 4 decimal places.', { exact: true }).waitFor(); assert.equal(state.initialStockWrites.length, 0);
    await cost.fill('0.1234'); await dialog.getByRole('button', { name: 'Save Item', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(state.initialStockWrites.length, 1); assert.equal(state.initialStockWrites[0].p_starting_qty, 0.125); assert.equal(state.initialStockWrites[0].p_starting_cost, 0.1234);
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.getByText('Inventory', { exact: true }).first().click();
    await page.getByText('Fractional QA ingredient', { exact: true }).waitFor();
    assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
  } finally { await context.close(); }
});

test('SIMULATED HTTP C: fractional transfer rejects excess precision and preserves source destination and cost', { timeout: 30000 }, async () => {
  const { context, page, state, errors } = await isolated({ inventoryScenario: true });
  try {
    await page.getByText('Inventory', { exact: true }).first().click(); await page.getByRole('button', { name: 'Transfer', exact: true }).first().click();
    const dialog = page.getByRole('dialog'); await dialog.locator('input[type=number]').fill('0.1251');
    await dialog.getByRole('button', { name: 'Transfer Stock', exact: true }).click();
    await dialog.getByText('Stock quantities support up to 3 decimal places.', { exact: true }).waitFor(); assert.equal(state.inventoryWrites.length, 0);
    await dialog.locator('input[type=number]').fill('0.125'); await dialog.getByRole('button', { name: 'Transfer Stock', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(state.inventoryWrites.length, 1); assert.equal(state.inventoryWrites[0].body.p_qty, 0.125);
    assert.equal(state.stockSlots[0].qty, 1); assert.equal(state.stockSlots[1].qty, 2.25);
    assert.ok(state.stockSlots.every(row => row.avg_cost_per_unit === 0.1234));
    assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
  } finally { await context.close(); }
});

test('SIMULATED HTTP C1: four UI operations reload history and restore two balances and costs without deleting audit', { timeout: 60000 }, async () => {
  const { context, page, state, errors } = await isolated({ inventoryScenario: true, c1Baseline: true });
  const source = '33333333-3333-4333-8333-333333333333', target = '77777777-7777-4777-8777-777777777777';
  const row = () => page.locator('[data-inventory-item-id="55555555-5555-4555-8555-555555555555"]');
  try {
    for (const [i, name] of ['COUNT', 'TRANSFER', 'RETURN', 'RESTORE'].entries()) {
      await page.getByText('Inventory', { exact: true }).first().click();
      await row().getByRole('button', { name: i === 0 || i === 3 ? 'Adjust' : 'Transfer', exact: true }).click();
      const dialog = page.getByRole('dialog');
      if (i === 0 || i === 3) {
        await dialog.getByText('Location', { exact: true }).locator('..').locator('select').selectOption(source);
        await dialog.locator('input[type=number]').fill(i === 0 ? '2.125' : '2');
      } else {
        await dialog.getByText('From Location', { exact: true }).locator('..').locator('select').selectOption(i === 1 ? source : target);
        await dialog.getByText('To Location', { exact: true }).locator('..').locator('select').selectOption(i === 1 ? target : source);
        await dialog.locator('input[type=number]').fill('0.5');
      }
      await dialog.locator('textarea').fill('C1_SIMULATED_' + name);
      await dialog.getByRole('button', { name: i === 0 || i === 3 ? 'Save' : 'Transfer Stock', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(state.inventoryWrites.length, i + 1);
      assert.equal(state.auditRows.length, state.auditBaseline.length + i + 1);
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    await page.getByText('Inventory', { exact: true }).first().click();
    await row().getByRole('button', { name: 'History', exact: true }).click();
    const history = page.getByRole('dialog');
    for (const step of ['COUNT', 'TRANSFER', 'RETURN', 'RESTORE']) await history.getByText('C1_SIMULATED_' + step, { exact: false }).first().waitFor();
    assert.deepEqual(state.stockSlots.map(s => [s.qty, s.avg_cost_per_unit]), [[2, 0.1], [2, 0.1]]);
    assert.equal(state.inventoryMovements.length, 6);
    for (const id of [source, target]) assert.equal(state.inventoryMovements.filter(r => r.location_id === id).reduce((sum, r) => sum + r.qty_change, 0), 0);
    assert.deepEqual(state.auditRows.slice(0, state.auditBaseline.length), state.auditBaseline);
    assert.equal(state.cashMovements.length, 0); assert.deepEqual(errors, []); assert.deepEqual(state.blocked, []);
  } finally { await context.close(); }
});

test('SIMULATED HTTP C1: lost audit response after a confirmed transfer never replays stock or reports transfer failure', { timeout: 30000 }, async () => {
  const { context, page, state } = await isolated({ inventoryScenario: true, inventoryAuditFault: 'unknown' });
  try {
    await page.getByText('Inventory', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Transfer', exact: true }).first().click();
    const dialog = page.getByRole('dialog'); await dialog.locator('input[type=number]').fill('0.125');
    await dialog.getByRole('button', { name: 'Transfer Stock', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByText('Stock transferred, but its audit entry could not be confirmed. Check history before another transfer.', { exact: true }).waitFor();
    assert.equal(state.inventoryWrites.length, 1); assert.equal(state.auditRows.length, state.auditBaseline.length + 1);
    assert.deepEqual(state.stockSlots.map(s => s.qty), [1, 2.25]);
    assert.equal(await page.getByText('Unable to transfer stock.', { exact: true }).count(), 0);
  } finally { await context.close(); }
});

for (const quantity of [0.125,0.004]) test(`SIMULATED HTTP: purchase quantity ${quantity} survives order receipt and reload without premature completion`, { timeout: 30000 }, async () => {
  const { context,page,state,errors }=await isolated({purchaseScenario:true});
  try {
    await page.getByText('Purchases',{exact:true}).first().click();
    await page.getByRole('button',{name:'New Purchase',exact:true}).click();
    let dialog=page.getByRole('dialog');
    await dialog.locator('select').nth(1).selectOption('33333333-3333-4333-8333-333333333333');
    const orderQuantity=dialog.locator('input[type=number]').nth(0);
    assert.equal(await orderQuantity.getAttribute('step'),'0.001');
    await orderQuantity.fill('0.1251');
    await dialog.getByRole('button',{name:'Submit Order',exact:true}).click();
    await dialog.getByText('Stock quantities support up to 3 decimal places.',{exact:true}).waitFor();
    assert.equal(state.purchaseWrites.length,0);
    await orderQuantity.fill(String(quantity));
    await dialog.getByRole('button',{name:'Submit Order',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(state.purchaseWrites.length,1);assert.equal(state.purchaseWrites[0].p_items[0].qty,quantity);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByText('Purchases',{exact:true}).first().click();
    await page.getByText(/^PO-30001 ·/).click();
    await page.getByRole('button',{name:'Receive Items',exact:true}).click();
    dialog=page.getByRole('dialog',{name:'Receive — PO-30001',exact:true});
    const received=dialog.locator('input[type=number]');
    assert.equal(await received.count(),1);assert.equal(await received.inputValue(),String(quantity));
    assert.equal(await received.getAttribute('step'),'0.001');
    await received.fill('0.0001');
    await dialog.getByRole('button',{name:'Confirm Receipt',exact:true}).click();
    await dialog.getByText('Stock quantities support up to 3 decimal places.',{exact:true}).waitFor();
    assert.equal(state.purchaseReceipts.length,0);
    await received.fill(String(quantity));
    await dialog.getByRole('button',{name:'Confirm Receipt',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(state.purchaseReceipts.length,1);assert.equal(state.purchaseReceipts[0].p_receive_lines[0].qty,quantity);
    assert.equal(state.purchaseLines[0].received_qty,quantity);assert.equal(state.stock,1+quantity);
    assert.equal(state.purchaseOrders[0].status,'Received');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.getByText('Purchases',{exact:true}).first().click();
    await page.getByRole('button',{name:'All',exact:true}).click();
    await page.getByText(/^PO-30001 ·/).click();
    assert.equal(await page.getByRole('button',{name:'Receive Items',exact:true}).count(),0);
    assert.deepEqual(errors,[]);assert.deepEqual(state.blocked,[]);
  } finally {await context.close();}
});
