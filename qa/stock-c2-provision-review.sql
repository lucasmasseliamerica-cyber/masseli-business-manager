-- REVIEW ONLY. NOT AUTHORIZED. TEST connection must be verified externally.
-- Seed deliberately has NO INITIAL_STOCK movement. Authorization for C2 loss is separate.
-- Do not set approval/project attestations in this file. No retry/upsert/cleanup.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '20s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL search_path = pg_catalog, public;
DO $c2_seed$
DECLARE
  v_rows integer;
  v_counts bigint[];
  v_contract text;
  v_business constant uuid := 'd627563b-2ce4-491d-8cf6-141ef28d0f63';
  v_item constant uuid := '475ae0c8-5a4b-45a2-ad74-1a450e553cb0';
  v_location constant uuid := 'ee6bd7b2-5e9d-41e6-8963-e1f178f54e09';
  v_stock constant uuid := '894e85eb-eb73-42f6-a18c-4d36c0ac0113';
BEGIN
  IF current_user <> 'postgres' OR current_database() <> 'postgres'
     OR current_setting('session_replication_role') <> 'origin'
     OR current_setting('nexalvo.c2.project_ref',true) IS DISTINCT FROM 'msinksoilkluooxenecy'
     OR current_setting('nexalvo.c2.provision_approval',true) IS DISTINCT FROM 'TEST_ONLY_THREE_ROW_SEED_WITHOUT_INITIAL_MOVEMENT_20261102'
  THEN RAISE EXCEPTION 'C2_SEED_CONTEXT_OR_SPECIFIC_APPROVAL_REQUIRED'; END IF;
  LOCK TABLE ONLY public.locations, public.inventory_items, public.inventory_stock IN SHARE ROW EXCLUSIVE MODE;

  SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
 'tables',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,c.relkind,c.relispartition,c.relrowsecurity,pg_catalog.pg_get_userbyid(c.relowner)) ORDER BY c.relname) FROM pg_catalog.pg_class c WHERE c.oid IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass)),
 'columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,pg_catalog.pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE c.oid IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass) AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,k.conname,k.contype,pg_catalog.pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY c.relname,k.conname) FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid WHERE c.oid IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass)),
 'triggers',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,t.tgisinternal,t.tgenabled,t.tgtype,n.nspname,p.proname,CASE WHEN NOT t.tgisinternal THEN pg_catalog.pg_get_triggerdef(t.oid) END,CASE WHEN NOT t.tgisinternal THEN pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) END,CASE WHEN t.tgisinternal THEN pg_catalog.pg_get_constraintdef(k.oid) END) ORDER BY c.relname,t.tgisinternal,p.proname,pg_catalog.pg_get_constraintdef(k.oid),t.tgname) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace LEFT JOIN pg_catalog.pg_constraint k ON k.oid=t.tgconstraint WHERE c.oid IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass) AND (NOT t.tgisinternal OR (t.tgtype & 4)<>0)),
 'indexes',(SELECT pg_catalog.jsonb_agg(pg_catalog.pg_get_indexdef(i.indexrelid) ORDER BY pg_catalog.pg_get_indexdef(i.indexrelid)) FROM pg_catalog.pg_index i WHERE i.indrelid IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass)),
 'rules',(SELECT count(*) FROM pg_catalog.pg_rewrite r WHERE r.ev_class IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass)),
 'inheritance',(SELECT count(*) FROM pg_catalog.pg_inherits i WHERE i.inhrelid IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass) OR i.inhparent IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass))
)::text) INTO v_contract;
  IF v_contract IS DISTINCT FROM '135e8025db9f8097377432b0ff26fe8c'
  THEN RAISE EXCEPTION 'C2_SEED_CATALOG_DRIFT'; END IF;

  -- Cooperative QA exclusivity is still required; these locks are not tenant-scoped.
  PERFORM 1 FROM public.businesses WHERE id=v_business AND platform_status='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_SEED_ACTIVE_QA_COMPANY_REQUIRED'; END IF;
  PERFORM 1 FROM public.users WHERE id='f37e9907-47c4-48bf-94b7-9a6fa5de1f88'
    AND business_id=v_business AND role='OWNER' AND active IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_SEED_ACTIVE_OWNER_A_REQUIRED'; END IF;

  IF EXISTS (SELECT 1 FROM public.locations WHERE id=v_location OR lower(btrim(name))=lower('ZZ_QA_STOCK_C2_20261102_LOCATION'))
    OR EXISTS (SELECT 1 FROM public.inventory_items WHERE id=v_item OR lower(btrim(name))=lower('ZZ_QA_STOCK_C2_20261102_EXCLUSIVE') OR lower(btrim(sku))=lower('ZZ_QA_C2_20261102'))
    OR EXISTS (SELECT 1 FROM public.inventory_stock WHERE id=v_stock OR inventory_item_id=v_item OR location_id=v_location)
  THEN RAISE EXCEPTION 'C2_SEED_COLLISION_NO_RETRY'; END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_transactions WHERE inventory_item_id=v_item OR location_id=v_location)
    OR EXISTS (SELECT 1 FROM public.waste_transactions WHERE inventory_item_id=v_item OR location_id=v_location)
    OR EXISTS (SELECT 1 FROM public.product_recipes WHERE inventory_item_id=v_item)
    OR EXISTS (SELECT 1 FROM public.purchase_order_items WHERE inventory_item_id=v_item)
    OR EXISTS (SELECT 1 FROM public.audit_logs WHERE position('ZZ_QA_STOCK_C2_20261102_EXCLUSIVE' in details)>0)
  THEN RAISE EXCEPTION 'C2_SEED_EXISTING_HISTORY_OR_DEPENDENCY'; END IF;

  SELECT ARRAY[(SELECT count(*) FROM public.locations),(SELECT count(*) FROM public.inventory_items),
               (SELECT count(*) FROM public.inventory_stock)] INTO v_counts;

  INSERT INTO public.locations(id,business_id,name,type,active)
  VALUES(v_location,v_business,'ZZ_QA_STOCK_C2_20261102_LOCATION','Storage',true);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'C2_SEED_LOCATION_CARDINALITY'; END IF;

  INSERT INTO public.inventory_items(id,business_id,name,sku,category,unit,min_qty,max_qty,supplier_id,expires_at,notes,active)
  VALUES(v_item,v_business,'ZZ_QA_STOCK_C2_20261102_EXCLUSIVE','ZZ_QA_C2_20261102','QA','unit',0.000,2.000,NULL,NULL,
    'QA C2 exclusive imported baseline; retain residual history',true);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'C2_SEED_ITEM_CARDINALITY'; END IF;

  INSERT INTO public.inventory_stock(id,inventory_item_id,location_id,qty,avg_cost_per_unit,last_purchase_cost,last_purchase_date)
  VALUES(v_stock,v_item,v_location,2.000,0.1000,0.1000,NULL);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'C2_SEED_STOCK_CARDINALITY'; END IF;

  SET CONSTRAINTS ALL IMMEDIATE;
  IF (SELECT count(*) FROM public.locations) <> v_counts[1]+1
    OR (SELECT count(*) FROM public.inventory_items) <> v_counts[2]+1
    OR (SELECT count(*) FROM public.inventory_stock) <> v_counts[3]+1
  THEN RAISE EXCEPTION 'C2_SEED_DIRECT_OR_INDIRECT_ROW_BUDGET'; END IF;

  IF (SELECT count(*) FROM public.locations WHERE id=v_location AND business_id=v_business
    AND name='ZZ_QA_STOCK_C2_20261102_LOCATION' AND type='Storage' AND active IS TRUE
    AND created_at=transaction_timestamp() AND updated_at=transaction_timestamp()) <> 1
    OR (SELECT count(*) FROM public.inventory_items WHERE id=v_item AND business_id=v_business
      AND name='ZZ_QA_STOCK_C2_20261102_EXCLUSIVE' AND sku='ZZ_QA_C2_20261102' AND category='QA' AND unit='unit'
      AND min_qty=0.000 AND max_qty=2.000 AND supplier_id IS NULL AND expires_at IS NULL AND active IS TRUE
      AND notes='QA C2 exclusive imported baseline; retain residual history'
      AND created_at=transaction_timestamp() AND updated_at=transaction_timestamp()) <> 1
    OR (SELECT count(*) FROM public.inventory_stock WHERE id=v_stock AND inventory_item_id=v_item AND location_id=v_location
      AND qty=2.000 AND avg_cost_per_unit=0.1000 AND last_purchase_cost=0.1000 AND last_purchase_date IS NULL
      AND created_at=transaction_timestamp() AND updated_at=transaction_timestamp()) <> 1
  THEN RAISE EXCEPTION 'C2_SEED_EXACT_DATA_ASSERTION'; END IF;

  IF EXISTS (SELECT 1 FROM public.inventory_transactions WHERE inventory_item_id=v_item OR location_id=v_location)
    OR EXISTS (SELECT 1 FROM public.waste_transactions WHERE inventory_item_id=v_item OR location_id=v_location)
    OR EXISTS (SELECT 1 FROM public.product_recipes WHERE inventory_item_id=v_item)
    OR EXISTS (SELECT 1 FROM public.purchase_order_items WHERE inventory_item_id=v_item)
    OR EXISTS (SELECT 1 FROM public.audit_logs WHERE position('ZZ_QA_STOCK_C2_20261102_EXCLUSIVE' in details)>0)
  THEN RAISE EXCEPTION 'C2_SEED_UNEXPECTED_RESIDUAL_HISTORY'; END IF;
  SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
 'tables',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,c.relkind,c.relispartition,c.relrowsecurity,pg_catalog.pg_get_userbyid(c.relowner)) ORDER BY c.relname) FROM pg_catalog.pg_class c WHERE c.oid IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass)),
 'columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,pg_catalog.pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE c.oid IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass) AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,k.conname,k.contype,pg_catalog.pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY c.relname,k.conname) FROM pg_catalog.pg_constraint k JOIN pg_catalog.pg_class c ON c.oid=k.conrelid WHERE c.oid IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass)),
 'triggers',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(c.relname,t.tgisinternal,t.tgenabled,t.tgtype,n.nspname,p.proname,CASE WHEN NOT t.tgisinternal THEN pg_catalog.pg_get_triggerdef(t.oid) END,CASE WHEN NOT t.tgisinternal THEN pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) END,CASE WHEN t.tgisinternal THEN pg_catalog.pg_get_constraintdef(k.oid) END) ORDER BY c.relname,t.tgisinternal,p.proname,pg_catalog.pg_get_constraintdef(k.oid),t.tgname) FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace LEFT JOIN pg_catalog.pg_constraint k ON k.oid=t.tgconstraint WHERE c.oid IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass) AND (NOT t.tgisinternal OR (t.tgtype & 4)<>0)),
 'indexes',(SELECT pg_catalog.jsonb_agg(pg_catalog.pg_get_indexdef(i.indexrelid) ORDER BY pg_catalog.pg_get_indexdef(i.indexrelid)) FROM pg_catalog.pg_index i WHERE i.indrelid IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass)),
 'rules',(SELECT count(*) FROM pg_catalog.pg_rewrite r WHERE r.ev_class IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass)),
 'inheritance',(SELECT count(*) FROM pg_catalog.pg_inherits i WHERE i.inhrelid IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass) OR i.inhparent IN ('public.locations'::regclass,'public.inventory_items'::regclass,'public.inventory_stock'::regclass))
)::text) INTO v_contract;
  IF v_contract IS DISTINCT FROM '135e8025db9f8097377432b0ff26fe8c'
  THEN RAISE EXCEPTION 'C2_SEED_FINAL_CATALOG_DRIFT'; END IF;
  RAISE NOTICE 'C2_SEED_THREE_ROWS_ASSERTED_COMMIT_RECEIPT_STILL_REQUIRED';
END
$c2_seed$;
COMMIT;
