-- C-Jornada, TEST msinksoilkluooxenecy. SELECT only; verify connection identity externally.
-- Fingerprints: reviewed historical export + versioned post-cutover tenant helpers.
-- Drift is BLOCKED; capture/review definitions instead of substituting expected hashes.
WITH expected(name,fingerprint,auth_execute) AS (VALUES
  ('current_business_id','8326e5f1bc2ecf720cb0aa3be9a0d0d6',true),
  ('user_can','78e7ac15c93a208fdec8baf37e2b9c02',true),
  ('fn_adjust_inventory_count','ce5f2ab5348165439c90212c1f5f90ce',true),
  ('fn_record_waste','185a854265f9f345b44c96ce31aa3485',true),
  ('fn_transfer_inventory','220be0af82a92406b8f141ab3cb279d7',true),
  ('fn_record_inventory_movement','b5ac605f98d630ec318651bfb70eda63',false),
  ('fn_read_inventory_stock_secure','57116f28b9ae161d5240058a34b8afa9',true),
  ('fn_read_inventory_transactions_secure','7c7e3ab8797be57daa71574e59d0f553',true),
  ('fn_read_purchase_order_items_secure','de4aa1b81b87e33433ef3bbf1b072076',true)
), functions AS (
 SELECT e.name,e.fingerprint AS expected_fingerprint,e.auth_execute AS expected_authenticated,
   p.oid IS NOT NULL AS present,pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS fingerprint,
   pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
   pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
   pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
   p.prosecdef AS security_definer,p.proconfig AS settings
 FROM expected e LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name AND p.prokind='f'
), required_tables(name) AS (VALUES ('inventory_items'),('inventory_stock'),('inventory_transactions'),('waste_transactions'),('locations'),('product_recipes'),('purchase_orders'),('purchase_order_items'),('cash_flow'),('audit_logs')), tables AS (
 SELECT t.name,c.oid IS NOT NULL AS present,coalesce(c.relrowsecurity,false) AS rls,
   coalesce(pg_catalog.has_table_privilege('anon',c.oid,'SELECT') OR pg_catalog.has_any_column_privilege('anon',c.oid,'SELECT'),false) AS anon_select
 FROM required_tables t LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=t.name AND c.relkind IN('r','p')
), schema_security AS (
 SELECT pg_catalog.has_schema_privilege('anon','public','CREATE') AS anon_create,
   pg_catalog.has_schema_privilege('authenticated','public','CREATE') AS authenticated_create
)
SELECT jsonb_build_object(
 'project_ref_expected','msinksoilkluooxenecy','connection_identity','VERIFY_EXTERNALLY',
 'mode','READ_ONLY','captured_at',CURRENT_TIMESTAMP,
 'status',CASE WHEN (SELECT count(*) FROM functions)=9
   AND NOT EXISTS(SELECT 1 FROM functions WHERE NOT present OR (fingerprint IS DISTINCT FROM expected_fingerprint AND NOT(name='fn_record_inventory_movement' AND fingerprint='27bb16e1ab20acc78ef5bb2f25eb9c04'))
     OR anon_execute IS DISTINCT FROM false OR authenticated_execute IS DISTINCT FROM expected_authenticated)
   AND (SELECT count(*) FROM tables)=10
   AND NOT EXISTS(SELECT 1 FROM tables WHERE NOT present OR NOT rls OR anon_select)
   AND NOT EXISTS(SELECT 1 FROM schema_security WHERE anon_create OR authenticated_create)
   THEN 'PASS_MATCHED_HISTORICAL_CONTRACTS' ELSE 'BLOCKED_CATALOG_DRIFT' END,
 'functions',(SELECT jsonb_agg(to_jsonb(f) ORDER BY name) FROM functions f),
 'tables',(SELECT jsonb_agg(to_jsonb(t) ORDER BY name) FROM tables t),
 'precision_target_fingerprint','27bb16e1ab20acc78ef5bb2f25eb9c04',
 'public_schema',(SELECT to_jsonb(s) FROM schema_security s),
 'c1_audit_contract',(SELECT jsonb_build_object(
   'body_fingerprint',pg_catalog.md5(p.prosrc),
   'body_sha256',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex'),
   'identity_arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),
   'returns_audit_logs',p.prorettype=pg_catalog.to_regtype('public.audit_logs'),
   'language',l.lanname,'volatility',p.provolatile,'is_strict',p.proisstrict,
   'returns_set',p.proretset,'argument_defaults',p.pronargdefaults,
   'security_definer',p.prosecdef,
   'owner',pg_catalog.pg_get_userbyid(p.proowner),'empty_search_path',coalesce('search_path=""'=ANY(p.proconfig),false),
   'anon_execute',pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
   'authenticated_execute',pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE'),
   'overloads',(SELECT count(*) FROM pg_catalog.pg_proc q WHERE q.pronamespace=p.pronamespace AND q.proname=p.proname))
   FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
   WHERE p.oid=pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')),
 'next_phases',jsonb_build_object(
   'purchase_idempotency_present',EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_create_purchase_order_idempotent'),
   'expense_idempotency_present',EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='fn_create_expense_idempotent')),
 'note','Read-only contracts; does not authorize fixtures, inventory movements, purchases or expenses'
) AS stock_journey_preflight;
