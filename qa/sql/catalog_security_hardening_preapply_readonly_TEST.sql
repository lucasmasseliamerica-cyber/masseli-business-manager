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
), fingerprints AS (
  SELECT
    pg_catalog.md5(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
    )) AS employee_facade,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure('public.fn_read_sale_items_secure()')
    )) AS sale_item_facade,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
    )) AS client_audit,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure('nexalvo_backup.export_business_data(uuid)')
    )) AS business_export_private,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure('public.fn_export_business_data(uuid)')
    )) AS business_export_public_wrapper,
    (SELECT pg_catalog.md5(p.prosrc) FROM pg_catalog.pg_proc AS p
      WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_employees_secure()')) AS employee_body,
    (SELECT pg_catalog.md5(p.prosrc) FROM pg_catalog.pg_proc AS p
      WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_sale_items_secure()')) AS sale_item_body,
    (SELECT pg_catalog.md5(p.prosrc) FROM pg_catalog.pg_proc AS p
      WHERE p.oid = pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')) AS client_audit_body
), checks(name, passed, expected, observed) AS (
  SELECT 'employee_facade_fingerprint',
         COALESCE(f.employee_facade = '6a004cb40f967cc39f4c3bd20fec817e', false),
         '6a004cb40f967cc39f4c3bd20fec817e', f.employee_facade
  FROM fingerprints AS f
  UNION ALL
  SELECT 'sale_item_facade_fingerprint',
         COALESCE(f.sale_item_facade = 'b9c489bf2a75339768bcc19ba174821c', false),
         'b9c489bf2a75339768bcc19ba174821c', f.sale_item_facade
  FROM fingerprints AS f
  UNION ALL
  SELECT 'client_audit_fingerprint',
         COALESCE(f.client_audit = '2d1742df2500389b93028511b1cb17e5', false),
         '2d1742df2500389b93028511b1cb17e5', f.client_audit
  FROM fingerprints AS f
  UNION ALL
  SELECT 'employee_facade_body_fingerprint',
         COALESCE(f.employee_body = '540c5e0821623ebaac46e8d33ed947a7', false),
         '540c5e0821623ebaac46e8d33ed947a7', f.employee_body
  FROM fingerprints AS f
  UNION ALL
  SELECT 'sale_item_facade_body_fingerprint',
         COALESCE(f.sale_item_body = 'def30868edefbc15696aff8955f90296', false),
         'def30868edefbc15696aff8955f90296', f.sale_item_body
  FROM fingerprints AS f
  UNION ALL
  SELECT 'client_audit_body_fingerprint',
         COALESCE(f.client_audit_body = '4cf28670a1afda97f728954c6b58ff60', false),
         '4cf28670a1afda97f728954c6b58ff60', f.client_audit_body
  FROM fingerprints AS f
  UNION ALL
  SELECT 'reviewed_function_attributes',
         (SELECT count(*) = 1 FROM pg_catalog.pg_proc AS p
          JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
          WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
            AND p.prorettype = pg_catalog.to_regtype('public.employees')
            AND p.proretset AND p.prosecdef AND p.provolatile = 's'
            AND p.proconfig = ARRAY['search_path=""']::text[] AND l.lanname = 'sql')
         AND
         (SELECT count(*) = 1 FROM pg_catalog.pg_proc AS p
          JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
          WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_sale_items_secure()')
            AND p.prorettype = pg_catalog.to_regtype('public.sale_items')
            AND p.proretset AND p.prosecdef AND p.provolatile = 's'
            AND p.proconfig = ARRAY['search_path=""']::text[] AND l.lanname = 'sql')
         AND
         (SELECT count(*) = 1 FROM pg_catalog.pg_proc AS p
          JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
          WHERE p.oid = pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
            AND p.prorettype = pg_catalog.to_regtype('public.audit_logs')
            AND NOT p.proretset AND p.prosecdef AND p.provolatile = 'v'
            AND p.proconfig = ARRAY['search_path=public']::text[] AND l.lanname = 'plpgsql'),
         NULL, NULL
  UNION ALL
  SELECT 'reviewed_function_owner_and_execute_acl',
         pg_catalog.has_function_privilege('authenticated', 'public.fn_read_employees_secure()', 'EXECUTE')
         AND pg_catalog.has_function_privilege('service_role', 'public.fn_read_employees_secure()', 'EXECUTE')
         AND NOT pg_catalog.has_function_privilege('anon', 'public.fn_read_employees_secure()', 'EXECUTE')
         AND pg_catalog.has_function_privilege('authenticated', 'public.fn_read_sale_items_secure()', 'EXECUTE')
         AND pg_catalog.has_function_privilege('service_role', 'public.fn_read_sale_items_secure()', 'EXECUTE')
         AND NOT pg_catalog.has_function_privilege('anon', 'public.fn_read_sale_items_secure()', 'EXECUTE')
         AND pg_catalog.has_function_privilege('authenticated', 'public.fn_write_audit(text,text)', 'EXECUTE')
         AND pg_catalog.has_function_privilege('service_role', 'public.fn_write_audit(text,text)', 'EXECUTE')
         AND NOT pg_catalog.has_function_privilege('anon', 'public.fn_write_audit(text,text)', 'EXECUTE')
         AND (
           SELECT count(*) = 3 FROM pg_catalog.pg_proc AS p
           WHERE p.oid IN (
             pg_catalog.to_regprocedure('public.fn_read_employees_secure()'),
             pg_catalog.to_regprocedure('public.fn_read_sale_items_secure()'),
             pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
           ) AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
         ),
         NULL, NULL
  UNION ALL
  SELECT 'business_export_private_fingerprint',
         COALESCE(f.business_export_private = 'cabc5e9d96a6242ae42ade1d140b087e', false),
         'cabc5e9d96a6242ae42ade1d140b087e', f.business_export_private
  FROM fingerprints AS f
  UNION ALL
  SELECT 'business_export_public_wrapper_fingerprint',
         COALESCE(f.business_export_public_wrapper = '2bdd2117a84d5a95778cdf6392b11a49', false),
         '2bdd2117a84d5a95778cdf6392b11a49', f.business_export_public_wrapper
  FROM fingerprints AS f
  UNION ALL
  SELECT 'reviewed_sensitive_table_grants_present',
         pg_catalog.has_table_privilege('authenticated', 'public.employees', 'SELECT')
         AND pg_catalog.has_column_privilege('authenticated', 'public.employees', 'hourly_rate', 'SELECT')
         AND pg_catalog.has_table_privilege('authenticated', 'public.sale_items', 'SELECT')
         AND pg_catalog.has_column_privilege('authenticated', 'public.sale_items', 'unit_cost_snapshot', 'SELECT'),
         NULL, NULL
  UNION ALL
  SELECT 'api_roles_cannot_create_in_public',
         NOT pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE')
         AND NOT pg_catalog.has_schema_privilege('anon', 'public', 'CREATE'),
         NULL, NULL
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
         ),
         NULL, NULL
  UNION ALL
  SELECT 'inventory_tenant_guard_not_already_installed',
         pg_catalog.to_regprocedure('public.trg_validate_inventory_item_tenant_references()') IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_trigger
           WHERE tgrelid = 'public.inventory_items'::pg_catalog.regclass
             AND tgname = 'inventory_items_validate_tenant_references'
             AND NOT tgisinternal
         ),
         NULL, NULL
  UNION ALL
  SELECT 'current_functions_deny_anonymous_execution',
         NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_proc AS p
           JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
           WHERE n.nspname IN ('public', 'nexalvo_backup', 'nexalvo_platform')
             AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
         ),
         NULL, NULL
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'status', CASE WHEN pg_catalog.bool_and(passed) THEN 'PASS' ELSE 'BLOCKED' END,
  'checks', pg_catalog.jsonb_agg(
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'name', name,
      'passed', passed,
      'expected', expected,
      'observed', observed
    )) ORDER BY name
  )
) AS catalog_security_hardening_preapply
FROM checks;

ROLLBACK;
