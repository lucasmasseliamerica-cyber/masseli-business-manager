-- NEXALVO TEST platform-admin atomic cutover preflight — STRICTLY READ ONLY.
-- Expected project: msinksoilkluooxenecy. The project selection must be verified outside SQL.
--
-- Preserve the chosen signed SUPERADMIN and independently validate the distinct legacy OWNER.
-- Run before applying 20261016_platform_admin_TEST.sql. No identifiers or claim documents are
-- returned. Every check must pass. A failure is a hard stop; do not edit expected fingerprints to
-- fit an unexplained database state.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog;

WITH legacy_endpoints(signature, expected_fingerprint) AS (
  VALUES
    ('nexalvo_platform.has_access()'::text, 'f8c4de1c66633a83b050b452ee631e50'::text),
    ('nexalvo_platform.company_directory(text,integer,integer)', '42c1ed67869c3aae0d08b60936e5caff'),
    ('nexalvo_platform.provision_company(uuid,text,text,text,text)', '7a43c557618697ca23ac279a44422be5'),
    ('nexalvo_platform.assign_first_owner(uuid,uuid,text)', 'c4339c2a62276d87afaf1fbe2bdaf25e'),
    ('public.fn_platform_access()', 'a82de17a79ccd430cc1c3a3cd111f72f'),
    ('public.fn_platform_company_directory(text,integer,integer)', 'e59f6c55a7c035d3b6d01d801bfd3d11'),
    ('public.fn_platform_provision_company(uuid,text,text,text,text)', '6944009d04d8ca1eeeccfc2e29dcad47'),
    ('public.fn_platform_assign_first_owner(uuid,uuid,text)', 'ab894e8e11f407261218dcc3dd7fb36e')
), legacy_endpoint_state AS (
  SELECT
    count(*) FILTER (WHERE pg_catalog.to_regprocedure(e.signature) IS NOT NULL) AS present,
    count(*) FILTER (
      WHERE pg_catalog.to_regprocedure(e.signature) IS NOT NULL
        AND pg_catalog.md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(e.signature)))
            = e.expected_fingerprint
    ) AS exact_definitions,
    count(*) FILTER (
      WHERE pg_catalog.to_regprocedure(e.signature) IS NOT NULL
        AND pg_catalog.has_function_privilege(
          'authenticated', pg_catalog.to_regprocedure(e.signature), 'EXECUTE'
        )
    ) AS authenticated_executable,
    count(*) FILTER (
      WHERE pg_catalog.has_function_privilege('anon', pg_catalog.to_regprocedure(e.signature), 'EXECUTE')
         OR pg_catalog.has_function_privilege('service_role', pg_catalog.to_regprocedure(e.signature), 'EXECUTE')
    ) AS unexpected_api_executable,
    pg_catalog.has_schema_privilege('authenticated', 'nexalvo_platform', 'USAGE')
      AND NOT pg_catalog.has_schema_privilege('anon', 'nexalvo_platform', 'USAGE')
      AND NOT pg_catalog.has_schema_privilege('service_role', 'nexalvo_platform', 'USAGE')
      AS schema_grants_exact
  FROM legacy_endpoints AS e
), authority AS (
  SELECT
    count(*) FILTER (WHERE o.active) AS active_operators,
    count(*) FILTER (
      WHERE o.active
        AND u.id IS NOT NULL
        AND u.active
        AND a.id IS NOT NULL
        AND a.deleted_at IS NULL
        AND COALESCE(a.is_anonymous, false) = false
        AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now())
        AND u.role = 'OWNER'
        AND EXISTS (SELECT 1 FROM public.businesses AS b WHERE b.id = u.business_id)
        AND (a.raw_app_meta_data ->> 'nexalvo_platform_role') IS DISTINCT FROM 'SUPERADMIN'
    ) AS valid_unsigned_legacy_operators,
    count(*) FILTER (
      WHERE o.active
        AND (a.raw_app_meta_data ->> 'nexalvo_platform_role') IS DISTINCT FROM 'SUPERADMIN'
    ) AS active_operator_without_signed_claim
  FROM nexalvo_platform.operators AS o
  LEFT JOIN public.users AS u ON u.id = o.user_id
  LEFT JOIN auth.users AS a ON a.id = o.user_id
), claims AS (
  SELECT
    count(*) AS signed_superadmins,
    count(*) FILTER (
      WHERE u.id IS NOT NULL AND u.active AND u.role IN ('OWNER', 'MANAGER', 'EMPLOYEE')
        AND EXISTS (SELECT 1 FROM public.businesses AS b WHERE b.id = u.business_id)
    ) AS signed_superadmins_with_active_profile,
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM nexalvo_platform.operators AS o
        WHERE o.user_id = a.id AND o.active
      )
    ) AS signed_superadmins_distinct_from_active_operator
  FROM auth.users AS a
  LEFT JOIN public.users AS u ON u.id = a.id
  WHERE a.raw_app_meta_data ->> 'nexalvo_platform_role' = 'SUPERADMIN'
    AND a.deleted_at IS NULL
    AND COALESCE(a.is_anonymous, false) = false
    AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now())
), baseline_functions AS (
  SELECT
    pg_catalog.md5(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure('public.current_business_id()')
    )) = 'cb88feae5114dab5ff53ad35319544d4' AS current_business_id_exact,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure('public.user_can(text)')
    )) = 'dda7b605c2b77befc9ec56f7af184103' AS user_can_exact,
    (SELECT pg_catalog.md5(p.prosrc) FROM pg_catalog.pg_proc AS p
     WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_employees_secure()'))
      = '2c26a316e5cfc46dcfa187c550eb7108' AS employee_reader_hardened
), audit_function AS (
  SELECT (SELECT pg_catalog.md5(p.prosrc) FROM pg_catalog.pg_proc AS p
    WHERE p.oid = pg_catalog.to_regprocedure('public.fn_write_audit(text,text)'))
      = '75c32789a68a73e29a8a82d33e3aad27' AS audit_writer_hardened
), export_baseline AS (
  SELECT
    pg_catalog.md5(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure('public.fn_export_business_data(uuid)')
    )) = '2bdd2117a84d5a95778cdf6392b11a49' AS wrapper_exact,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure('nexalvo_backup.export_business_data(uuid)')
    )) = 'cabc5e9d96a6242ae42ade1d140b087e' AS private_export_exact,
    CASE WHEN pg_catalog.to_regprocedure('nexalvo_backup.export_business_data(uuid)') IS NOT NULL
      THEN pg_catalog.has_function_privilege(
        'authenticated', pg_catalog.to_regprocedure('nexalvo_backup.export_business_data(uuid)'), 'EXECUTE'
      ) ELSE false END AS direct_private_export_currently_executable
), collisions AS (
  SELECT
    pg_catalog.to_regnamespace('nexalvo_private') IS NOT NULL AS private_schema_exists,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'businesses'
        AND column_name IN (
          'platform_status', 'license_type', 'license_granted_at', 'license_granted_by',
          'license_revoked_at', 'license_revoked_by', 'platform_updated_at'
        )
    ) AS platform_columns_exist,
    EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS p
      JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'fn_platform_admin_%'
    ) AS platform_functions_exist
), grants AS (
  SELECT pg_catalog.has_table_privilege(
    'authenticated', 'public.businesses', 'UPDATE'
  ) AS authenticated_has_business_table_update
), checks(name, passed, detail) AS (
  SELECT 'exactly_one_active_legacy_operator', a.active_operators = 1,
         a.active_operators::text FROM authority AS a
  UNION ALL SELECT 'exactly_one_valid_signed_superadmin', c.signed_superadmins = 1,
                   c.signed_superadmins::text FROM claims AS c
  UNION ALL SELECT 'independent_authority_identities_valid',
                   a.valid_unsigned_legacy_operators = 1
                     AND a.active_operator_without_signed_claim = 1
                     AND c.signed_superadmins_distinct_from_active_operator = 1,
                   pg_catalog.format('valid_legacy_owner=%s unsigned_legacy=%s independent_signed=%s',
                     a.valid_unsigned_legacy_operators, a.active_operator_without_signed_claim,
                     c.signed_superadmins_distinct_from_active_operator)
            FROM authority AS a CROSS JOIN claims AS c
  UNION ALL SELECT 'signed_superadmin_has_active_profile',
                   c.signed_superadmins_with_active_profile = 1,
                   c.signed_superadmins_with_active_profile::text FROM claims AS c
  UNION ALL SELECT 'all_legacy_endpoints_present', e.present = 8, e.present::text
            FROM legacy_endpoint_state AS e
  UNION ALL SELECT 'legacy_endpoint_definitions_exact', e.exact_definitions = 8,
                   e.exact_definitions::text FROM legacy_endpoint_state AS e
  UNION ALL SELECT 'legacy_authenticated_grants_intact',
                   e.authenticated_executable = 8 AND e.unexpected_api_executable = 0
                     AND e.schema_grants_exact,
                   pg_catalog.format('authenticated=%s unexpected=%s schema=%s',
                     e.authenticated_executable, e.unexpected_api_executable, e.schema_grants_exact)
            FROM legacy_endpoint_state AS e
  UNION ALL SELECT 'new_control_plane_absent',
                   NOT c.private_schema_exists AND NOT c.platform_columns_exist
                     AND NOT c.platform_functions_exist,
                   pg_catalog.format('schema=%s columns=%s functions=%s',
                     c.private_schema_exists, c.platform_columns_exist, c.platform_functions_exist)
            FROM collisions AS c
  UNION ALL SELECT 'tenant_authorization_baseline_exact',
                   b.current_business_id_exact AND b.user_can_exact,
                   pg_catalog.format('business=%s permission=%s',
                     b.current_business_id_exact, b.user_can_exact) FROM baseline_functions AS b
  UNION ALL SELECT 'catalog_hardening_baseline_exact',
                   b.employee_reader_hardened AND a.audit_writer_hardened,
                   pg_catalog.format('employees=%s audit=%s',
                     b.employee_reader_hardened, a.audit_writer_hardened)
            FROM baseline_functions AS b CROSS JOIN audit_function AS a
  UNION ALL SELECT 'backup_export_baseline_exact',
                   e.wrapper_exact AND e.private_export_exact
                     AND e.direct_private_export_currently_executable,
                   pg_catalog.format('wrapper=%s private=%s direct_grant=%s',
                     e.wrapper_exact, e.private_export_exact,
                     e.direct_private_export_currently_executable) FROM export_baseline AS e
  UNION ALL SELECT 'business_update_baseline_present',
                   g.authenticated_has_business_table_update,
                   g.authenticated_has_business_table_update::text FROM grants AS g
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'status', CASE WHEN count(*) = 12 AND pg_catalog.bool_and(COALESCE(passed, false))
                 THEN 'PASS_READY_FOR_ATOMIC_CUTOVER'
                 ELSE 'BLOCKED_AUTHORITY_CUTOVER'
            END,
  'passed', count(*) FILTER (WHERE passed),
  'failed', count(*) FILTER (WHERE NOT COALESCE(passed, false)),
  'checks', pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('name', name, 'passed', COALESCE(passed, false), 'detail', detail)
    ORDER BY name
  )
) AS platform_admin_cutover_preflight
FROM checks;

ROLLBACK;
