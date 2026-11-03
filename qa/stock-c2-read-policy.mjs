// Every forwarded DB path is covered by the reviewed stock/security catalog.
// Auxiliary UI areas are explicitly denied, never filled with synthetic data in a real run.
import { STOCK_HOST } from './stock-journey-core.mjs';
import { need } from './stock-c2-protocol.mjs';
const tables = new Set(['users', 'businesses', 'locations', 'inventory_items', 'product_recipes', 'audit_logs', 'purchase_orders', 'cash_flow']);
const readers = new Set(['current_business_id', 'user_can', 'fn_session_access_status', 'fn_read_inventory_stock_secure',
  'fn_read_inventory_transactions_secure', 'fn_read_purchase_order_items_secure', 'fn_read_waste_transactions_secure']);
const outside = new Set(['products','business_settings_lists','sales','suppliers','customers','loyalty_transactions','loyalty_rewards',
  'expenses','cash_registers','purchase_order_payments','tasks','task_activity','shifts','shift_breaks','business_alerts',
  'rpc/fn_read_employees_secure','rpc/fn_read_sale_items_secure']);
const columns = {
  "users": [
    "id",
    "business_id",
    "employee_id",
    "name",
    "username",
    "role",
    "permission_overrides",
    "active",
    "created_at",
    "updated_at"
  ],
  "businesses": [
    "id",
    "name",
    "currency",
    "tax_rate",
    "tax_enabled",
    "allow_negative_inventory",
    "timezone",
    "created_at",
    "updated_at",
    "platform_status",
    "license_type",
    "license_granted_at",
    "license_granted_by",
    "license_revoked_at",
    "license_revoked_by",
    "platform_updated_at"
  ],
  "locations": [
    "id",
    "business_id",
    "name",
    "type",
    "active",
    "created_at",
    "updated_at"
  ],
  "inventory_items": [
    "id",
    "business_id",
    "name",
    "sku",
    "category",
    "unit",
    "min_qty",
    "max_qty",
    "supplier_id",
    "expires_at",
    "notes",
    "active",
    "created_at",
    "updated_at"
  ],
  "product_recipes": [
    "id",
    "product_id",
    "inventory_item_id",
    "qty_per_unit"
  ],
  "audit_logs": [
    "id",
    "business_id",
    "user_id",
    "user_name_snapshot",
    "role_snapshot",
    "action",
    "details",
    "occurred_at"
  ],
  "purchase_orders": [
    "id",
    "business_id",
    "po_number",
    "supplier_id",
    "location_id",
    "order_date",
    "expected_date",
    "status",
    "payment_method",
    "notes",
    "discount",
    "tax",
    "reversed_at",
    "reversed_by",
    "created_by",
    "created_at",
    "updated_at"
  ],
  "cash_flow": [
    "id",
    "business_id",
    "location_id",
    "transaction_date",
    "type",
    "category",
    "amount",
    "payment_method",
    "description",
    "sale_id",
    "expense_id",
    "purchase_order_payment_id",
    "reversal_of",
    "status",
    "created_by",
    "created_at",
    "related_cash_register_id"
  ],
  "inventory_stock": [
    "id",
    "inventory_item_id",
    "location_id",
    "qty",
    "avg_cost_per_unit",
    "last_purchase_cost",
    "last_purchase_date",
    "created_at",
    "updated_at"
  ],
  "inventory_transactions": [
    "id",
    "business_id",
    "inventory_item_id",
    "location_id",
    "type",
    "qty_change",
    "unit",
    "unit_cost",
    "total_cost",
    "sale_id",
    "purchase_order_id",
    "related_transaction_id",
    "prev_avg_cost",
    "new_avg_cost",
    "note",
    "created_by",
    "created_at"
  ],
  "purchase_order_items": [
    "id",
    "purchase_order_id",
    "inventory_item_id",
    "qty_ordered",
    "unit",
    "unit_cost",
    "received_qty"
  ],
  "waste_transactions": [
    "id",
    "business_id",
    "inventory_item_id",
    "location_id",
    "qty",
    "unit",
    "reason",
    "cost",
    "notes",
    "inventory_transaction_id",
    "created_by",
    "created_at"
  ]
};
const readerTables={fn_read_inventory_stock_secure:"inventory_stock",fn_read_inventory_transactions_secure:"inventory_transactions",fn_read_purchase_order_items_secure:"purchase_order_items",fn_read_waste_transactions_secure:"waste_transactions"};
const key = /^[a-z_][a-z0-9_]*$/;
export function c2ReadDecision(url, method) {
  need(url.origin === `https://${STOCK_HOST}` && !url.username && !url.password && !url.hash, 'READ_TARGET_REJECTED');
  need(['GET', 'HEAD', 'OPTIONS'].includes(method), 'READ_METHOD_REJECTED');
  if (url.pathname === '/auth/v1/user' && !url.search) return 'ALLOW';
  const resource = url.pathname.replace(/^\/rest\/v1\//, '');
  if (url.pathname !== '/rest/v1/' + resource) return 'REJECT';
  if (outside.has(resource)) return 'DENY_AUXILIARY';
  const rpc = resource.startsWith('rpc/') ? resource.slice(4) : null;
  if (method === 'OPTIONS' && ['fn_record_waste','fn_write_audit','fn_session_access_status'].includes(rpc) && !url.search) return 'ALLOW';
  if (!(tables.has(resource) || readers.has(rpc))) return 'REJECT';
  const fields=new Set(columns[readerTables[rpc]||resource]||[]);
  const seen = new Set();
  for (const [name, value] of url.searchParams) {
    need(!seen.has(name), 'DUPLICATE_READ_PARAMETER'); seen.add(name);
    if (name === 'select') need(value === '*' || value.split(',').every(v => fields.has(v)), 'READ_PROJECTION_REJECTED');
    else if (name === 'order') need(/^[a-z0-9_.,]+$/i.test(value) && value.split(',').every(v=>fields.has(v.split('.')[0])), 'READ_ORDER_REJECTED');
    else if (['offset','limit'].includes(name)) need(/^\d{1,6}$/.test(value), 'READ_RANGE_REJECTED');
    else if (name === 'p_permission_key' && rpc === 'user_can') need(['manageInventory','manageRecipesAndCosts','viewFinancials','viewReports'].includes(value), 'READ_PERMISSION_REJECTED');
    else need(fields.has(name) && !name.startsWith('p_') && /^(?:eq\.[a-z0-9_-]+|in\.\([a-z0-9_,-]+\)|like\.[a-z0-9_*.-]+|is\.null)$/i.test(value), 'READ_FILTER_REJECTED');
  }
  // Read helpers cannot accept caller-controlled SQL/function arguments.
  if (['current_business_id','fn_session_access_status'].includes(rpc)) need(seen.size === 0, 'READ_ARGUMENTS_REJECTED');
  if (rpc === 'user_can') need(seen.size === 1 && seen.has('p_permission_key'), 'READ_ARGUMENTS_REJECTED');
  return 'ALLOW';
}
