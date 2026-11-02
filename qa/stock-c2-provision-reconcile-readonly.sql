-- ONLY observation after an uncertain seed response. Absence NEVER authorizes retry.
-- Verify the physical TEST connection externally; the literal IDs are not proof of target.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL search_path = pg_catalog, public;
WITH ids AS (
 SELECT 'd627563b-2ce4-491d-8cf6-141ef28d0f63'::uuid business,
 '475ae0c8-5a4b-45a2-ad74-1a450e553cb0'::uuid item,
 'ee6bd7b2-5e9d-41e6-8963-e1f178f54e09'::uuid location,
 '894e85eb-eb73-42f6-a18c-4d36c0ac0113'::uuid stock
), observations AS (
 SELECT
 (SELECT count(*) FROM public.locations,ids WHERE id=ids.location) location_rows,
 (SELECT count(*) FROM public.inventory_items,ids WHERE id=ids.item) item_rows,
 (SELECT count(*) FROM public.inventory_stock,ids WHERE id=ids.stock) stock_rows,
 (SELECT count(*) FROM public.locations WHERE lower(btrim(name))=lower('ZZ_QA_STOCK_C2_20261102_LOCATION')) location_labels,
 (SELECT count(*) FROM public.inventory_items WHERE lower(btrim(name))=lower('ZZ_QA_STOCK_C2_20261102_EXCLUSIVE') OR lower(btrim(sku))=lower('ZZ_QA_C2_20261102')) item_labels,
 (SELECT count(*) FROM public.inventory_stock,ids WHERE inventory_item_id=ids.item OR location_id=ids.location OR id=ids.stock) related_positions,
 (SELECT count(*) FROM public.inventory_transactions,ids WHERE inventory_item_id=ids.item OR location_id=ids.location) movements,
 (SELECT count(*) FROM public.waste_transactions,ids WHERE inventory_item_id=ids.item OR location_id=ids.location) waste,
 (SELECT count(*) FROM public.product_recipes,ids WHERE inventory_item_id=ids.item) recipes,
 (SELECT count(*) FROM public.purchase_order_items,ids WHERE inventory_item_id=ids.item) purchase_lines,
 (SELECT count(*) FROM public.audit_logs WHERE position('ZZ_QA_STOCK_C2_20261102_EXCLUSIVE' in details)>0) audits,
 EXISTS (SELECT 1 FROM public.locations l,public.inventory_items i,public.inventory_stock s,ids x
 WHERE l.id=x.location AND i.id=x.item AND s.id=x.stock AND l.business_id=x.business AND i.business_id=x.business
 AND l.name='ZZ_QA_STOCK_C2_20261102_LOCATION' AND l.type='Storage' AND l.active IS TRUE
 AND i.name='ZZ_QA_STOCK_C2_20261102_EXCLUSIVE' AND i.sku='ZZ_QA_C2_20261102' AND i.category='QA'
 AND i.unit='unit' AND i.min_qty=0.000 AND i.max_qty=2.000 AND i.supplier_id IS NULL AND i.expires_at IS NULL
 AND i.notes='QA C2 exclusive imported baseline; retain residual history' AND i.active IS TRUE
 AND s.inventory_item_id=x.item AND s.location_id=x.location AND s.qty=2.000 AND s.avg_cost_per_unit=0.1000
 AND s.last_purchase_cost=0.1000 AND s.last_purchase_date IS NULL
 AND l.created_at=l.updated_at AND i.created_at=i.updated_at AND s.created_at=s.updated_at
 AND l.created_at=i.created_at AND i.created_at=s.created_at) exact_seed_observed,
 (SELECT jsonb_build_object('qty',qty,'avg_cost',avg_cost_per_unit,'last_purchase_cost',last_purchase_cost,
   'last_purchase_date',last_purchase_date,'created_at',created_at,'updated_at',updated_at) FROM public.inventory_stock,ids WHERE id=ids.stock) position
)
SELECT jsonb_build_object('scope','C2_PROVISION_READONLY_RECONCILIATION','captured_at',current_timestamp,
 'database',current_database(),'sql_role',current_user,'observation',to_jsonb(o),
 'status',CASE
 WHEN location_rows=0 AND item_rows=0 AND stock_rows=0 AND location_labels=0 AND item_labels=0
   AND related_positions=0 AND movements=0 AND waste=0 AND recipes=0 AND purchase_lines=0 AND audits=0
 THEN 'ABSENT_UNCONFIRMED_NO_RETRY'
 WHEN location_rows=1 AND item_rows=1 AND stock_rows=1 AND location_labels=1 AND item_labels=1
   AND related_positions=1 AND movements=0 AND waste=0 AND recipes=0 AND purchase_lines=0 AND audits=0 AND exact_seed_observed
 THEN 'SEED_OBSERVED_NO_EXECUTION_AUTHORIZATION'
 ELSE 'DIVERGENT_STOP_MANUAL_REVIEW' END,
 'retry_allowed',false,'cleanup_allowed',false,'c2_loss_authorized',false,
 'warning','Point-in-time observation only; preserve original submission/commit evidence and do not replay') AS c2_provision_reconciliation
FROM observations o;
COMMIT;
