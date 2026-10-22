-- C-only dedicated fixture inventory. SELECT only; not authorization to create or reuse rows.
-- Confirm Supabase TEST msinksoilkluooxenecy in the SQL connection externally.
WITH candidates AS (
 SELECT i.id,i.business_id,i.name,i.active,i.supplier_id,
   (SELECT count(*) FROM public.product_recipes r WHERE r.inventory_item_id=i.id) AS recipe_links,
   (SELECT count(*) FROM public.purchase_order_items p WHERE p.inventory_item_id=i.id) AS purchase_links,
   (SELECT count(*) FROM public.inventory_transactions t WHERE t.inventory_item_id=i.id) AS movement_history,
   (SELECT count(*) FROM public.waste_transactions w WHERE w.inventory_item_id=i.id) AS waste_history,
   (SELECT count(*) FROM public.inventory_stock s WHERE s.inventory_item_id=i.id) AS positions,
   (SELECT count(*) FROM public.inventory_stock s JOIN public.locations l ON l.id=s.location_id
     WHERE s.inventory_item_id=i.id AND l.business_id=i.business_id AND l.active=true
       AND l.name ~ '^ZZ_QA_STOCK_C_[A-Z0-9_]+$' AND s.qty BETWEEN 2 AND 10 AND s.qty=round(s.qty,3)
       AND s.avg_cost_per_unit>0 AND s.avg_cost_per_unit<=1 AND s.avg_cost_per_unit=round(s.avg_cost_per_unit,4)) AS safe_positions,
   (SELECT count(DISTINCT s.avg_cost_per_unit) FROM public.inventory_stock s WHERE s.inventory_item_id=i.id) AS cost_variants,
   (SELECT jsonb_agg(jsonb_build_object('stock_id',s.id,'location_id',s.location_id) ORDER BY s.location_id)
    FROM public.inventory_stock s WHERE s.inventory_item_id=i.id) AS position_ids
 FROM public.inventory_items i WHERE i.business_id='d627563b-2ce4-491d-8cf6-141ef28d0f63'::uuid
   AND i.name ~ '^ZZ_QA_STOCK_C_[A-Z0-9_]+_EXCLUSIVE$'
), checked AS (
 SELECT c.*,active=true AND supplier_id IS NULL AND recipe_links=0 AND purchase_links=0 AND movement_history=0
   AND waste_history=0 AND positions=2 AND safe_positions=2 AND cost_variants=1 AS potentially_eligible FROM candidates c
)
SELECT jsonb_build_object('project_ref_expected','msinksoilkluooxenecy','mode','READ_ONLY',
 'candidate_count',(SELECT count(*) FROM checked),'eligible_count',(SELECT count(*) FROM checked WHERE potentially_eligible),
 'candidates',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY name) FROM checked c),'[]'::jsonb),
 'note','No existing B/photo/historical fixture may be reused; no fixture, permission or exclusive window is created by this query'
) AS stock_journey_fixtures;
