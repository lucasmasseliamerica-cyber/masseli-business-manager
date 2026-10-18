-- NEXALVO TEST signed-claim single-authority cutover preflight — READ ONLY.
-- Target state: legacy operators and endpoints are inactive before the new platform backend is
-- enabled; exactly one active Auth identity carries the signed SUPERADMIN app_metadata claim.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

WITH legacy_endpoints(signature) AS (
  VALUES
    ('nexalvo_platform.has_access()'::text),
    ('nexalvo_platform.company_directory(text,integer,integer)'::text),
    ('nexalvo_platform.provision_company(uuid,text,text,text,text)'::text),
    ('nexalvo_platform.assign_first_owner(uuid,uuid,text)'::text),
    ('public.fn_platform_access()'::text),
    ('public.fn_platform_company_directory(text,integer,integer)'::text),
    ('public.fn_platform_provision_company(uuid,text,text,text,text)'::text),
    ('public.fn_platform_assign_first_owner(uuid,uuid,text)'::text)
), legacy AS (
  SELECT
    (SELECT count(*) FROM nexalvo_platform.operators WHERE active) AS active_operators,
    count(*) FILTER (
      WHERE pg_catalog.to_regprocedure(e.signature) IS NOT NULL
        AND pg_catalog.has_function_privilege(
          'authenticated', pg_catalog.to_regprocedure(e.signature), 'EXECUTE'
        )
    ) AS authenticated_executable_legacy_endpoints
  FROM legacy_endpoints AS e
), claims AS (
  SELECT
    count(*) AS signed_superadmins,
    count(*) FILTER (WHERE u.id IS NOT NULL AND u.active) AS signed_superadmins_with_active_profile
  FROM auth.users AS a
  LEFT JOIN public.users AS u ON u.id = a.id
  WHERE (a.raw_app_meta_data ->> 'nexalvo_platform_role') = 'SUPERADMIN'
    AND a.deleted_at IS NULL
    AND COALESCE(a.is_anonymous, false) = false
    AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now())
), checks(name, passed) AS (
  SELECT 'legacy_operator_authority_disabled', l.active_operators = 0 FROM legacy AS l
  UNION ALL
  SELECT 'legacy_authenticated_endpoints_disabled',
         l.authenticated_executable_legacy_endpoints = 0 FROM legacy AS l
  UNION ALL
  SELECT 'exactly_one_signed_superadmin', c.signed_superadmins = 1 FROM claims AS c
  UNION ALL
  SELECT 'signed_superadmin_has_active_tenant_profile',
         c.signed_superadmins_with_active_profile = 1 FROM claims AS c
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'status', CASE WHEN pg_catalog.bool_and(passed)
                 THEN 'PASS_SINGLE_SIGNED_AUTHORITY'
                 ELSE 'BLOCKED_AUTHORITY_CUTOVER'
            END,
  'checks', pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('name', name, 'passed', passed) ORDER BY name
  )
) AS platform_admin_single_authority_preflight
FROM checks;

ROLLBACK;
