// Fail-closed preflight: password login + GETs only. No business RPC writes or password resets.
const PROJECT_REF = 'msinksoilkluooxenecy';
const TEST_HOST = PROJECT_REF + '.supabase.co';
const BINDINGS = [
  'QA_SUPABASE_URL', 'QA_SUPABASE_ANON_KEY',
  'QA_TWO_TENANT_A_EMAIL', 'QA_TWO_TENANT_A_PASSWORD',
  'QA_TWO_TENANT_B_EMAIL', 'QA_TWO_TENANT_B_PASSWORD',
];
const actors = [
  {label:'A', business:'d627563b-2ce4-491d-8cf6-141ef28d0f63', owner:'f37e9907-47c4-48bf-94b7-9a6fa5de1f88', product:'9efafd84-7f17-4de9-9c9a-1b962ab3e0bc'},
  {label:'B', business:'3849b750-20f7-4929-8699-737a4e1983c8', owner:'88eddcda-d8b5-4474-b5d7-19860dd97fba', product:'a4cac86d-038d-418e-b953-9a3605f2df18'},
];

class PreflightSignal extends Error {
  constructor(kind, code, detail = '') {
    super(detail);
    this.kind = kind;
    this.code = code;
    this.exitCode = kind === 'BLOCKED' ? 2 : 1;
  }
}
const blocked = (code, detail = '') => { throw new PreflightSignal('BLOCKED', code, detail); };
const failed = (code, detail = '') => { throw new PreflightSignal('FAIL', code, detail); };
const fixture = (condition, code) => { if (!condition) blocked(code); };
const verify = (condition, code) => { if (!condition) failed(code); };

function isPublicTestKey(value) {
  if (/^sb_publishable_[a-z0-9_-]+$/i.test(value)) return true;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return claims?.role === 'anon' && claims?.ref === PROJECT_REF;
  } catch {
    return false;
  }
}

