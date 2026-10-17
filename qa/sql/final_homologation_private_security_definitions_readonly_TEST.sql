-- NEXALVO TEST referenced private-schema security export — READ ONLY.
-- Run only after independently selecting Supabase TEST msinksoilkluooxenecy.
-- This reads catalog metadata/definitions for schemas invoked by public API wrappers. It never
-- reads tenant rows. Secret-scan the JSON before retaining any function definition.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';

WITH target_schemas AS (
  SELECT n.oid, n.nspname
  FROM pg_catalog.pg_namespace AS n
  WHERE n.nspname IN ('nexalvo_platform', 'nexalvo_backup')
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
  FROM target_schemas AS n
), private_relations AS (
  SELECT n.nspname AS schema_name,
         c.relname AS name,
         c.relkind AS kind,
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
  JOIN target_schemas AS n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S')
), private_functions AS (
  SELECT n.nspname AS schema_name,
         p.proname AS name,
         pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
         pg_catalog.pg_get_function_result(p.oid) AS result_type,
         pg_catalog.pg_get_userbyid(p.proowner) AS owner,
         l.lanname AS language,
         p.prosecdef AS security_definer,
         p.provolatile AS volatility,
         p.proconfig AS settings,
         p.proacl::text AS acl,
         pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
         pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
         pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
         pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS fingerprint,
         pg_catalog.pg_get_functiondef(p.oid) AS definition
  FROM pg_catalog.pg_proc AS p
  JOIN target_schemas AS n ON n.oid = p.pronamespace
  JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
  WHERE p.prokind = 'f'
), private_policies AS (
  SELECT p.*
  FROM pg_catalog.pg_policies AS p
  WHERE p.schemaname IN ('nexalvo_platform', 'nexalvo_backup')
), private_table_grants AS (
  SELECT g.*
  FROM information_schema.role_table_grants AS g
  WHERE g.table_schema IN ('nexalvo_platform', 'nexalvo_backup')
), private_column_grants AS (
  SELECT g.*
  FROM information_schema.role_column_grants AS g
  WHERE g.table_schema IN ('nexalvo_platform', 'nexalvo_backup')
), private_triggers AS (
  SELECT n.nspname AS schema_name,
         c.relname AS table_name,
         t.tgname AS trigger_name,
         t.tgenabled AS enabled,
         pg_catalog.pg_get_triggerdef(t.oid, true) AS definition
  FROM pg_catalog.pg_trigger AS t
  JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
  JOIN target_schemas AS n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'project_ref_external_assertion', NULL,
  'schemas_expected', pg_catalog.jsonb_build_array('nexalvo_platform', 'nexalvo_backup'),
  'counts', pg_catalog.jsonb_build_object(
    'schemas', (SELECT count(*) FROM target_schemas),
    'relations', (SELECT count(*) FROM private_relations),
    'functions', (SELECT count(*) FROM private_functions),
    'security_definer_functions', (SELECT count(*) FROM private_functions WHERE security_definer),
    'policies', (SELECT count(*) FROM private_policies),
    'table_grants', (SELECT count(*) FROM private_table_grants),
    'column_grants', (SELECT count(*) FROM private_column_grants)
  ),
  'schema_security', (SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(s) ORDER BY schema_name), '[]'::jsonb) FROM schema_security AS s),
  'relations', (SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(r) ORDER BY schema_name, name), '[]'::jsonb) FROM private_relations AS r),
  'functions', (SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(f) ORDER BY schema_name, name, arguments), '[]'::jsonb) FROM private_functions AS f),
  'policies', (SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(p) ORDER BY schemaname, tablename, policyname), '[]'::jsonb) FROM private_policies AS p),
  'table_grants', (SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(g) ORDER BY table_schema, table_name, grantee, privilege_type), '[]'::jsonb) FROM private_table_grants AS g),
  'column_grants', (SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(g) ORDER BY table_schema, table_name, column_name, grantee, privilege_type), '[]'::jsonb) FROM private_column_grants AS g),
  'triggers', (SELECT COALESCE(pg_catalog.jsonb_agg(to_jsonb(t) ORDER BY schema_name, table_name, trigger_name), '[]'::jsonb) FROM private_triggers AS t)
) AS final_private_security_catalog;

ROLLBACK;
