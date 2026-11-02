// C2 has its own fixture, authority and residual history. No C1 checkpoint is accepted.
import { createHash } from 'node:crypto';
import { STOCK_ACTORS, requireStock } from './stock-journey-core.mjs';

export const C2 = Object.freeze({
  item: '475ae0c8-5a4b-45a2-ad74-1a450e553cb0',
  location: 'ee6bd7b2-5e9d-41e6-8963-e1f178f54e09',
  stock: '894e85eb-eb73-42f6-a18c-4d36c0ac0113',
  name: 'ZZ_QA_STOCK_C2_20261102_EXCLUSIVE',
  locationName: 'ZZ_QA_STOCK_C2_20261102_LOCATION',
  note: 'NEXALVO_C2_20261102_SINGLE_WASTE_0125', quantity: 0.125,
});
export const C2_AUTHORITY = 'TEST_ONLY_C2_LOSS_AND_RESIDUAL_HISTORY_20261102';
export const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
export const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
export const same = (a, b) => canonical(a) === canonical(b);
export const need = (ok, code) => requireStock(ok, 'C2_' + code);
const number = (v, n) => v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v) === n;
const omit = (v, keys) => Object.fromEntries(Object.entries(v).filter(([k]) => !keys.includes(k)));
const sorted = rows => [...rows].sort((a, b) => a.id.localeCompare(b.id));
export function validateC2Fixture(v) {
  need(v.item?.id === C2.item && v.item.name === C2.name && v.item.business_id === STOCK_ACTORS.A.business
    && v.item.active === true && v.item.unit === 'unit' && v.item.supplier_id === null && v.item.expires_at === null
    && v.item.sku === 'ZZ_QA_C2_20261102' && v.item.category === 'QA' && number(v.item.min_qty, 0) && number(v.item.max_qty, 2)
    && v.item.notes === 'QA C2 exclusive imported baseline; retain residual history', 'EXCLUSIVE_ITEM_REQUIRED');
  need(v.locations?.length === 1 && v.locations[0].id === C2.location && v.locations[0].name === C2.locationName
    && v.locations[0].business_id === STOCK_ACTORS.A.business && v.locations[0].active === true && v.locations[0].type === 'Storage', 'EXCLUSIVE_LOCATION_REQUIRED');
  need(v.stocks?.length === 1 && v.stocks[0].id === C2.stock && v.stocks[0].inventory_item_id === C2.item
    && v.stocks[0].location_id === C2.location && number(v.stocks[0].qty, 2) && number(v.stocks[0].avg_cost_per_unit, 0.1)
    && number(v.stocks[0].last_purchase_cost, 0.1) && v.stocks[0].last_purchase_date === null, 'INITIAL_STOCK_REQUIRED');
  for (const k of ['transactions', 'waste', 'recipes', 'purchaseLines', 'audit']) need(Array.isArray(v[k]) && v[k].length === 0, 'UNUSED_FIXTURE_REQUIRED');
  need(Number.isFinite(Date.parse(v.stocks[0].updated_at)), 'BASELINE_TIME_REQUIRED');
  return v;
}
export const wastePayload = () => ({ p_business_id: STOCK_ACTORS.A.business, p_inventory_item_id: C2.item,
  p_location_id: C2.location, p_qty: C2.quantity, p_reason: 'Other', p_notes: C2.note });
