// Synthetic data only. No credentials or network implementation.
import { randomUUID } from 'node:crypto';
import { C2, auditPayload } from './stock-c2-protocol.mjs';
import { STOCK_ACTORS as A } from './stock-journey-core.mjs';
export function fixture() {
  return { item: { id: C2.item, business_id: A.A.business, name: C2.name, active: true, supplier_id: null, expires_at: null,
    sku: 'ZZ_QA_C2_20261102', notes: 'QA C2 exclusive imported baseline; retain residual history', unit: 'unit', category: 'QA', min_qty: 0, max_qty: 2 },
    locations: [{ id: C2.location, name: C2.locationName, business_id: A.A.business, active: true, type: 'Storage' }],
    stocks: [{ id: C2.stock, inventory_item_id: C2.item, location_id: C2.location, qty: 2, avg_cost_per_unit: 0.1,
      last_purchase_cost: 0.1, last_purchase_date: null, updated_at: '2026-10-01T00:00:00Z' }], transactions: [], waste: [], recipes: [], purchaseLines: [], audit: [] };
}
export function commitLoss(v) {
  const now = new Date().toISOString(), id = randomUUID();
  v.stocks[0].qty = 1.875; v.stocks[0].updated_at = now;
  const base = { business_id: A.A.business, inventory_item_id: C2.item, location_id: C2.location, unit: 'unit', created_by: A.A.owner, created_at: now };
  v.transactions.push({ ...base, id, type: 'WASTE', qty_change: -0.125, unit_cost: 0.1, total_cost: -0.01, prev_avg_cost: 0.1, new_avg_cost: 0.1,
    note: 'Reason: Other', sale_id: null, purchase_order_id: null, related_transaction_id: null });
  v.waste.push({ ...base, id: randomUUID(), inventory_transaction_id: id, qty: 0.125, cost: 0.01, reason: 'Other', notes: C2.note });
  return v.waste[0];
}
export function commitAudit(v) {
  const row = { id: randomUUID(), business_id: A.A.business, user_id: A.A.owner, action: 'Client: Waste Recorded',
    details: auditPayload().p_details, occurred_at: new Date().toISOString() }; v.audit.push(row); return row;
}
