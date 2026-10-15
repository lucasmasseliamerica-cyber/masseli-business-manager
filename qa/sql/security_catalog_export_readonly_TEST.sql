-- NEXALVO security catalog export — READ ONLY.
-- Run ONLY through the approved read-only integration for Supabase TEST msinksoilkluooxenecy.
-- Verify the external project reference before execution; database SQL cannot prove it by itself.
-- Do not commit the output until it has been reviewed for embedded secrets in function source.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

WITH tables AS (
  SELECT c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
         pg_get_userbyid(c.relowner) AS owner
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
), functions AS (
  SELECT p.oid, p.proname,
         pg_get_function_identity_arguments(p.oid) AS arguments,
         pg_get_function_result(p.oid) AS result,
         l.lanname AS language,
         pg_get_userbyid(p.proowner) AS owner,
         r.rolsuper AS owner_superuser,
         r.rolbypassrls AS owner_bypass_rls,
         p.prosecdef AS security_definer,
         p.proleakproof AS leakproof,
         p.provolatile AS volatility,
         p.proparallel AS parallel_safety,
         p.proconfig AS settings,
         pg_get_functiondef(p.oid) AS definition
  FROM pg_proc AS p
  JOIN pg_namespace AS n ON n.oid = p.pronamespace
  JOIN pg_roles AS r ON r.oid = p.proowner
  JOIN pg_language AS l ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND p.prokind = 'f'
), client_roles AS (
  SELECT oid, rolname, rolsuper, rolbypassrls, rolinherit, rolcanlogin
  FROM pg_roles
  WHERE rolname IN ('anon', 'authenticated')
), table_grants AS (
  SELECT t.relname, r.rolname, v.privilege,
         has_table_privilege(r.rolname, t.oid, v.privilege) AS allowed
  FROM tables AS t
  CROSS JOIN client_roles AS r
  CROSS JOIN (VALUES
    ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
  ) AS v(privilege)
), function_grants AS (
  SELECT f.proname, f.arguments, r.rolname,
         has_function_privilege(r.rolname, f.oid, 'EXECUTE') AS allowed
  FROM functions AS f
  CROSS JOIN client_roles AS r
)
SELECT jsonb_build_object(
  'counts', jsonb_build_object(
    'tables', (SELECT count(*) FROM tables),
    'policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
    'functions', (SELECT count(*) FROM functions)
  ),
  'client_roles', (SELECT jsonb_agg(to_jsonb(r) - 'oid' ORDER BY rolname) FROM client_roles AS r),
  'tables', (SELECT jsonb_agg(to_jsonb(t) - 'oid' ORDER BY relname) FROM tables AS t),
  'policies', (
    SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename, policyname)
    FROM pg_policies AS p WHERE schemaname = 'public'
  ),
  'effective_table_grants', (
    SELECT jsonb_agg(to_jsonb(g) ORDER BY relname, rolname, privilege)
    FROM table_grants AS g
  ),
  'column_grants', (
    SELECT jsonb_agg(to_jsonb(g) ORDER BY table_name, column_name, grantee, privilege_type)
    FROM information_schema.column_privileges AS g
    WHERE table_schema = 'public'
  ),
  'functions', (
    SELECT jsonb_agg(to_jsonb(f) - 'oid' ORDER BY proname, arguments)
    FROM functions AS f
  ),
  'effective_function_grants', (
    SELECT jsonb_agg(to_jsonb(g) ORDER BY proname, arguments, rolname)
    FROM function_grants AS g
  ),
  'schema_acl', (
    SELECT jsonb_agg(jsonb_build_object(
      'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      'privilege', a.privilege_type,
      'grantable', a.is_grantable
    ) ORDER BY CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type)
    FROM pg_namespace AS n
    CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) AS a
    WHERE n.nspname = 'public'
  ),
  'table_acl', (
    SELECT jsonb_agg(jsonb_build_object(
      'relation', t.relname,
      'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      'privilege', a.privilege_type,
      'grantable', a.is_grantable
    ) ORDER BY t.relname, CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type)
    FROM tables AS t
    JOIN pg_class AS c ON c.oid = t.oid
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) AS a
  ),
  'function_acl', (
    SELECT jsonb_agg(jsonb_build_object(
      'function', f.proname,
      'arguments', f.arguments,
      'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      'privilege', a.privilege_type,
      'grantable', a.is_grantable
    ) ORDER BY f.proname, f.arguments,
      CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type)
    FROM functions AS f
    JOIN pg_proc AS p ON p.oid = f.oid
    CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS a
  ),
  'default_acl', (
    SELECT jsonb_agg(jsonb_build_object(
      'owner', pg_get_userbyid(d.defaclrole),
      'schema', COALESCE(n.nspname, '*'),
      'object_type', d.defaclobjtype,
      'grantee', CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
      'privilege', a.privilege_type,
      'grantable', a.is_grantable
    ) ORDER BY pg_get_userbyid(d.defaclrole), COALESCE(n.nspname, '*'), d.defaclobjtype,
      CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END, a.privilege_type)
    FROM pg_default_acl AS d
    LEFT JOIN pg_namespace AS n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
    WHERE n.nspname = 'public' OR d.defaclnamespace = 0
  )
) AS security_catalog;

ROLLBACK;
