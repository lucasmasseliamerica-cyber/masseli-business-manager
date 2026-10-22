import { createHash } from 'node:crypto';
import { PHOTO_HOST, PHOTO_ACTORS } from './photo-journey-core.mjs';

export const STOCK_HOST = PHOTO_HOST;
export const STOCK_ACTORS = PHOTO_ACTORS;
export const STOCK_PRECISION_TARGET_FINGERPRINT = '27bb16e1ab20acc78ef5bb2f25eb9c04';
export const STOCK_TABLES = Object.freeze(['inventory_items', 'inventory_stock', 'inventory_transactions', 'waste_transactions',
  'locations', 'product_recipes', 'purchase_orders', 'purchase_order_items', 'cash_flow', 'audit_logs']);
export const STOCK_FINGERPRINTS = Object.freeze({
  current_business_id: '8326e5f1bc2ecf720cb0aa3be9a0d0d6',
  user_can: '78e7ac15c93a208fdec8baf37e2b9c02',
  fn_adjust_inventory_count: 'ce5f2ab5348165439c90212c1f5f90ce',
  fn_record_waste: '185a854265f9f345b44c96ce31aa3485',
  fn_transfer_inventory: '220be0af82a92406b8f141ab3cb279d7',
  fn_record_inventory_movement: 'b5ac605f98d630ec318651bfb70eda63',
  fn_read_inventory_stock_secure: '57116f28b9ae161d5240058a34b8afa9',
  fn_read_inventory_transactions_secure: '7c7e3ab8797be57daa71574e59d0f553',
  fn_read_purchase_order_items_secure: 'de4aa1b81b87e33433ef3bbf1b072076',
});
export class StockSignal extends Error {
  constructor(code, status = 'BLOCKED') { super(code); this.code = code; this.status = status; }
}
export function requireStock(ok, code) { if (!ok) throw new StockSignal(code); }
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
const finite = value => value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value));
export const stockHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function stockConfiguration(env) {
  // Shared public-key/user configuration. Each runner must enforce its own mode/authorization.
  for (const name of ['QA_SUPABASE_URL', 'QA_SUPABASE_ANON_KEY', 'QA_TWO_TENANT_A_EMAIL', 'QA_TWO_TENANT_A_PASSWORD', 'QA_TWO_TENANT_B_EMAIL', 'QA_TWO_TENANT_B_PASSWORD']) {
    requireStock(typeof env[name] === 'string' && env[name].length > 0, 'C_SECURE_QA_CREDENTIALS_REQUIRED');
  }
  requireStock(env.QA_SUPABASE_URL === `https://${STOCK_HOST}`, 'C_TEST_TARGET_REQUIRED');
  const key = env.QA_SUPABASE_ANON_KEY;
  if (!/^sb_publishable_[a-z0-9_-]+$/i.test(key)) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')); } catch { /* deny below */ }
    requireStock(claims?.role === 'anon' && claims?.ref === STOCK_HOST.split('.')[0], 'C_PUBLIC_TEST_KEY_REQUIRED');
  }
  requireStock(env.QA_TWO_TENANT_A_EMAIL.trim().toLowerCase() !== env.QA_TWO_TENANT_B_EMAIL.trim().toLowerCase(), 'C_INDEPENDENT_OWNERS_REQUIRED');
  const ids = [env.QA_STOCK_ITEM_ID, env.QA_STOCK_SOURCE_LOCATION_ID, env.QA_STOCK_TARGET_LOCATION_ID];
  requireStock(ids.every(uuid) && new Set(ids).size === 3, 'C_EXPLICIT_DISTINCT_FIXTURES_REQUIRED');
  return { origin: `https://${STOCK_HOST}`, key, itemId: ids[0], sourceId: ids[1], targetId: ids[2] };
}
export function validateStockCatalog(input, now = Date.now()) {
  const root = Array.isArray(input) ? input[0] : input;
  const c = root?.stock_journey_preflight || root;
  requireStock(c?.project_ref_expected === STOCK_HOST.split('.')[0] && c.mode === 'READ_ONLY' && c.status === 'PASS_MATCHED_HISTORICAL_CONTRACTS', 'C_CATALOG_REQUIRED');
  requireStock(c.public_schema?.anon_create === false && c.public_schema?.authenticated_create === false, 'C_SCHEMA_CREATE_FORBIDDEN');
  const age = now - Date.parse(c.captured_at);
  requireStock(Number.isFinite(age) && age >= -60000 && age <= 24 * 3600000, 'C_CATALOG_EXPIRED');
  requireStock(Array.isArray(c.functions) && c.functions.length === Object.keys(STOCK_FINGERPRINTS).length, 'C_FUNCTION_CONTRACT_MISMATCH');
  for (const [name, hash] of Object.entries(STOCK_FINGERPRINTS)) {
    const rows = c.functions.filter(f => f.name === name);
    requireStock(rows.length === 1 && rows[0].present === true && (rows[0].fingerprint === hash || (name === 'fn_record_inventory_movement' && rows[0].fingerprint === STOCK_PRECISION_TARGET_FINGERPRINT)) && rows[0].anon_execute === false
      && rows[0].authenticated_execute === (name !== 'fn_record_inventory_movement'), 'C_FUNCTION_CONTRACT_MISMATCH');
  }
  requireStock(Array.isArray(c.tables) && c.tables.length === STOCK_TABLES.length && new Set(c.tables.map(t => t.name)).size === STOCK_TABLES.length
    && c.tables.every(t => STOCK_TABLES.includes(t.name) && t.present === true && t.rls === true && t.anon_select === false), 'C_TABLE_SECURITY_MISMATCH');
  return c;
}
export function validateStockFixture(s) {
  requireStock(s.item?.business_id === STOCK_ACTORS.A.business && s.item.active === true && uuid(s.item.id)
    && /^ZZ_QA_STOCK_C_[A-Z0-9_]+_EXCLUSIVE$/.test(s.item.name || '') && s.item.supplier_id == null, 'C_DEDICATED_UNUSED_ITEM_REQUIRED');
  requireStock(s.locations?.length === 2 && new Set(s.locations.map(l => l.id)).size === 2
    && s.locations.every(l => uuid(l.id) && l.business_id === STOCK_ACTORS.A.business && l.active === true
      && /^ZZ_QA_STOCK_C_[A-Z0-9_]+$/.test(l.name || '')), 'C_TWO_DEDICATED_ACTIVE_LOCATIONS_REQUIRED');
  for (const name of ['recipes', 'purchaseLines', 'transactions', 'waste']) {
    requireStock(Array.isArray(s[name]) && s[name].length === 0, 'C_EXISTING_DEPENDENCIES_OR_HISTORY');
  }
  requireStock(s.stocks?.length === 2 && new Set(s.stocks.map(p => p.location_id)).size === 2
    && s.stocks.every(p => uuid(p.id) && p.inventory_item_id === s.item.id && s.locations.some(l => l.id === p.location_id)
      && finite(p.qty) && Number(p.qty) >= 2 && Number(p.qty) <= 10
      && Math.abs(Number(p.qty) * 1000 - Math.round(Number(p.qty) * 1000)) < 1e-8
      && finite(p.avg_cost_per_unit) && Number(p.avg_cost_per_unit) > 0 && Number(p.avg_cost_per_unit) <= 1), 'C_SAFE_EXISTING_POSITIONS_REQUIRED');
  requireStock(Number(s.stocks[0].avg_cost_per_unit) === Number(s.stocks[1].avg_cost_per_unit), 'C_EQUAL_AVERAGE_COST_REQUIRED');
  requireStock(s.stocks.every(p => Math.abs(Number(p.avg_cost_per_unit) * 10000 - Math.round(Number(p.avg_cost_per_unit) * 10000)) < 1e-8), 'C_COST_PRECISION_REQUIRED');
  return { maxQuantityPerOperation: 0.5, createFixtures: false, deleteHistory: false, persistentAuthorized: false,
    allowedAfterSeparateAuthorization: ['adjust', 'transfer', 'reverse_transfer', 'restore_count'],
    wasteRequiresExplicitResidualHistoryAcceptance: true };
}
export function validateStockReadPath(path) {
  const url = new URL(path, `https://${STOCK_HOST}`);
  const allowed = new Set(['/auth/v1/user', ...['users', ...STOCK_TABLES].map(t => '/rest/v1/' + t),
    ...['current_business_id', 'user_can', 'fn_read_inventory_stock_secure', 'fn_read_inventory_transactions_secure', 'fn_read_purchase_order_items_secure'].map(f => '/rest/v1/rpc/' + f)]);
  requireStock(url.origin === `https://${STOCK_HOST}` && !url.username && !url.password && !url.hash && allowed.has(url.pathname), 'C_READONLY_PATH_REQUIRED');
  return url;
}
