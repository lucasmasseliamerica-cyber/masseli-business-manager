// Public key + independent user sessions only. No administrative fallback, retries or arbitrary writes.
import { STOCK_HOST, STOCK_ACTORS, StockSignal, requireStock, validateStockReadPath } from './stock-journey-core.mjs';
import { C1_FIXTURE, c1Plan } from './stock-c1-protocol.mjs';

export async function openC1Client(config, env, fetchImpl = fetch) {
  const sessions = {};
  const headers = actor => ({ apikey: config.key, Prefer: 'count=exact',
    ...(actor === 'anon' ? (config.key.startsWith('eyJ') ? { Authorization: `Bearer ${config.key}` } : {}) : { Authorization: `Bearer ${sessions[actor]?.access_token}` }) });
  const request = async (path, actor, method = 'GET', body, denied = false) => {
    const url = new URL(path, `https://${STOCK_HOST}`);
    requireStock(url.origin === config.origin && !url.username && !url.password && !url.hash, 'C1_TEST_TARGET_REQUIRED');
    let response, data;
    try { response = await fetchImpl(url, { method, redirect: 'error', headers: { ...headers(actor), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) }); }
    catch { throw new StockSignal(method === 'GET' ? 'C1_READ_UNAVAILABLE' : 'C1_RESULT_UNKNOWN_READONLY_RECOVERY_REQUIRED'); }
    try { data = response.status === 204 ? null : await response.json(); } catch { throw new StockSignal('C1_RESPONSE_UNCONFIRMED'); }
    if (response.ok && Array.isArray(data)) {
      const count = Number((response.headers.get('content-range') || '').match(/\/(\d+)$/)?.[1] ?? NaN);
      requireStock(data.length < 1000 && Number.isFinite(count) && count === data.length, 'C1_INCOMPLETE_READ');
    }
    if (denied) return { ok: response.ok, status: response.status, data };
    requireStock(response.ok, 'C1_AUTH_OR_READ_REJECTED');
    return data;
  };
  const read = (path, actor = 'A', denied = false) => { validateStockReadPath(path); return request(path, actor, 'GET', undefined, denied); };
  const close = async () => {
    for (const actor of Object.keys(sessions)) {
      try { await request('/auth/v1/logout?scope=local', actor, 'POST'); } catch { /* never print response or secrets */ }
      delete sessions[actor];
    }
  };
  try {
    for (const actor of ['A', 'B']) {
      const login = await request('/auth/v1/token?grant_type=password', 'anon', 'POST', {
        email: env[`QA_TWO_TENANT_${actor}_EMAIL`], password: env[`QA_TWO_TENANT_${actor}_PASSWORD`] });
      requireStock(typeof login.access_token === 'string' && login.access_token.length > 0, 'C1_LOGIN_REJECTED');
      sessions[actor] = login;
      const user = await read('/auth/v1/user', actor);
      const rows = await read(`/rest/v1/users?select=id,business_id,role,active&id=eq.${STOCK_ACTORS[actor].owner}`, actor);
      requireStock(user.id === STOCK_ACTORS[actor].owner && rows.length === 1 && rows[0].id === user.id && rows[0].active === true
        && rows[0].role === 'OWNER' && rows[0].business_id === STOCK_ACTORS[actor].business
        && await read('/rest/v1/rpc/current_business_id', actor) === STOCK_ACTORS[actor].business, 'C1_OWNER_OR_TENANT_MISMATCH');
      for (const permission of ['adjustInventory', 'manageInventory', 'viewFinancials'])
        requireStock(await read('/rest/v1/rpc/user_can?p_permission_key=' + permission, actor) === true, 'C1_OWNER_PERMISSION_REQUIRED');
    }
  } catch (error) { await close(); throw error; }
  return {
    read, close,
    browserSession: () => ({ token: sessions.A.access_token, user: { id: sessions.A.user?.id || STOCK_ACTORS.A.owner,
      app_metadata: sessions.A.user?.app_metadata || {} } }),
    async view() {
      const rows = await read(`/rest/v1/inventory_items?select=*&id=eq.${C1_FIXTURE.item}`);
      requireStock(rows.length === 1, 'C1_ITEM_MISSING');
      return { item: rows[0],
        locations: await read(`/rest/v1/locations?select=*&id=in.(${C1_FIXTURE.source},${C1_FIXTURE.target})`),
        stocks: await read(`/rest/v1/rpc/fn_read_inventory_stock_secure?select=*&inventory_item_id=eq.${C1_FIXTURE.item}`),
        transactions: await read(`/rest/v1/rpc/fn_read_inventory_transactions_secure?select=*&inventory_item_id=eq.${C1_FIXTURE.item}`),
        recipes: await read(`/rest/v1/product_recipes?select=*&inventory_item_id=eq.${C1_FIXTURE.item}`),
        purchaseLines: await read(`/rest/v1/rpc/fn_read_purchase_order_items_secure?select=*&inventory_item_id=eq.${C1_FIXTURE.item}`),
        waste: await read(`/rest/v1/waste_transactions?select=*&inventory_item_id=eq.${C1_FIXTURE.item}`),
        audit: await read(`/rest/v1/audit_logs?select=*&business_id=eq.${STOCK_ACTORS.A.business}&details=like.${C1_FIXTURE.name}*`) };
    },
    async isolation() {
      for (const actor of ['B', 'anon']) for (const table of ['inventory_items', 'rpc/fn_read_inventory_stock_secure', 'rpc/fn_read_inventory_transactions_secure', 'waste_transactions']) {
        const filter = table === 'inventory_items' ? 'id' : 'inventory_item_id';
        const r = await read(`/rest/v1/${table}?select=id&${filter}=eq.${C1_FIXTURE.item}`, actor, true);
        requireStock(r.ok ? Array.isArray(r.data) && r.data.length === 0 : [401, 403].includes(r.status), 'C1_READ_ISOLATION_FAILED');
      }
    },
    // The caller must durably record each probe first. Exact reviewed function rejects tenant B
    // before INSERT/locks; anon lacks EXECUTE. No generic mutation API is exposed.
    async negativeProbe(actor, state) {
      requireStock(['B', 'anon'].includes(actor) && state.pending === 'PROBE_' + actor && state.confirmed === 0, 'C1_PROBE_SCOPE_REQUIRED');
      const payload = c1Plan(state)[0].payload;
      const r = await request('/rest/v1/rpc/fn_adjust_inventory_count', actor, 'POST', payload, true);
      requireStock(!r.ok && (actor === 'B' ? r.status === 400 && r.data?.code === 'P0001' && r.data?.message === 'business_id mismatch' : [401, 403].includes(r.status)), 'C1_NEGATIVE_WRITE_NOT_PROVEN_DENIED');
    },
  };
}
