-- NEXALVO catalog security hardening PRE-APPLY — READ ONLY, TEST only.
-- Run only after independently selecting Supabase TEST msinksoilkluooxenecy.
-- PASS means the reviewed vulnerable baseline is still present and the prepared migration may be
-- considered for a separately authorized TEST-only application. It does not apply any change.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

WITH expected_public_policies(table_name, policy_name) AS (
  VALUES
    ('cash_registers', 'cashregisters_select'),
    ('customers', 'customers_select'),
    ('employees', 'employees_select'),
    ('inventory_items', 'invitems_select'),
    ('inventory_items', 'invitems_write'),
    ('inventory_stock', 'invstock_select'),
    ('loyalty_rewards', 'loyaltyrewards_select'),
    ('loyalty_transactions', 'loyaltytx_select'),
    ('product_recipes', 'recipes_delete'),
    ('product_recipes', 'recipes_write'),
    ('products', 'products_write'),
    ('role_default_permissions', 'role_defaults_readable'),
    ('sale_items', 'sale_items_select'),
    ('sales', 'sales_select'),
    ('shift_breaks', 'shiftbreaks_select'),
    ('shifts', 'shifts_select'),
    ('suppliers', 'suppliers_delete'),
    ('task_activity', 'task_activity_select'),
    ('task_activity', 'task_activity_write'),
    ('users', 'users_select'),
    ('waste_transactions', 'waste_select')
), checks AS (
  SELECT 'employee_facade_fingerprint' AS name,
         COALESCE(pg_catalog.md5(pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
         )) = '1c13bdeb159e0d78db0a200055cdb36a', false) AS passed
  UNION ALL
  SELECT 'sale_item_facade_fingerprint',
         COALESCE(pg_catalog.md5(pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('public.fn_read_sale_items_secure()')
         )) = '161e5147cd4eae4ca6e9a4c074af7cb6', false)
  UNION ALL
  SELECT 'client_audit_fingerprint',
         COALESCE(pg_catalog.md5(pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
         )) = '4ab39d24cd80134b7ca7812c8a38dd7d', false)
  UNION ALL
  SELECT 'business_export_private_fingerprint',
         COALESCE(pg_catalog.md5(pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('nexalvo_backup.export_business_data(uuid)')
         )) = 'cabc5e9d96a6242ae42ade1d140b087e', false)
  UNION ALL
  SELECT 'business_export_public_wrapper_fingerprint',
         COALESCE(pg_catalog.md5(pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('public.fn_export_business_data(uuid)')
         )) = '2bdd2117a84d5a95778cdf6392b11a49', false)
  UNION ALL
  SELECT 'reviewed_sensitive_table_grants_present',
         pg_catalog.has_table_privilege('authenticated', 'public.employees', 'SELECT')
         AND pg_catalog.has_column_privilege('authenticated', 'public.employees', 'hourly_rate', 'SELECT')
         AND pg_catalog.has_table_privilege('authenticated', 'public.sale_items', 'SELECT')
         AND pg_catalog.has_column_privilege('authenticated', 'public.sale_items', 'unit_cost_snapshot', 'SELECT')
  UNION ALL
  SELECT 'api_roles_cannot_create_in_public',
         NOT pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE')
         AND NOT pg_catalog.has_schema_privilege('anon', 'public', 'CREATE')
  UNION ALL
  SELECT 'exact_reviewed_public_policy_set',
         (SELECT count(*) FROM pg_catalog.pg_policies
           WHERE schemaname = 'public' AND roles = ARRAY['public']::name[]) = 21
         AND NOT EXISTS (
           SELECT 1 FROM expected_public_policies AS e
           WHERE NOT EXISTS (
             SELECT 1 FROM pg_catalog.pg_policies AS p
             WHERE p.schemaname = 'public'
               AND p.tablename = e.table_name
               AND p.policyname = e.policy_name
               AND p.roles = ARRAY['public']::name[]
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_policies AS p
           WHERE p.schemaname = 'public'
             AND p.roles = ARRAY['public']::name[]
             AND NOT EXISTS (
               SELECT 1 FROM expected_public_policies AS e
               WHERE e.table_name = p.tablename AND e.policy_name = p.policyname
             )
         )
  UNION ALL
  SELECT 'inventory_tenant_guard_not_already_installed',
         pg_catalog.to_regprocedure('public.trg_validate_inventory_item_tenant_references()') IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_trigger
           WHERE tgrelid = 'public.inventory_items'::pg_catalog.regclass
             AND tgname = 'inventory_items_validate_tenant_references'
             AND NOT tgisinternal
         )
  UNION ALL
  SELECT 'current_functions_deny_anonymous_execution',
         NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_proc AS p
           JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
           WHERE n.nspname IN ('public', 'nexalvo_backup', 'nexalvo_platform')
             AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
         )
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'status', CASE WHEN pg_catalog.bool_and(passed) THEN 'PASS' ELSE 'BLOCKED' END,
  'checks', pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('name', name, 'passed', passed) ORDER BY name
  )
) AS catalog_security_hardening_preapply
FROM checks;

ROLLBACK;