async function main() {
  const missing = BINDINGS.filter((name) => !process.env[name]);
  if (missing.length) blocked('CONFIG_MISSING', 'configure ' + missing.join(', '));

  const rawUrl = String(process.env.QA_SUPABASE_URL || '').trim();
  let base;
  try { base = new URL(rawUrl); }
  catch { blocked('TARGET_CONFIG_INVALID'); }
  if (base.protocol !== 'https:' || base.hostname !== TEST_HOST || base.port || base.pathname !== '/'
      || base.username || base.password || base.search || base.hash || rawUrl.includes('?') || rawUrl.includes('#')) {
    blocked('TARGET_CONFIG_INVALID');
  }
  const key = String(process.env.QA_SUPABASE_ANON_KEY || '').trim();
  if (!isPublicTestKey(key)) blocked('PUBLIC_KEY_INVALID');

  async function request(path, token, body, stage) {
    let response;
    try {
      response = await fetch(new URL(path, base), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {apikey:key, 'Content-Type':'application/json', ...(token ? {Authorization:'Bearer ' + token} : {})},
        ...(body === undefined ? {} : {body:JSON.stringify(body)}),
        redirect:'error',
        signal:AbortSignal.timeout(20000),
      });
    } catch {
      blocked('NETWORK_' + stage);
    }
    if (response.status !== 200) {
      if (stage.startsWith('LOGIN_') && [400, 401, 403, 422].includes(response.status)) {
        blocked('AUTH_REJECTED_' + stage.slice(-1), 'HTTP ' + response.status);
      }
      if (response.status === 401) blocked('SESSION_REJECTED_' + stage, 'HTTP 401');
      if (response.status === 429 || response.status >= 500) blocked('SERVICE_UNAVAILABLE_' + stage, 'HTTP ' + response.status);
      failed('ENDPOINT_OR_PERMISSION_' + stage, 'HTTP ' + response.status);
    }
    try { return await response.json(); }
    catch { blocked('INVALID_RESPONSE_' + stage); }
  }

  try {
    for (const actor of actors) {
      const login = await request('/auth/v1/token?grant_type=password', null, {
        email:process.env['QA_TWO_TENANT_' + actor.label + '_EMAIL'],
        password:process.env['QA_TWO_TENANT_' + actor.label + '_PASSWORD'],
      }, 'LOGIN_' + actor.label);
      fixture(typeof login?.access_token === 'string' && login.access_token.length > 0, 'AUTH_TOKEN_MISSING_' + actor.label);
      actor.token = login.access_token;
      const user = await request('/auth/v1/user', actor.token, undefined, 'IDENTITY_' + actor.label);
      fixture(user?.id === actor.owner, 'IDENTITY_BINDING_MISMATCH_' + actor.label);
      const rows = await request('/rest/v1/users?select=id,business_id,role,active&id=eq.' + actor.owner, actor.token, undefined, 'PROFILE_' + actor.label);
      fixture(Array.isArray(rows) && rows.length === 1 && rows[0].id === actor.owner
        && rows[0].business_id === actor.business && rows[0].role === 'OWNER' && rows[0].active === true,
      'PROFILE_FIXTURE_' + actor.label);
      const business = await request('/rest/v1/rpc/current_business_id', actor.token, undefined, 'TENANT_CONTEXT_' + actor.label);
      verify(business === actor.business, 'TENANT_CONTEXT_MISMATCH_' + actor.label);
      console.log('PASS: OWNER ' + actor.label + ' identity, active role and business');
    }

    for (const actor of actors) {
      const other = actors.find((candidate) => candidate !== actor);
      const path = '/rest/v1/products?select=id,business_id,active&id=eq.' + actor.product;
      const own = await request(path, actor.token, undefined, 'PRODUCT_OWN_' + actor.label);
      fixture(Array.isArray(own) && own.length === 1 && own[0].id === actor.product
        && own[0].business_id === actor.business && own[0].active === true, 'FIXTURE_PRODUCT_' + actor.label);
      const foreign = await request(path, other.token, undefined, 'PRODUCT_FOREIGN_' + other.label);
      verify(Array.isArray(foreign) && foreign.length === 0, 'ISOLATION_PRODUCT_' + actor.label + '_TO_' + other.label);
      console.log('PASS: OWNER ' + actor.label + ' sees own active product and the other OWNER is denied');
    }

    const [a, b] = actors;
    for (const [table, id] of [
      ['suppliers', 'f85b4931-6877-4664-969d-0ba59fe4feff'],
      ['inventory_items', 'bb80c25b-5fd0-4716-8460-82202a2d74a9'],
      ['locations', 'a3e4b2ed-eb00-4963-afd0-38c256aff87d'],
    ]) {
      const path = '/rest/v1/' + table + '?select=id,business_id,active&id=eq.' + id;
      const own = await request(path, a.token, undefined, 'FIXTURE_' + table.toUpperCase());
      fixture(Array.isArray(own) && own.length === 1 && own[0].business_id === a.business && own[0].active === true,
        'FIXTURE_' + table.toUpperCase() + '_A');
      const foreign = await request(path, b.token, undefined, 'ISOLATION_' + table.toUpperCase());
      verify(Array.isArray(foreign) && foreign.length === 0, 'ISOLATION_' + table.toUpperCase() + '_A_TO_B');
      console.log('PASS: owned active ' + table + ' fixture and cross-company denial');
    }

    // These A/B read-only prerequisites are independent from the employee and
    // sale-item fixtures. Run them first so a later fixture blocker does not
    // hide evidence that can be collected safely.
    const stock = await request('/rest/v1/rpc/fn_read_inventory_stock_secure?select=qty&inventory_item_id=eq.bb80c25b-5fd0-4716-8460-82202a2d74a9&location_id=eq.a3e4b2ed-eb00-4963-afd0-38c256aff87d',
      a.token, undefined, 'STOCK_A');
    fixture(Array.isArray(stock) && stock.length === 1 && Number.isFinite(Number(stock[0].qty)) && Number(stock[0].qty) >= 1,
      'FIXTURE_STOCK_A');
    console.log('PASS: secure stock read and reversal prerequisite');

    const ownOrders = await request('/rest/v1/purchase_orders?select=id,business_id&business_id=eq.' + a.business
      + '&order=order_date.desc&limit=1', a.token, undefined, 'PURCHASE_A');
    fixture(Array.isArray(ownOrders) && ownOrders.length === 1 && typeof ownOrders[0].id === 'string'
      && ownOrders[0].business_id === a.business, 'FIXTURE_PURCHASE_A');
    const foreignOrder = await request('/rest/v1/purchase_orders?select=id,business_id&id=eq.' + ownOrders[0].id,
      b.token, undefined, 'PURCHASE_FOREIGN_B');
    verify(Array.isArray(foreignOrder) && foreignOrder.length === 0, 'ISOLATION_PURCHASE_A_TO_B');
    console.log('PASS: existing OWNER A purchase is visible to A and denied to B');

    // Sale items do not depend on the employee fixture. Check both tenants
    // before employee validation so one missing employee does not hide them.
    for (const actor of actors) {
      const other = actors.find((candidate) => candidate !== actor);
      const itemFacade = await request('/rest/v1/rpc/fn_read_sale_items_secure?select=id,sale_id&limit=1',
        actor.token, undefined, 'SALE_ITEM_FACADE_' + actor.label);
      fixture(Array.isArray(itemFacade) && itemFacade.length === 1
        && typeof itemFacade[0].id === 'string' && typeof itemFacade[0].sale_id === 'string',
      'FIXTURE_SALE_ITEM_' + actor.label);
      const parent = await request('/rest/v1/sales?select=id,business_id&id=eq.' + itemFacade[0].sale_id,
        actor.token, undefined, 'SALE_ITEM_PARENT_' + actor.label);
      verify(Array.isArray(parent) && parent.length === 1 && parent[0].business_id === actor.business,
        'SALE_ITEM_PARENT_SCOPE_' + actor.label);
      const itemPath = '/rest/v1/sale_items?select=id,sale_id&id=eq.' + itemFacade[0].id;
      const ownItem = await request(itemPath, actor.token, undefined, 'SALE_ITEM_DIRECT_' + actor.label);
      verify(Array.isArray(ownItem) && ownItem.length === 1
        && ownItem[0].id === itemFacade[0].id && ownItem[0].sale_id === itemFacade[0].sale_id,
      'AUTHENTICATED_GRANT_SALE_ITEMS_' + actor.label);
      const foreignItem = await request(itemPath, other.token, undefined, 'SALE_ITEM_FOREIGN_' + other.label);
      verify(Array.isArray(foreignItem) && foreignItem.length === 0,
        'ISOLATION_SALE_ITEMS_' + actor.label + '_TO_' + other.label);
      console.log('PASS: OWNER ' + actor.label + ' direct sale_items SELECT and cross-company denial');
    }

    for (const actor of actors) {
      const other = actors.find((candidate) => candidate !== actor);
      const employeeFacade = await request('/rest/v1/rpc/fn_read_employees_secure?select=id,business_id&business_id=eq.'
        + actor.business + '&limit=1', actor.token, undefined, 'EMPLOYEE_FACADE_' + actor.label);
      fixture(Array.isArray(employeeFacade) && employeeFacade.length === 1
        && employeeFacade[0].business_id === actor.business && typeof employeeFacade[0].id === 'string',
      'FIXTURE_EMPLOYEE_' + actor.label);
      const employeePath = '/rest/v1/employees?select=id,business_id&id=eq.' + employeeFacade[0].id;
      const ownEmployee = await request(employeePath, actor.token, undefined, 'EMPLOYEE_DIRECT_' + actor.label);
      verify(Array.isArray(ownEmployee) && ownEmployee.length === 1
        && ownEmployee[0].id === employeeFacade[0].id && ownEmployee[0].business_id === actor.business,
      'AUTHENTICATED_GRANT_EMPLOYEES_' + actor.label);
      const foreignEmployee = await request(employeePath, other.token, undefined, 'EMPLOYEE_FOREIGN_' + other.label);
      verify(Array.isArray(foreignEmployee) && foreignEmployee.length === 0,
        'ISOLATION_EMPLOYEES_' + actor.label + '_TO_' + other.label);
      console.log('PASS: OWNER ' + actor.label + ' direct employees SELECT and cross-company denial');
    }
    console.log('PREFLIGHT PASS [OK]: read-only checks complete; persistent purchase run remains separately gated.');
  } finally {
    for (const actor of actors) delete actor.token;
  }
}

try {
  await main();
} catch (error) {
  const signal = error instanceof PreflightSignal
    ? error
    : new PreflightSignal('FAIL', 'UNEXPECTED_CHECK_FAILURE');
  const detail = signal.message ? ': ' + signal.message : '';
  console.error('PREFLIGHT ' + signal.kind + ' [' + signal.code + ']' + detail + '. No credentials or payloads logged.');
  process.exitCode = signal.exitCode;
}
