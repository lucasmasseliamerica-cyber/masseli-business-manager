-- NEXALVO TEST complete security-definition export — READ ONLY.
-- Run only after independently selecting Supabase TEST msinksoilkluooxenecy.
-- This reads PostgreSQL metadata and function/view definitions. It never reads tenant rows.
-- Review the JSON before versioning it: function source must never contain embedded secrets.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';

WITH public_tables AS (
  SELECT c.relname AS name,
         pg_catalog.pg_get_userbyid(c.relowner) AS owner,
         c.relrowsecurity AS rls,
         c.relforcerowsecurity AS force_rls,
         c.relacl::text AS acl,
         pg_catalog.has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
         (pg_catalog.has_table_privilege('anon', c.oid, 'INSERT')
           OR pg_catalog.has_table_privilege('anon', c.oid, 'UPDATE')
           OR pg_catalog.has_table_privilege('anon', c.oid, 'DELETE')) AS anon_write,
         pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
         (pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT')
           OR pg_catalog.has_table_privilege('authenticated', c.oid, 'UPDATE')
           OR pg_catalog.has_table_privilege('authenticated', c.oid, 'DELETE')) AS authenticated_write,
         (pg_catalog.has_table_privilege('service_role', c.oid, 'SELECT')
           AND pg_catalog.has_table_privilege('service_role', c.oid, 'INSERT')
           AND pg_catalog.has_table_privilege('service_role', c.oid, 'UPDATE')
           AND pg_catalog.has_table_privilege('service_role', c.oid, 'DELETE')) AS service_role_all
  FROM pg_catalog.pg_class AS c
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
), public_functions AS (
  SELECT p.oid,
         p.proname AS name,
         pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
         pg_catalog.pg_get_function_result(p.oid) AS result_type,
         pg_catalog.pg_get_userbyid(p.proowner) AS owner,
         l.lanname AS language,
         p.prosecdef AS security_definer,
         p.proleakproof AS leakproof,
         p.proisstrict AS strict,
         p.provolatile AS volatility,
         p.proparallel AS parallel_safety,
         p.proconfig AS settings,
         p.proacl::text AS acl,
         pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
         pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
         pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
         pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS fingerprint,
         pg_catalog.pg_get_functiondef(p.oid) AS definition
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND p.prokind = 'f'
), all_policies AS (
  SELECT * FROM pg_catalog.pg_policies WHERE schemaname = 'public'
), all_table_grants AS (
  SELECT * FROM information_schema.role_table_grants WHERE table_schema = 'public'
), all_column_grants AS (
  SELECT * FROM information_schema.role_column_grants WHERE table_schema = 'public'
), public_columns AS (
  SELECT table_name, ordinal_position, column_name, data_type, udt_name, is_nullable,
         column_default, is_identity, is_generated
  FROM information_schema.columns
  WHERE table_schema = 'public'
), public_constraints AS (
  SELECT c.relname AS table_name,
         con.conname AS constraint_name,
         con.contype AS constraint_type,
         con.condeferrable AS deferrable,
         con.condeferred AS initially_deferred,
         pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
  FROM pg_catalog.pg_constraint AS con
  JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
), public_indexes AS (
  SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
  FROM pg_catalog.pg_indexes
  WHERE schemaname = 'public'
), schema_security AS (
  SELECT n.nspname AS schema_name,
         pg_catalog.pg_get_userbyid(n.nspowner) AS owner,
         n.nspacl::text AS acl,
         pg_catalog.has_schema_privilege('anon', n.oid, 'USAGE') AS anon_usage,
         pg_catalog.has_schema_privilege('anon', n.oid, 'CREATE') AS anon_create,
         pg_catalog.has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_usage,
         pg_catalog.has_schema_privilege('authenticated', n.oid, 'CREATE') AS authenticated_create,
         pg_catalog.has_schema_privilege('service_role', n.oid, 'USAGE') AS service_role_usage,
         pg_catalog.has_schema_privilege('service_role', n.oid, 'CREATE') AS service_role_create
  FROM pg_catalog.pg_namespace AS n
  WHERE n.nspname IN ('public', 'storage', 'auth', 'nexalvo_private')
), default_privileges AS (
  SELECT pg_catalog.pg_get_userbyid(d.defaclrole) AS owner,
         COALESCE(n.nspname, '*') AS schema_name,
         d.defaclobjtype AS object_type,
         d.defaclacl::text AS acl
  FROM pg_catalog.pg_default_acl AS d
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace
), public_views AS (
  SELECT v.viewname AS name,
         v.viewowner AS owner,
         c.reloptions,
         v.definition
  FROM pg_catalog.pg_views AS v
  JOIN pg_catalog.pg_namespace AS n ON n.nspname = v.schemaname
  JOIN pg_catalog.pg_class AS c ON c.relnamespace = n.oid AND c.relname = v.viewname
  WHERE v.schemaname = 'public'
), public_triggers AS (
  SELECT c.relname AS table_name,
         t.tgname AS trigger_name,
         t.tgenabled AS enabled,
         pg_catalog.pg_get_triggerdef(t.oid, true) AS definition
  FROM pg_catalog.pg_trigger AS t
  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
), storage_policies AS (
  SELECT * FROM pg_catalog.pg_policies WHERE schemaname = 'storage'
), migration_markers AS (
  SELECT jsonb_build_object(
    'cash_sale_guard_fingerprint', (
      SELECT fingerprint FROM public_functions WHERE name = 'fn_create_sale' ORDER BY oid LIMIT 1
    ),
    'purchase_idempotency_table', pg_catalog.to_regclass('public.purchase_order_request_keys') IS NOT NULL,
    'purchase_idempotency_rpc', pg_catalog.to_regprocedure('public.fn_create_purchase_order_idempotent(uuid,uuid,uuid,uuid,date,date,text,text,text,numeric,numeric,jsonb)') IS NOT NULL,
    'expense_idempotency_table', pg_catalog.to_regclass('public.expense_request_keys') IS NOT NULL,
    'expense_idempotency_rpc', pg_catalog.to_regprocedure('public.fn_create_expense_idempotent(uuid,uuid,uuid,date,text,text,numeric,text,boolean,text)') IS NOT NULL,
    'staff_profile_rpc', EXISTS (SELECT 1 FROM public_functions WHERE name = 'fn_manage_staff_profile'),
    'platform_private_schema', EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'nexalvo_private'),
    'platform_business_columns', (
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'businesses'
        AND column_name IN ('platform_status', 'license_type', 'license_granted_at',
          'license_granted_by', 'license_revoked_at', 'license_revoked_by', 'platform_updated_at')
    ),
    'platform_admin_rpc_count', (
      SELECT count(*) FROM public_functions
      WHERE name IN ('fn_platform_admin_list_businesses', 'fn_platform_admin_list_audit_logs', 'fn_platform_admin_execute')
    ),
    'product_image_bucket', EXISTS (
      SELECT 1 FROM storage.buckets WHERE id = 'nexalvo-product-images' AND public IS FALSE
    ),
    'product_image_policy_count', (
      SELECT count(*) FROM pg_catalog.pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN ('nexalvo_product_images_select', 'nexalvo_product_images_insert',
          'nexalvo_product_images_update', 'nexalvo_product_images_delete')
    )
  ) AS value
)
SELECT jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'project_ref_external_assertion', NULL,
  'security_definitions_complete', true,
  'counts', jsonb_build_object(
    'public_tables', (SELECT count(*) FROM public_tables),
    'public_rls_tables', (SELECT count(*) FROM public_tables WHERE rls),
    'public_policies', (SELECT count(*) FROM all_policies),
    'public_functions', (SELECT count(*) FROM public_functions),
    'public_security_definer_functions', (SELECT count(*) FROM public_functions WHERE security_definer),
    'public_role_table_grant_entries', (SELECT count(*) FROM all_table_grants)
  ),
  'tables', (SELECT jsonb_agg(to_jsonb(t) ORDER BY name) FROM public_tables AS t),
  'functions', (SELECT jsonb_agg(to_jsonb(f) - 'oid' ORDER BY name, arguments) FROM public_functions AS f),
  'all_policies', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY tablename, policyname), '[]'::jsonb) FROM all_policies AS p),
  'all_table_grants', (SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY table_name, grantee, privilege_type), '[]'::jsonb) FROM all_table_grants AS g),
  'all_column_grants', (SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY table_name, column_name, grantee, privilege_type), '[]'::jsonb) FROM all_column_grants AS g),
  'public_columns', (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY table_name, ordinal_position), '[]'::jsonb) FROM public_columns AS c),
  'public_constraints', (SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY table_name, constraint_name), '[]'::jsonb) FROM public_constraints AS c),
  'public_indexes', (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY table_name, index_name), '[]'::jsonb) FROM public_indexes AS i),
  'schema_security', (SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY schema_name), '[]'::jsonb) FROM schema_security AS s),
  'default_privileges', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY schema_name, owner, object_type), '[]'::jsonb) FROM default_privileges AS d),
  'public_views', (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY name), '[]'::jsonb) FROM public_views AS v),
  'public_triggers', (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY table_name, trigger_name), '[]'::jsonb) FROM public_triggers AS t),
  'storage_policies', (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY tablename, policyname), '[]'::jsonb) FROM storage_policies AS p),
  'migration_markers', (SELECT value FROM migration_markers),
  'sensitive_security', jsonb_build_object(
    'policies', (
      SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY tablename, policyname), '[]'::jsonb)
      FROM all_policies AS p
      WHERE p.tablename IN ('task_activity', 'users', 'sales', 'inventory_items',
        'inventory_stock', 'inventory_transactions', 'products')
    ),
    'grants', (
      SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY table_name, grantee, privilege_type), '[]'::jsonb)
      FROM all_table_grants AS g
      WHERE g.grantee IN ('anon', 'authenticated')
        AND g.table_name IN ('task_activity', 'users', 'sales', 'inventory_items',
          'inventory_stock', 'inventory_transactions', 'products')
    )
  )
) AS final_homologation_catalog;

ROLLBACK;
