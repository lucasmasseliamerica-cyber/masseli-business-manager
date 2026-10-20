-- TEST msinksoilkluooxenecy only. Diagnostic for missing/inaccessible platform RPCs.
-- No identity data or function bodies. This is not cutover approval or the 20-check postflight.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

WITH expected(signature, argument_names, volatility) AS (
  VALUES
    ('public.fn_platform_admin_list_businesses(uuid)'::text, ARRAY['p_actor_user_id']::text[], 's'),
    ('public.fn_platform_admin_list_audit_logs(uuid,integer)', ARRAY['p_actor_user_id','p_limit'], 's'),
    ('public.fn_platform_admin_execute(uuid,uuid,text,uuid,text)',
      ARRAY['p_request_id','p_actor_user_id','p_operation','p_business_id','p_target_status'], 'v')
), state AS (
  SELECT e.signature,
    p.oid IS NOT NULL AS installed,
    COALESCE(p.proargnames[1:p.pronargs] = e.argument_names, false) AS argument_names_match,
    COALESCE(p.provolatile::text = e.volatility, false) AS volatility_matches,
    COALESCE(p.prosecdef, false) AS security_definer,
    COALESCE(p.proconfig = ARRAY['search_path=""']::text[], false) AS empty_search_path,
    COALESCE(pg_catalog.strpos(p.prosrc, 'nexalvo_private.is_signed_superadmin(p_actor_user_id)') > 0, false)
      AS signed_claim_guard_present,
    CASE WHEN p.oid IS NOT NULL THEN pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') ELSE false END AS service_executable,
    CASE WHEN p.oid IS NOT NULL THEN pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') ELSE false END AS authenticated_executable,
    CASE WHEN p.oid IS NOT NULL THEN pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') ELSE false END AS anon_executable,
    EXISTS (
      SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS a
      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ) AS public_executable
  FROM expected AS e
  LEFT JOIN pg_catalog.pg_proc AS p ON p.oid = pg_catalog.to_regprocedure(e.signature)
), results AS (
  SELECT *, installed AND argument_names_match AND volatility_matches AND security_definer
    AND empty_search_path AND signed_claim_guard_present AND service_executable
    AND NOT authenticated_executable AND NOT anon_executable AND NOT public_executable AS passed
  FROM state
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'status', CASE WHEN count(*) = 3 AND pg_catalog.bool_and(passed)
                 THEN 'PASS_RUNTIME_RPC_CONTRACTS' ELSE 'BLOCKED_RUNTIME_RPC_CONTRACTS' END,
  'expected', 3,
  'installed', count(*) FILTER (WHERE installed),
  'passed', count(*) FILTER (WHERE passed),
  'failed', count(*) FILTER (WHERE NOT passed),
  'functions', pg_catalog.jsonb_agg(pg_catalog.to_jsonb(results) ORDER BY signature)
) AS platform_admin_runtime_preflight
FROM results;

ROLLBACK;
