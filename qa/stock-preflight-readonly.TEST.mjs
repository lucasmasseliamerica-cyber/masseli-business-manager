// C-Jornada gates only. No stock mutation, compensation, browser, checkpoint, or persistent mode.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { STOCK_ACTORS, STOCK_PRECISION_TARGET_FINGERPRINT, StockSignal, requireStock, stockConfiguration, validateStockCatalog,
  validateStockFixture, validateStockReadPath, stockHash } from './stock-journey-core.mjs';

export async function stockPreflight(env = process.env, args = process.argv.slice(2), fetchImpl = fetch) {
  const report = { scope: 'C_JOURNEY_AUTHENTICATED_READONLY_PREFLIGHT', status: 'BLOCKED', code: 'NOT_STARTED',
    checks: {}, stock_mutations: 0, fixtures_created: 0, checkpoints_modified: 0, persistent_authorized: false };
  const sessions = {};
  let config;
  try {
    requireStock(args.length === 0, 'C_READONLY_MODE_ONLY');
    config = stockConfiguration(env); // No reads/network before configuration validation.
    let raw;
    try { raw = JSON.parse(readFileSync(env.QA_STOCK_CATALOG_FILE, 'utf8')); } catch { throw new StockSignal('C_CATALOG_FILE_REQUIRED'); }
    const catalog = validateStockCatalog(raw); report.checks.catalog = 'PASS';
    report.backend_precision_guard = catalog.functions.find(f => f.name === 'fn_record_inventory_movement').fingerprint === STOCK_PRECISION_TARGET_FINGERPRINT ? 'REVIEWED_TARGET_PRESENT' : 'BLOCKED_PATCH_REVIEW_REQUIRED';
    const request = async (url, options) => {
      let response;
      try { response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) }); }
      catch { throw new StockSignal('C_READ_UNAVAILABLE'); }
      requireStock(response.ok, 'C_READ_REJECTED');
      try { return { response, data: await response.json() }; } catch { throw new StockSignal('C_READ_RESPONSE_INVALID'); }
    };
    const read = async (path, actor = 'A', denied = false) => {
      const url = validateStockReadPath(path);
      let result;
      try {
        result = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
          headers: { apikey: config.key, Prefer: 'count=exact', ...(actor === 'anon' ? {} : { Authorization: `Bearer ${sessions[actor].token}` }) } });
      } catch { throw new StockSignal('C_READ_UNAVAILABLE'); }
      if (denied && [401, 403].includes(result.status)) return [];
      requireStock(result.ok, 'C_READ_REJECTED');
      let data; try { data = await result.json(); } catch { throw new StockSignal('C_READ_RESPONSE_INVALID'); }
      if (Array.isArray(data)) {
        const count = Number((result.headers.get('content-range') || '').match(/\/(\d+)$/)?.[1] ?? NaN);
        requireStock(data.length < 1000 && Number.isFinite(count) && data.length === count, 'C_INCOMPLETE_READ');
      }
      return data;
    };
    for (const actor of ['A', 'B']) {
      const { data: login } = await request(config.origin + '/auth/v1/token?grant_type=password', { method: 'POST',
        headers: { apikey: config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: env[`QA_TWO_TENANT_${actor}_EMAIL`], password: env[`QA_TWO_TENANT_${actor}_PASSWORD`] }) });
      requireStock(typeof login.access_token === 'string' && login.access_token.length > 0, 'C_LOGIN_REJECTED');
      sessions[actor] = { token: login.access_token };
      const user = await read('/auth/v1/user', actor);
      const rows = await read(`/rest/v1/users?select=id,business_id,role,active&id=eq.${STOCK_ACTORS[actor].owner}`, actor);
      requireStock(user.id === STOCK_ACTORS[actor].owner && rows.length === 1 && rows[0].id === user.id
        && rows[0].business_id === STOCK_ACTORS[actor].business && rows[0].role === 'OWNER' && rows[0].active === true, 'C_OWNER_IDENTITY_MISMATCH');
      requireStock(await read('/rest/v1/rpc/current_business_id', actor) === STOCK_ACTORS[actor].business, 'C_TENANT_CONTEXT_MISMATCH');
    }
    report.checks.owner_a_b = 'PASS';
    for (const actor of ['A', 'B']) for (const permission of ['adjustInventory', 'manageInventory', 'viewFinancials']) {
      requireStock(await read('/rest/v1/rpc/user_can?p_permission_key=' + permission, actor) === true, 'C_PERMISSION_REQUIRED');
    }
    report.checks.permissions = 'PASS';
    const items = await read(`/rest/v1/inventory_items?select=*&id=eq.${config.itemId}`);
    requireStock(items.length === 1, 'C_ITEM_FIXTURE_REQUIRED');
    const fixture = { item: items[0],
      locations: await read(`/rest/v1/locations?select=*&id=in.(${config.sourceId},${config.targetId})`),
      stocks: await read(`/rest/v1/rpc/fn_read_inventory_stock_secure?select=*&inventory_item_id=eq.${config.itemId}`),
      transactions: await read(`/rest/v1/rpc/fn_read_inventory_transactions_secure?select=id&inventory_item_id=eq.${config.itemId}`),
      recipes: await read(`/rest/v1/product_recipes?select=id&inventory_item_id=eq.${config.itemId}`),
      purchaseLines: await read(`/rest/v1/rpc/fn_read_purchase_order_items_secure?select=id&inventory_item_id=eq.${config.itemId}`),
      waste: await read(`/rest/v1/rpc/fn_read_waste_transactions_secure?select=id&inventory_item_id=eq.${config.itemId}`) };
    validateStockFixture(fixture); report.checks.dedicated_fixture = 'PASS';
    for (const actor of ['B', 'anon']) for (const table of ['inventory_items', 'rpc/fn_read_inventory_stock_secure', 'rpc/fn_read_inventory_transactions_secure', 'rpc/fn_read_waste_transactions_secure']) {
      const filter = table === 'inventory_items' ? 'id' : 'inventory_item_id';
      const rows = await read(`/rest/v1/${table}?select=id&${filter}=eq.${config.itemId}`, actor, true);
      requireStock(Array.isArray(rows) && rows.length === 0, 'C_CROSS_TENANT_READ');
    }
    report.checks.read_isolation = 'PASS';
    report.fixture_fingerprint = stockHash(fixture); // No fixture IDs, names, costs, rows or private paths in output.
    report.status = 'PASS'; report.code = 'C_READONLY_GATES_PASS_PERSISTENCE_NOT_AUTHORIZED';
    report.exclusive_window = 'NOT_RESERVED_BY_READONLY_PREFLIGHT';
    report.compensation = 'EQUAL_COST_PRECONDITION_CHECKED_NOT_EXECUTED';
    report.waste_scope = 'BLOCKED_PENDING_EXPLICIT_HISTORY_ACCEPTANCE';
  } catch (error) {
    report.status = 'BLOCKED'; report.code = error instanceof StockSignal ? error.code : 'C_PREFLIGHT_UNCONFIRMED';
  } finally {
    // Local logout affects only temporary sessions created here. Never use global sign-out.
    if (config) for (const actor of Object.keys(sessions)) {
      try { await fetchImpl(config.origin + '/auth/v1/logout?scope=local', { method: 'POST', redirect: 'error',
        headers: { apikey: config.key, Authorization: `Bearer ${sessions[actor].token}` }, signal: AbortSignal.timeout(10000) }); } catch { /* no secret-bearing output */ }
    }
  }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await stockPreflight(); console.log(JSON.stringify(report, null, 2)); process.exitCode = report.status === 'PASS' ? 0 : 2;
}
