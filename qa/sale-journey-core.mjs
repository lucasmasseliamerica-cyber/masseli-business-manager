import { createHash } from 'node:crypto';
import { PHOTO_HOST, PHOTO_ACTORS } from './photo-journey-core.mjs';

export const SALE_HOST = PHOTO_HOST;
export const SALE_ACTORS = PHOTO_ACTORS;
export const SALE_LIMIT_CENTS = 100;
export const SALE_TABLES = Object.freeze(['sales','sale_items','products','product_recipes','inventory_items','inventory_stock',
  'inventory_transactions','cash_flow','cash_registers','businesses','locations','business_settings_lists','audit_logs']);
// Post-cutover helpers: exact canonical definitions from 20261016_platform_admin_TEST.sql.
// Historical pre-cutover/rollback hashes remain in those artifacts, not this runtime baseline.
export const SALE_FINGERPRINTS = Object.freeze({
  current_business_id: '8326e5f1bc2ecf720cb0aa3be9a0d0d6',
  user_can: '78e7ac15c93a208fdec8baf37e2b9c02',
  fn_create_sale: 'aabbddc8a9c4a37a171b8a269e9c3139',
  fn_reverse_sale: 'ce3f22be25a16639e7b14155fa9452a0',
  fn_read_inventory_stock_secure: '57116f28b9ae161d5240058a34b8afa9',
  fn_read_inventory_transactions_secure: '7c7e3ab8797be57daa71574e59d0f553',
  fn_next_order_no: '143dc0404b1e7710598030e5f4755bfa',
  fn_record_inventory_movement: 'b5ac605f98d630ec318651bfb70eda63',
});
export const SALE_INTERNAL_FUNCTIONS = new Set(['fn_next_order_no','fn_record_inventory_movement']);
export class SaleSignal extends Error {
  constructor(code, status = 'BLOCKED') { super(code); this.code = code; this.status = status; }
}
export const requireSale = (ok, code, status) => { if (!ok) throw new SaleSignal(code, status); };
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
export const saleHash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const saleCents = value => Math.round((Number(value) + Number.EPSILON) * 100);
export function saleConfiguration(env) {
  requireSale(env.QA_SALE_JOURNEY_AUTHORIZED === 'TEST_ONLY_EXPLICIT', 'SALE_AUTHORIZATION_REQUIRED');
  requireSale(env.QA_SALE_EXCLUSIVE_WINDOW === 'TEST_ONLY_EXCLUSIVE_WINDOW', 'EXCLUSIVE_SALE_WINDOW_REQUIRED');
  for (const name of ['QA_SUPABASE_URL', 'QA_SUPABASE_ANON_KEY', 'QA_TWO_TENANT_A_EMAIL', 'QA_TWO_TENANT_A_PASSWORD', 'QA_TWO_TENANT_B_EMAIL', 'QA_TWO_TENANT_B_PASSWORD']) {
    requireSale(typeof env[name] === 'string' && env[name].length > 0, 'SECURE_QA_CREDENTIALS_REQUIRED');
  }
  requireSale(env.QA_SUPABASE_URL.replace(/\/$/, '') === `https://${SALE_HOST}`, 'SALE_TEST_TARGET_REQUIRED');
  const key = env.QA_SUPABASE_ANON_KEY;
  if (!/^sb_publishable_[a-z0-9_-]+$/i.test(key)) {
    let claims; try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')); } catch { /* fail below */ }
    requireSale(claims?.role === 'anon' && claims?.ref === SALE_HOST.split('.')[0], 'PUBLIC_TEST_KEY_REQUIRED');
  }
  requireSale(env.QA_TWO_TENANT_A_EMAIL.toLowerCase() !== env.QA_TWO_TENANT_B_EMAIL.toLowerCase(), 'INDEPENDENT_QA_USERS_REQUIRED');
  requireSale(uuid(env.QA_SALE_PRODUCT_ID) && uuid(env.QA_SALE_LOCATION_ID), 'EXPLICIT_QA_PRODUCT_AND_LOCATION_REQUIRED');
  return { origin: `https://${SALE_HOST}`, key, productId: env.QA_SALE_PRODUCT_ID, locationId: env.QA_SALE_LOCATION_ID };
}
export function validateSaleCatalog(input, now = Date.now()) {
  const outer = Array.isArray(input) ? input[0] : input;
  const catalog = outer?.sale_journey_preflight || outer;
  requireSale(catalog?.project_ref_expected === SALE_HOST.split('.')[0] && catalog.status === 'PASS_VERSIONED_CONTRACTS', 'SALE_CATALOG_PREFLIGHT_REQUIRED');
  const age = now - Date.parse(catalog.captured_at);
  requireSale(Number.isFinite(age) && age >= -60000 && age <= 24 * 3600000, 'SALE_CATALOG_PREFLIGHT_EXPIRED');
  for (const [name, fingerprint] of Object.entries(SALE_FINGERPRINTS)) {
    const matches = catalog.functions?.filter(row => row.name === name);
    requireSale(matches?.length === 1 && matches[0].fingerprint === fingerprint && matches[0].anon_execute === false
      && matches[0].authenticated_execute === !SALE_INTERNAL_FUNCTIONS.has(name), 'SALE_FUNCTION_DRIFT_OR_GRANT_MISMATCH');
  }
  requireSale(catalog.tables?.length === SALE_TABLES.length && new Set(catalog.tables.map(row=>row.name)).size===SALE_TABLES.length
    && catalog.tables.every(row => SALE_TABLES.includes(row.name) && row.present === true && row.rls === true && row.anon_select === false), 'SALE_TABLE_SECURITY_MISMATCH');
  return catalog;
}
export function validateSaleFixture(s) {
  requireSale(uuid(s.runId) && s.business?.id === SALE_ACTORS.A.business && s.business.currency === 'USD', 'USD_QA_BUSINESS_REQUIRED');
  requireSale(s.product?.business_id === s.business.id && /^ZZ_QA_[A-Z0-9_]+$/.test(s.product.name || '') && s.product.active === true, 'DEDICATED_SALE_FIXTURE_REQUIRED');
  const price = Number(s.product.price);
  requireSale(uuid(s.product.id) && Number.isFinite(price) && price > 0 && price <= 1 && Math.abs(price * 100 - saleCents(price)) < 1e-8, 'SALE_FIXTURE_PRICE_OUTSIDE_USD_LIMIT');
  requireSale(s.location?.business_id === s.business.id && s.location.active === true && uuid(s.location.id), 'ACTIVE_QA_LOCATION_REQUIRED');
  requireSale(Array.isArray(s.salesHistory) && s.salesHistory.length === 0, 'SALE_FIXTURE_HAS_HISTORY');
  requireSale(Array.isArray(s.recipes) && s.recipes.length > 0 && s.recipes.length <= 3, 'SALE_FIXTURE_RECIPE_REQUIRED');
  const seen = new Set();
  for (const recipe of s.recipes) {
    const item = s.inventoryItems.find(item => item.id === recipe.inventory_item_id);
    const stock = s.stocks.find(stock => stock.inventory_item_id === item?.id && stock.location_id === s.location.id);
    const qty = Number(recipe.qty_per_unit);
    requireSale(recipe.product_id === s.product.id && !seen.has(recipe.inventory_item_id) && item?.active === true
      && item.business_id === s.business.id && /^ZZ_QA_[A-Z0-9_]+$/.test(item.name || '') && Number.isFinite(qty) && qty > 0 && qty <= 1,
      'EXCLUSIVE_QA_INGREDIENT_REQUIRED');
    requireSale(Math.abs(qty*1000-Math.round(qty*1000))<1e-8,'RECIPE_EXCEEDS_DEPLOYED_STOCK_PRECISION');
    requireSale(stock && Number.isFinite(Number(stock.qty)) && Number(stock.qty) > qty
      && Number.isFinite(Number(stock.avg_cost_per_unit)) && Number(stock.avg_cost_per_unit) > 0, 'SAFE_STOCK_AND_COST_REQUIRED');
    const usage = s.recipeUsage.filter(row => row.inventory_item_id === item.id);
    requireSale(usage.length === 1 && usage[0].product_id === s.product.id, 'INGREDIENT_USED_BY_ANOTHER_PRODUCT');
    seen.add(item.id);
  }
  requireSale(Array.isArray(s.purchaseLines) && s.purchaseLines.length === 0, 'INGREDIENT_HAS_PURCHASE_DEPENDENCIES');
  const methods = s.lists.filter(row => row.list_type === 'payment_methods').map(row => row.value);
  const channels = s.lists.filter(row => row.list_type === 'channels').map(row => row.value);
  requireSale(methods.includes('Other') && channels.length > 0, 'EXISTING_OTHER_PAYMENT_AND_CHANNEL_REQUIRED');
  const taxRate = s.business.tax_enabled === false ? 0 : Number(s.business.tax_rate);
  requireSale(Number.isFinite(taxRate) && taxRate >= 0 && taxRate <= 100, 'INVALID_BUSINESS_TAX');
  const discount = price >= 0.02 ? 0.01 : 0;
  const tax = saleCents((price - discount) * taxRate / 100) / 100;
  const totalCents = saleCents(price - discount + tax);
  requireSale(totalCents > 0 && totalCents <= SALE_LIMIT_CENTS, 'SALE_TOTAL_EXCEEDS_USD_ONE');
  return { discount, tax, totalCents, channel: channels[0], paymentMethod: 'Other', note: `NEXALVO_B_JOURNEY_${s.runId}` };
}
export function validateSalePayload(p, s) {
  const e = s.expected;
  requireSale(uuid(p.p_sale_id) && p.p_business_id === SALE_ACTORS.A.business && p.p_location_id === s.location.id, 'SALE_WRITE_OUTSIDE_SCOPE');
  requireSale(p.p_payment_method === 'Other' && p.p_channel === e.channel && p.p_notes === e.note
    && p.p_employee_id === null && p.p_customer_id === null && ['Received', 'Completed'].includes(p.p_fulfillment_status), 'SALE_TERMS_OUTSIDE_SCOPE');
  requireSale(p.p_discount === e.discount && p.p_tax === e.tax && Array.isArray(p.p_items) && p.p_items.length === 1
    && p.p_items[0].product_id === s.product.id && p.p_items[0].qty === 1 && p.p_items[0].unit_price === Number(s.product.price), 'SALE_VALUE_OR_ITEM_OUTSIDE_SCOPE');
  requireSale(!s.saleId || s.saleId === p.p_sale_id, 'SECOND_SALE_ID_FORBIDDEN');
  requireSale(!s.salePayload || saleHash(p) === saleHash(s.salePayload), 'CHANGED_REPLAY_PAYLOAD_FORBIDDEN');
}
export function assertSaleObserved(view, s, cancelled = false) {
  requireSale(view.sales.length === 1 && view.sales[0].id === s.saleId, 'SALE_NOT_POSITIVELY_OBSERVED');
  const row = view.sales[0];
  requireSale(row.business_id === s.business.id && row.location_id === s.location.id && row.payment_method === 'Other'
    && row.notes === s.expected.note && row.channel === s.expected.channel && Number(row.total) <= 1
    && Math.abs(Number(row.total) - s.expected.totalCents / 100) < 1e-8
    && Math.abs(Number(row.subtotal) - Number(s.product.price)) < 1e-8 && Math.abs(Number(row.discount) - s.expected.discount) < 1e-8
    && Math.abs(Number(row.tax) - s.expected.tax) < 1e-8 && Number.isFinite(Number(row.total)), 'SALE_OBSERVED_TERMS_MISMATCH');
  requireSale(cancelled ? row.status === 'cancelled' && !!row.cancelled_at : row.status === 'completed', 'SALE_STATUS_UNCONFIRMED');
  requireSale(view.items.length === 1 && view.items[0].product_id === s.product.id && view.items[0].sale_id === s.saleId
    && Number(view.items[0].qty) === 1 && Math.abs(Number(view.items[0].unit_price) - Number(s.product.price)) < 1e-8, 'SALE_ITEMS_DUPLICATED_OR_CHANGED');
  const income = view.cash.filter(row => row.type === 'income'), refund = view.cash.filter(row => row.type === 'expense');
  requireSale(view.cash.length === (cancelled ? 2 : 1) && income.length === 1 && refund.length === (cancelled ? 1 : 0), 'SALE_FINANCIAL_DUPLICATE_OR_MISSING');
  requireSale(view.cash.every(row => row.business_id === s.business.id && row.location_id === s.location.id && row.sale_id === s.saleId
    && row.payment_method === 'Other' && Number.isFinite(Number(row.amount)) && Math.abs(Number(row.amount) - s.expected.totalCents / 100) < 1e-8
    && row.related_cash_register_id == null), 'SALE_FINANCIAL_SCOPE_OR_AMOUNT_MISMATCH');
  requireSale(!cancelled || refund[0].category === 'Sale Cancellation', 'SALE_REFUND_CATEGORY_MISMATCH');
  for (const original of s.stocks) {
    const current = view.stocks.find(row => row.id === original.id);
    const recipe = s.recipes.find(row => row.inventory_item_id === original.inventory_item_id);
    const consumed = original.location_id === s.location.id && !cancelled ? Number(recipe?.qty_per_unit || 0) : 0;
    requireSale(current && Number.isFinite(Number(current.qty)) && Math.abs(Number(current.qty) - (Number(original.qty) - consumed)) < 1e-8, 'SALE_STOCK_RECONCILIATION_FAILED');
    requireSale(Number.isFinite(Number(current.avg_cost_per_unit)) && Math.abs(Number(current.avg_cost_per_unit) - Number(original.avg_cost_per_unit)) < 1e-8, 'AVERAGE_COST_RECONCILIATION_FAILED');
  }
  requireSale(view.stocks.length === s.stocks.length, 'UNEXPECTED_STOCK_POSITION');
  requireSale(view.movements.length === s.recipes.length * (cancelled ? 2 : 1), 'SALE_STOCK_MOVEMENT_COUNT_MISMATCH');
  for (const recipe of s.recipes) {
    const movements = view.movements.filter(row => row.inventory_item_id === recipe.inventory_item_id);
    const saleIds = movements.filter(row => row.type === 'SALE' && row.sale_id === s.saleId).map(row => row.id);
    requireSale(movements.every(row => row.business_id === s.business.id && row.location_id === s.location.id
      && (row.sale_id === s.saleId || row.type === 'REVERSAL' && saleIds.includes(row.related_transaction_id))), 'SALE_MOVEMENT_SCOPE_MISMATCH');
    requireSale(movements.filter(row => row.type === 'SALE').length === 1 && movements.filter(row => row.type === 'REVERSAL').length === (cancelled ? 1 : 0), 'SALE_MOVEMENT_TYPE_MISMATCH');
    requireSale(movements.every(row => Number.isFinite(Number(row.qty_change))
      && Math.abs(Number(row.qty_change) - (row.type === 'SALE' ? -1 : 1) * Number(recipe.qty_per_unit)) < 1e-8), 'SALE_MOVEMENT_QUANTITY_MISMATCH');
    requireSale(Math.abs(movements.reduce((sum, row) => sum + Number(row.qty_change), 0) - (cancelled ? 0 : -Number(recipe.qty_per_unit))) < 1e-8, 'SALE_MOVEMENT_QUANTITY_MISMATCH');
  }
  return true;
}
export function safeSaleReport(report) {
  requireSale(!/Bearer\s|eyJ[A-Za-z0-9_-]{16,}\.|[?&]token=|@|sb_secret_|service_role|storage:\/\//i.test(JSON.stringify(report)), 'SALE_REPORT_CONTAINS_SENSITIVE_DATA');
  return report;
}
