-- NEXALVO catalog security hardening preflight — READ ONLY, TEST only.
-- Expected to PASS only after migrations/20261017_catalog_security_hardening_TEST.sql is applied
-- with separate authorization to Supabase TEST msinksoilkluooxenecy.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

WITH checks AS (
  SELECT 'employee_salary_not_directly_selectable' AS name,
         NOT pg_catalog.has_column_privilege('authenticated', 'public.employees', 'hourly_rate', 'SELECT') AS passed
  UNION ALL
  SELECT 'employee_non_sensitive_columns_remain_readable',
         pg_catalog.has_column_privilege('authenticated', 'public.employees', 'id', 'SELECT')
         AND pg_catalog.has_column_privilege('authenticated', 'public.employees', 'name', 'SELECT')
         AND pg_catalog.has_column_privilege('authenticated', 'public.employees', 'updated_at', 'SELECT')
  UNION ALL
  SELECT 'sale_item_cost_not_directly_selectable',
         NOT pg_catalog.has_column_privilege('authenticated', 'public.sale_items', 'unit_cost_snapshot', 'SELECT')
  UNION ALL
  SELECT 'sale_item_operational_columns_remain_readable',
         pg_catalog.has_column_privilege('authenticated', 'public.sale_items', 'id', 'SELECT')
         AND pg_catalog.has_column_privilege('authenticated', 'public.sale_items', 'sale_id', 'SELECT')
         AND pg_catalog.has_column_privilege('authenticated', 'public.sale_items', 'unit_price', 'SELECT')
  UNION ALL
  SELECT 'client_audit_entries_have_explicit_provenance',
         COALESCE(pg_catalog.position('Client: ' IN pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
         )) > 0
         AND pg_catalog.position('2000 characters' IN pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
         )) > 0, false)
  UNION ALL
  SELECT 'employee_facade_scopes_owner_manager_employee',
         COALESCE(pg_catalog.position('e.manager_id = a.employee_id' IN pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
         )) > 0
         AND pg_catalog.position('e.id = a.employee_id' IN pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
         )) > 0, false)
  UNION ALL
  SELECT 'employee_facade_exact_target_body',
         COALESCE((SELECT pg_catalog.md5(p.prosrc) = '2c26a316e5cfc46dcfa187c550eb7108'
                   FROM pg_catalog.pg_proc AS p
                   WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_employees_secure()')), false)
  UNION ALL
  SELECT 'sale_item_facade_preserved_body',
         COALESCE((SELECT pg_catalog.md5(p.prosrc) = 'def30868edefbc15696aff8955f90296'
                   FROM pg_catalog.pg_proc AS p
                   WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_sale_items_secure()')), false)
  UNION ALL
  SELECT 'client_audit_exact_target_body',
         COALESCE((SELECT pg_catalog.md5(p.prosrc) = '75c32789a68a73e29a8a82d33e3aad27'
                   FROM pg_catalog.pg_proc AS p
                   WHERE p.oid = pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')), false)
  UNION ALL
  SELECT 'hardened_function_attributes',
         (SELECT count(*) = 1 FROM pg_catalog.pg_proc AS p
          JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
          WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
            AND p.prorettype = pg_catalog.to_regtype('public.employees')
            AND p.proretset AND p.prosecdef AND p.provolatile = 's'
            AND p.proconfig = ARRAY['search_path=""']::text[] AND l.lanname = 'sql')
         AND
         (SELECT count(*) = 1 FROM pg_catalog.pg_proc AS p
          JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
          WHERE p.oid = pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
            AND p.prorettype = pg_catalog.to_regtype('public.audit_logs')
            AND NOT p.proretset AND p.prosecdef AND p.provolatile = 'v'
            AND p.proconfig = ARRAY['search_path=""']::text[] AND l.lanname = 'plpgsql')
  UNION ALL
  SELECT 'hardened_function_execute_acl',
         pg_catalog.has_function_privilege('authenticated', 'public.fn_read_employees_secure()', 'EXECUTE')
         AND pg_catalog.has_function_privilege('service_role', 'public.fn_read_employees_secure()', 'EXECUTE')
         AND NOT pg_catalog.has_function_privilege('anon', 'public.fn_read_employees_secure()', 'EXECUTE')
         AND pg_catalog.has_function_privilege('authenticated', 'public.fn_read_sale_items_secure()', 'EXECUTE')
         AND pg_catalog.has_function_privilege('service_role', 'public.fn_read_sale_items_secure()', 'EXECUTE')
         AND NOT pg_catalog.has_function_privilege('anon', 'public.fn_read_sale_items_secure()', 'EXECUTE')
         AND pg_catalog.has_function_privilege('authenticated', 'public.fn_write_audit(text,text)', 'EXECUTE')
         AND pg_catalog.has_function_privilege('service_role', 'public.fn_write_audit(text,text)', 'EXECUTE')
         AND NOT pg_catalog.has_function_privilege('anon', 'public.fn_write_audit(text,text)', 'EXECUTE')
  UNION ALL
  SELECT 'employee_and_user_policies_are_authenticated_only',
         NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_policies
           WHERE schemaname = 'public' AND policyname IN ('employees_select', 'users_select')
             AND roles @> ARRAY['public']::name[]
         )
  UNION ALL
  SELECT 'no_public_role_policies_remain',
         NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_policies
           WHERE schemaname = 'public' AND roles @> ARRAY['public']::name[]
         )
  UNION ALL
  SELECT 'trigger_functions_are_not_api_endpoints',
         NOT pg_catalog.has_function_privilege('authenticated', 'public.trg_prevent_self_privilege_escalation()', 'EXECUTE')
         AND NOT pg_catalog.has_function_privilege('authenticated', 'public.trg_set_updated_at()', 'EXECUTE')
         AND NOT pg_catalog.has_function_privilege('authenticated', 'public.trg_validate_user_permission_overrides()', 'EXECUTE')
  UNION ALL
  SELECT 'inventory_supplier_is_tenant_guarded',
         pg_catalog.to_regprocedure('public.trg_validate_inventory_item_tenant_references()') IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM pg_catalog.pg_trigger
           WHERE tgrelid = 'public.inventory_items'::pg_catalog.regclass
             AND tgname = 'inventory_items_validate_tenant_references'
             AND tgenabled <> 'D'
             AND NOT tgisinternal
         )
         AND NOT pg_catalog.has_function_privilege(
           'authenticated', 'public.trg_validate_inventory_item_tenant_references()', 'EXECUTE'
         )
  UNION ALL
  SELECT 'future_postgres_functions_require_explicit_api_grant',
         NOT EXISTS (
           SELECT 1
           FROM pg_catalog.pg_default_acl AS d
           CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) AS a
           LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace
           WHERE pg_catalog.pg_get_userbyid(d.defaclrole) = 'postgres'
             AND n.nspname = 'public'
             AND d.defaclobjtype = 'f'
             AND pg_catalog.pg_get_userbyid(a.grantee) IN ('anon', 'authenticated')
             AND a.privilege_type = 'EXECUTE'
         )
)
SELECT pg_catalog.jsonb_build_object(
  'target', 'msinksoilkluooxenecy',
  'status', CASE WHEN pg_catalog.bool_and(passed) THEN 'PASS' ELSE 'FAIL' END,
  'checks', pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', name, 'passed', passed) ORDER BY name)
) AS catalog_security_hardening_preflight
FROM checks;

ROLLBACK;
