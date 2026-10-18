-- READ ONLY. Run against NEXALVO TEST before reviewing 20261016_platform_admin_TEST.sql.
-- Expected project: msinksoilkluooxenecy. This query does not identify the project by itself;
-- the operator must verify the selected Supabase project before opening the SQL editor.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

WITH expected_columns(table_name, column_name) AS (
  VALUES
    ('businesses', 'id'),
    ('businesses', 'name'),
    ('businesses', 'created_at'),
    ('users', 'id'),
    ('users', 'business_id'),
    ('users', 'active')
)
SELECT
  e.table_name,
  e.column_name,
  (c.column_name IS NOT NULL) AS required_column_exists,
  c.data_type,
  c.udt_name
FROM expected_columns AS e
LEFT JOIN information_schema.columns AS c
  ON c.table_schema = 'public'
 AND c.table_name = e.table_name
 AND c.column_name = e.column_name
ORDER BY e.table_name, e.column_name;

SELECT
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'businesses'
  AND c.column_name IN (
    'platform_status', 'license_type', 'license_granted_at', 'license_granted_by',
    'license_revoked_at', 'license_revoked_by', 'platform_updated_at'
  )
ORDER BY c.column_name;

SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE (n.nspname = 'public' AND p.proname LIKE 'fn_platform_admin_%')
   OR n.nspname = 'nexalvo_private'
ORDER BY n.nspname, p.proname, identity_arguments;

SELECT
  n.nspname AS schema_name,
  c.relname AS object_name,
  c.relkind,
  c.relrowsecurity AS rls_enabled
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'nexalvo_private'
ORDER BY c.relname;

SELECT
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'nexalvo_private'
ORDER BY table_name, grantee, privilege_type;

WITH legacy_authority AS (
  SELECT
    pg_catalog.to_regnamespace('nexalvo_platform') IS NOT NULL AS private_schema_exists,
    pg_catalog.to_regprocedure('public.fn_platform_access()') IS NOT NULL AS access_wrapper_exists,
    pg_catalog.to_regprocedure(
      'public.fn_platform_company_directory(text,integer,integer)'
    ) IS NOT NULL AS directory_wrapper_exists,
    pg_catalog.to_regprocedure(
      'public.fn_platform_provision_company(uuid,text,text,text,text)'
    ) IS NOT NULL AS provision_wrapper_exists,
    pg_catalog.to_regprocedure(
      'public.fn_platform_assign_first_owner(uuid,uuid,text)'
    ) IS NOT NULL AS owner_wrapper_exists
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'legacy_authority_reconciliation_required',
    private_schema_exists OR access_wrapper_exists OR directory_wrapper_exists
      OR provision_wrapper_exists OR owner_wrapper_exists,
  'private_schema_exists', private_schema_exists,
  'legacy_public_wrappers', pg_catalog.jsonb_build_object(
    'access', access_wrapper_exists,
    'directory', directory_wrapper_exists,
    'provision', provision_wrapper_exists,
    'assign_first_owner', owner_wrapper_exists
  ),
  'prepared_platform_admin_ready_to_apply',
    NOT (private_schema_exists OR access_wrapper_exists OR directory_wrapper_exists
      OR provision_wrapper_exists OR owner_wrapper_exists)
) AS platform_admin_legacy_compatibility
FROM legacy_authority;

ROLLBACK;
