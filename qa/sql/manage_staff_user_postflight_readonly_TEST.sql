-- TEST msinksoilkluooxenecy only. Catalog verification; never calls either business RPC.
-- Expected RPC body comes from the unchanged reviewed 20261017 migration, CRLF normalized.
-- A PASS verifies the SQL contract/ACL, not Edge configuration or real role homologation.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
-- pg_get_functiondef renders referenced public types according to search_path.
-- Keep public visible, as in the reviewed migration's legacy fingerprint guard.
SET LOCAL search_path = public;

WITH ids AS (
  SELECT pg_catalog.to_regprocedure('public.fn_manage_staff_profile(text,uuid,uuid,uuid,uuid,text,text,text,jsonb,boolean)') AS new_oid,
    pg_catalog.to_regprocedure('public.fn_save_user_profile(uuid,text,text,text,uuid,boolean,jsonb)') AS old_oid
), state AS (
  SELECT ids.*, n.prosecdef, n.proconfig, n.proargnames, n.prorettype, n.provolatile,
    n.prolang, n.proowner,
    pg_catalog.md5(pg_catalog.replace(n.prosrc, E'\r\n', E'\n')) AS normalized_body_md5,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(o.oid)) AS legacy_definition_md5,
    CASE WHEN n.oid IS NOT NULL THEN pg_catalog.has_function_privilege('service_role', n.oid, 'EXECUTE') ELSE false END AS new_service,
    CASE WHEN n.oid IS NOT NULL THEN pg_catalog.has_function_privilege('authenticated', n.oid, 'EXECUTE') ELSE false END AS new_authenticated,
    CASE WHEN n.oid IS NOT NULL THEN pg_catalog.has_function_privilege('anon', n.oid, 'EXECUTE') ELSE false END AS new_anon,
    EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(n.proacl, pg_catalog.acldefault('f', n.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS new_public,
    CASE WHEN o.oid IS NOT NULL THEN pg_catalog.has_function_privilege('service_role', o.oid, 'EXECUTE') ELSE false END AS old_service,
    CASE WHEN o.oid IS NOT NULL THEN pg_catalog.has_function_privilege('authenticated', o.oid, 'EXECUTE') ELSE false END AS old_authenticated,
    CASE WHEN o.oid IS NOT NULL THEN pg_catalog.has_function_privilege('anon', o.oid, 'EXECUTE') ELSE false END AS old_anon,
    EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(o.proacl, pg_catalog.acldefault('f', o.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS old_public
  FROM ids LEFT JOIN pg_catalog.pg_proc n ON n.oid=ids.new_oid
    LEFT JOIN pg_catalog.pg_proc o ON o.oid=ids.old_oid
), checks(name, passed) AS (
  SELECT 'new_exact_signature', new_oid IS NOT NULL FROM state
  UNION ALL SELECT 'new_no_overloads', (SELECT count(*)=1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='public' AND p.proname='fn_manage_staff_profile')
  UNION ALL SELECT 'new_returns_users', COALESCE(prorettype=pg_catalog.to_regtype('public.users'),false) FROM state
  UNION ALL SELECT 'new_plpgsql_volatile', COALESCE(prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql') AND provolatile='v',false) FROM state
  UNION ALL SELECT 'new_security_invoker', COALESCE(NOT prosecdef,false) FROM state
  UNION ALL SELECT 'new_empty_search_path', COALESCE(proconfig=ARRAY['search_path=""']::text[],false) FROM state
  UNION ALL SELECT 'new_argument_names', COALESCE(proargnames=ARRAY['p_operation','p_actor_user_id','p_target_user_id','p_business_id','p_employee_id','p_name','p_username','p_role','p_permission_overrides','p_active']::text[],false) FROM state
  UNION ALL SELECT 'new_reviewed_body', COALESCE(normalized_body_md5='65cf7b1e3076244ae9f464c39f9097ab',false) FROM state
  UNION ALL SELECT 'new_owner_postgres', COALESCE(pg_catalog.pg_get_userbyid(proowner)='postgres',false) FROM state
  UNION ALL SELECT 'new_service_only', new_service AND NOT new_authenticated AND NOT new_anon AND NOT new_public FROM state
  UNION ALL SELECT 'legacy_reviewed_definition', COALESCE(legacy_definition_md5='4e02f0128a171ec8a6e65de291f115e7',false) FROM state
  UNION ALL SELECT 'legacy_service_only', old_service AND NOT old_authenticated AND NOT old_anon AND NOT old_public FROM state
  UNION ALL SELECT 'service_table_privileges', count(*)=3 AND COALESCE(bool_and(
      pg_catalog.has_table_privilege('service_role',c.oid,'SELECT')
      AND (c.relname='employees' OR pg_catalog.has_table_privilege('service_role',c.oid,'INSERT'))
      AND (c.relname<>'users' OR pg_catalog.has_table_privilege('service_role',c.oid,'UPDATE'))),false)
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace
    WHERE ns.nspname='public' AND c.relname IN ('users','employees','audit_logs') AND c.relkind='r'
), legacy_acl AS (
  SELECT pg_catalog.jsonb_build_object('owner',pg_catalog.pg_get_userbyid(p.proowner),'raw_acl',p.proacl,
    'entries',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
      'grantor',pg_catalog.pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
      ORDER BY a.grantee,a.privilege_type) FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) a)) AS value
  FROM ids JOIN pg_catalog.pg_proc p ON p.oid=ids.old_oid
), related_triggers AS (
  SELECT ns.nspname AS table_schema,c.relname AS table_name,t.tgname AS trigger_name,t.tgenabled AS enabled,
    pn.nspname||'.'||p.proname AS function_name,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS function_definition_md5,
    pg_catalog.pg_get_triggerdef(t.oid,true) AS definition,
    p.prosrc ~* '(insert\s+into|update|delete\s+from)\s+(public\.)?"?users"?' AS may_write_users
  FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
    JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace
    JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid JOIN pg_catalog.pg_namespace pn ON pn.oid=p.pronamespace
  WHERE NOT t.tgisinternal AND ((ns.nspname='public' AND c.relname IN ('users','employees','audit_logs')) OR (ns.nspname='auth' AND c.relname='users'))
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected','msinksoilkluooxenecy',
  'scope','STAFF_CATALOG_ONLY_NO_BUSINESS_RPC',
  'status',CASE WHEN count(*)=13 AND bool_and(passed) THEN 'PASS_STAFF_SQL_CONTRACT' ELSE 'BLOCKED_STAFF_SQL_CONTRACT' END,
  'expected',13,'passed',count(*) FILTER (WHERE passed),'failed',count(*) FILTER (WHERE NOT passed),
  'checks',pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',name,'passed',passed) ORDER BY name),
  'legacy_acl_snapshot',(SELECT value FROM legacy_acl),
  'related_triggers',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(related_triggers) ORDER BY table_schema,table_name,trigger_name) FROM related_triggers),'[]'::jsonb)
) AS manage_staff_user_postflight
FROM checks;

ROLLBACK;
