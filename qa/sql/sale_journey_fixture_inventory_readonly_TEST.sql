-- TEST msinksoilkluooxenecy only. Read-only fixture proposal inventory, NOT authorization to create.
-- Output contains QA product/location IDs needed by the local operator; keep outside Git/logs.
-- Does not inspect Auth, emails, passwords, salaries or personal customer/employee records.
WITH candidates AS (
 SELECT p.id AS product_id,p.name,p.active,p.price,b.currency,l.id AS location_id,l.name AS location_name,
   (SELECT count(*) FROM public.product_recipes r WHERE r.product_id=p.id) AS ingredients,
   (SELECT count(*) FROM public.sale_items si WHERE si.product_id=p.id) AS previous_sale_items,
   (SELECT count(*) FROM public.product_recipes r
     LEFT JOIN public.inventory_items i ON i.id=r.inventory_item_id
     LEFT JOIN public.inventory_stock st ON st.inventory_item_id=i.id AND st.location_id=l.id
     WHERE r.product_id=p.id AND (i.business_id IS DISTINCT FROM b.id OR i.active IS DISTINCT FROM true
       OR coalesce(i.name,'') !~ '^ZZ_QA_[A-Z0-9_]+$' OR r.qty_per_unit IS NULL OR r.qty_per_unit<=0 OR r.qty_per_unit>1 OR r.qty_per_unit<>round(r.qty_per_unit,3)
       OR st.id IS NULL OR st.qty IS NULL OR st.avg_cost_per_unit IS NULL
       OR lower(st.qty::text) IN ('nan','infinity','-infinity') OR lower(st.avg_cost_per_unit::text) IN ('nan','infinity','-infinity')
       OR st.qty<=r.qty_per_unit OR st.avg_cost_per_unit<=0
       OR EXISTS(SELECT 1 FROM public.product_recipes other WHERE other.inventory_item_id=i.id AND other.product_id<>p.id)
       OR EXISTS(SELECT 1 FROM public.purchase_order_items poi WHERE poi.inventory_item_id=i.id))) AS unsafe_ingredients,
   pg_catalog.round(p.price-CASE WHEN p.price>=0.02 THEN 0.01 ELSE 0 END+
     CASE WHEN b.tax_enabled THEN pg_catalog.round((p.price-CASE WHEN p.price>=0.02 THEN 0.01 ELSE 0 END)*b.tax_rate/100,2) ELSE 0 END,2) AS expected_total_usd
 FROM public.products p JOIN public.businesses b ON b.id=p.business_id
 JOIN public.locations l ON l.business_id=b.id AND l.active=true
 WHERE b.id='d627563b-2ce4-491d-8cf6-141ef28d0f63'::uuid AND p.name ~ '^ZZ_QA_[A-Z0-9_]+$'
)
SELECT jsonb_build_object('project_ref_expected','msinksoilkluooxenecy','mode','READ_ONLY',
 'candidates',coalesce((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('potentially_eligible',
   c.active IS TRUE AND c.currency='USD' AND c.price>0 AND c.price<=1
   AND c.ingredients BETWEEN 1 AND 3 AND c.previous_sale_items=0 AND c.unsafe_ingredients=0
   AND c.expected_total_usd>0 AND c.expected_total_usd<=1) ORDER BY c.name,c.location_name) FROM candidates c),'[]'::jsonb),
 'note','Candidate inventory only. Executor revalidates every snapshot and permission before writing; no fixture may be created or repriced implicitly.'
) AS sale_journey_fixture_inventory;