export const auditPayload = () => ({ p_action: 'Waste Recorded', p_details: `${C2.name} -0.125 unit · Other` });
export function c2Window(env, now = Date.now()) {
  const at = Date.parse(env.QA_C2_EXCLUSIVE_AT), until = Date.parse(env.QA_C2_EXCLUSIVE_UNTIL);
  need(env.QA_C2_EXCLUSIVE_WINDOW === 'TEST_ONLY_C2_EXCLUSIVE_WINDOW' && Number.isFinite(at) && Number.isFinite(until)
    && at <= now && now < until && until > at && until - at <= 20 * 60000, 'CURRENT_WINDOW_REQUIRED');
  return { at, until };
}
export function c2Authorization(env, codeSha, baselineHash) {
  need(env.QA_C2_EXECUTION_AUTHORIZED === C2_AUTHORITY && env.QA_C2_AUTHORIZED_CODE_SHA === codeSha
    && /^[a-f0-9]{40}$/.test(codeSha || '') && /^[a-f0-9]{64}$/.test(baselineHash || '')
    && env.QA_C2_AUTHORIZED_BASELINE_SHA256 === baselineHash && env.QA_C2_AUTHORIZED_FIXTURE_SHA256 === hash(C2), 'SPECIFIC_AUTHORIZATION_REQUIRED');
}
// Exact cardinalities and immutable baseline comparisons, not just a matching quantity.
export function reconcileC2(baseline, view, loss, audit, since) {
  validateC2Fixture(baseline);
  need([0, 1].includes(loss) && [0, 1].includes(audit) && audit <= loss, 'STAGE_REQUIRED');
  for (const k of ['item', 'locations', 'recipes', 'purchaseLines']) need(same(view[k], baseline[k]), 'UNRELATED_CHANGE');
  need(view.stocks?.length === 1 && same(omit(view.stocks[0], ['qty', 'updated_at']), omit(baseline.stocks[0], ['qty', 'updated_at']))
    && number(view.stocks[0].qty, loss ? 1.875 : 2), 'STOCK_MISMATCH');
  if (!loss) need(same(view.stocks, baseline.stocks), 'BASELINE_CHANGED');
  else need(Date.parse(view.stocks[0].updated_at) >= since && view.stocks[0].updated_at !== baseline.stocks[0].updated_at, 'STOCK_TIME_MISMATCH');
  need(view.transactions?.length === loss && view.waste?.length === loss && view.audit?.length === audit, 'CARDINALITY_MISMATCH');
  const t = view.transactions[0], w = view.waste[0], a = view.audit[0];
  const owned = r => r.business_id === STOCK_ACTORS.A.business && r.created_by === STOCK_ACTORS.A.owner
    && r.inventory_item_id === C2.item && r.location_id === C2.location && r.unit === 'unit';
  const uuid = v => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v || '');
  if (loss) {
    need(uuid(t.id) && uuid(w.id) && owned(t) && owned(w) && t.type === 'WASTE' && number(t.qty_change, -0.125)
      && number(t.unit_cost, 0.1) && number(t.total_cost, -0.01) && number(t.prev_avg_cost, 0.1) && number(t.new_avg_cost, 0.1)
      && t.sale_id === null && t.purchase_order_id === null && t.related_transaction_id === null && t.note === 'Reason: Other'
      && w.inventory_transaction_id === t.id && number(w.qty, 0.125) && number(w.cost, 0.01)
      && w.reason === 'Other' && w.notes === C2.note && Date.parse(t.created_at) >= since && Date.parse(w.created_at) >= since, 'LOSS_RECEIPT_MISMATCH');
  }
  if (audit) need(uuid(a.id) && a.business_id === STOCK_ACTORS.A.business && a.user_id === STOCK_ACTORS.A.owner
    && a.action === 'Client: Waste Recorded' && a.details === auditPayload().p_details && Date.parse(a.occurred_at) >= since, 'AUDIT_RECEIPT_MISMATCH');
  return { loss_rows: loss, movement_rows: loss, audit_rows: audit, final_quantity: loss ? 1.875 : 2,
    average_cost: 0.1, residual_history_retained: Boolean(loss), restored: false };
}
export function recoveryC2(state, view) {
  // Observation never changes the journal or authorizes a subsequent operation.
  const since = state.intentAt || state.startedAt;
  for (const [loss, audit] of [[1, 1], [1, 0], [0, 0]]) {
    if ((loss && state.phase === 'RESERVED') || (audit && !['AUDIT_INTENT', 'AUDIT_CONFIRMED', 'COMPLETE'].includes(state.phase))) continue;
    if ((!loss && ['LOSS_CONFIRMED', 'AUDIT_INTENT', 'AUDIT_CONFIRMED', 'COMPLETE'].includes(state.phase))
      || (!audit && ['AUDIT_CONFIRMED', 'COMPLETE'].includes(state.phase))) continue;
    if (state.lossReceipt && !same(state.lossReceipt, view.waste?.[0])) continue;
    if (state.movementReceipt && !same(state.movementReceipt, view.transactions?.[0])) continue;
    if (state.auditReceipt && !same(state.auditReceipt, view.audit?.[0])) continue;
    try { return { ...reconcileC2(state.baseline, view, loss, audit, since), observed_only: true,
      resume_allowed: false, full_homologation: false, pending_intent_retained: true }; } catch { /* try a lower observed cardinality */ }
  }
  need(false, 'UNKNOWN_RESULT_NO_REPLAY');
}
export function assertSameRows(a, b) { need(same(sorted(a), sorted(b)), 'HISTORY_CHANGED'); }
