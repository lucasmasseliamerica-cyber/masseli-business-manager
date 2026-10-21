-- B-Jornada only, Supabase TEST msinksoilkluooxenecy. STRICTLY READ ONLY.
-- Confirm TEST in the SQL connection itself; the expected marker below is not connection proof.
-- The two tenant helpers use the reviewed post-platform-cutover baseline, not rollback.
-- Hash drift stays BLOCKED: review actual definitions; never replace expected hashes blindly.
WITH expected(name,fingerprint,expected_authenticated) AS (VALUES
    ('current_business_id','8326e5f1bc2ecf720cb0aa3be9a0d0d6',true),
    ('user_can','78e7ac15c93a208fdec8baf37e2b9c02',true),
    ('fn_create_sale','aabbddc8a9c4a37a171b8a269e9c3139',true),
    ('fn_reverse_sale','ce3f22be25a16639e7b14155fa9452a0',true),
    ('fn_read_inventory_stock_secure','57116f28b9ae161d5240058a34b8afa9',true),
    ('fn_read_inventory_transactions_secure','7c7e3ab8797be57daa71574e59d0f553',true),
    ('fn_next_order_no','143dc0404b1e7710598030e5f4755bfa',false),
    ('fn_record_inventory_movement','b5ac605f98d630ec318651bfb70eda63',false)
), functions AS (
  SELECT e.name,e.fingerprint AS expected_fingerprint,e.expected_authenticated,p.oid IS NOT NULL AS present,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS fingerprint,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
    p.prosecdef AS security_definer,p.proconfig AS settings
  FROM expected e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name AND p.prokind='f'
), required_tables(name) AS (VALUES
  ('sales'),('sale_items'),('products'),('product_recipes'),('inventory_items'),('inventory_stock'),
  ('inventory_transactions'),('cash_flow'),('cash_registers'),('businesses'),('locations'),
  ('business_settings_lists'),('audit_logs')
), tables AS (
  SELECT t.name,c.oid IS NOT NULL AS present,coalesce(c.relrowsecurity,false) AS rls,
    coalesce(pg_catalog.has_table_privilege('anon',c.oid,'SELECT'),false) AS anon_select
  FROM required_tables t
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=t.name AND c.relkind IN ('r','p')
)
SELECT jsonb_build_object(
  'project_ref_expected','msinksoilkluooxenecy','connection_identity','VERIFY_EXTERNALLY',
  'captured_at',CURRENT_TIMESTAMP,'mode','READ_ONLY',
  'status',CASE WHEN (SELECT count(*) FROM functions)=8
    AND NOT EXISTS(SELECT 1 FROM functions WHERE NOT present OR fingerprint IS DISTINCT FROM expected_fingerprint
      OR anon_execute IS DISTINCT FROM false OR authenticated_execute IS DISTINCT FROM expected_authenticated)
    AND (SELECT count(*) FROM tables)=13
    AND NOT EXISTS(SELECT 1 FROM tables WHERE NOT present OR NOT rls OR anon_select)
    THEN 'PASS_VERSIONED_CONTRACTS' ELSE 'BLOCKED_CATALOG_DRIFT' END,
  'functions',(SELECT jsonb_agg(to_jsonb(f) ORDER BY name) FROM functions f),
  'tables',(SELECT jsonb_agg(to_jsonb(t) ORDER BY name) FROM tables t),
  'note','Other payment only; no drawer mutation; this is version/security preflight, not B-Jornada homologation'
) AS sale_journey_preflight;
