-- NEXALVO catalog security hardening preflight — READ ONLY, TEST only.
-- Expected to PASS only after migrations/20261017_catalog_security_hardening_TEST.sql is applied
-- with separate authorization to Supabase TEST msinksoilkluooxenecy.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

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
         pg_catalog.position('Client: ' IN pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
         )) > 0
         AND pg_catalog.position('2000 characters' IN pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
         )) > 0
  UNION ALL
  SELECT 'employee_facade_scopes_owner_manager_employee',
         pg_catalog.position('e.manager_id = a.employee_id' IN pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
         )) > 0
         AND pg_catalog.position('e.id = a.employee_id' IN pg_catalog.pg_get_functiondef(
           pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
         )) > 0
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
