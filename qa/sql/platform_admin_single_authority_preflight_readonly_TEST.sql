-- NEXALVO TEST signed-claim single-authority POST-PREFLIGHT — STRICTLY READ ONLY.
-- Expected project: msinksoilkluooxenecy. Run only after the authorized atomic cutover.
-- No identifiers, e-mails, tokens or claim documents are returned.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

WITH legacy_endpoints(signature) AS (
  VALUES
    ('nexalvo_platform.has_access()'::text),
    ('nexalvo_platform.company_directory(text,integer,integer)'),
    ('nexalvo_platform.provision_company(uuid,text,text,text,text)'),
    ('nexalvo_platform.assign_first_owner(uuid,uuid,text)'),
    ('public.fn_platform_access()'),
    ('public.fn_platform_company_directory(text,integer,integer)'),
    ('public.fn_platform_provision_company(uuid,text,text,text,text)'),
    ('public.fn_platform_assign_first_owner(uuid,uuid,text)')
), legacy AS (
  SELECT
    (SELECT count(*) FROM nexalvo_platform.operators WHERE active) AS active_operators,
    count(*) FILTER (
      WHERE pg_catalog.has_function_privilege(
        'authenticated', pg_catalog.to_regprocedure(e.signature), 'EXECUTE'
      )
    ) AS authenticated_executable,
    count(*) FILTER (
      WHERE pg_catalog.has_function_privilege(
        'service_role', pg_catalog.to_regprocedure(e.signature), 'EXECUTE'
      )
    ) AS service_role_executable
  FROM legacy_endpoints AS e
), claims AS (
  SELECT
    count(*) AS signed_superadmins,
    count(*) FILTER (WHERE u.id IS NOT NULL AND u.active) AS with_active_profile
  FROM auth.users AS a
  LEFT JOIN public.users AS u ON u.id = a.id
  WHERE a.raw_app_meta_data ->> 'nexalvo_platform_role' = 'SUPERADMIN'
    AND a.deleted_at IS NULL
    AND COALESCE(a.is_anonymous, false) = false
    AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now())
), marker AS (
  SELECT
    count(*) AS marker_rows,
    count(*) FILTER (
      WHERE nexalvo_private.is_signed_superadmin(c.actor_user_id)
        AND c.authority_state = 'ACTIVE'
        AND c.actor_user_id <> c.legacy_operator_user_id
        AND EXISTS (
          SELECT 1 FROM public.users AS u WHERE u.id = c.actor_user_id AND u.active
            AND u.role = c.actor_tenant_role AND u.business_id = c.actor_business_id
        )
        AND EXISTS (
          SELECT 1 FROM nexalvo_platform.operators AS o
          JOIN public.users AS u ON u.id = o.user_id AND u.active
          WHERE o.user_id = c.legacy_operator_user_id AND NOT o.active
            AND u.role = c.legacy_tenant_role AND u.business_id = c.legacy_business_id
        )
    ) AS valid_marker_rows
  FROM nexalvo_private.platform_authority_cutover AS c
), admin_functions AS (
  SELECT
    count(*) AS present,
    count(*) FILTER (WHERE p.prosecdef) AS security_definers,
    count(*) FILTER (WHERE p.proconfig = ARRAY['search_path=""']::text[]) AS empty_search_paths,
    count(*) FILTER (
      WHERE pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    ) AS service_role_executable,
    count(*) FILTER (
      WHERE pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ) AS authenticated_executable,
    count(*) FILTER (
      WHERE pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    ) AS anon_executable,
    pg_catalog.bool_and(
      pg_catalog.strpos(p.prosrc, 'is_signed_superadmin') > 0
    ) AS server_claim_guarded
  FROM pg_catalog.pg_proc AS p
  JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  WHERE (n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)) IN (
    ('public', 'fn_platform_admin_list_businesses', 'p_actor_user_id uuid'),
    ('public', 'fn_platform_admin_list_audit_logs', 'p_actor_user_id uuid, p_limit integer'),
    ('public', 'fn_platform_admin_execute',
      'p_request_id uuid, p_actor_user_id uuid, p_operation text, p_business_id uuid, p_target_status text')
  )
), authorization_functions AS (
  SELECT
    pg_catalog.strpos(cb.prosrc, 'b.platform_status = ''ACTIVE''') > 0 AS business_gate,
    pg_catalog.strpos(uc.prosrc, 'b.platform_status = ''ACTIVE''') > 0 AS permission_gate,
    pg_catalog.strpos(er.prosrc, 'b.platform_status = ''ACTIVE''') > 0 AS employee_gate,
    pg_catalog.strpos(aw.prosrc, 'b.platform_status = ''ACTIVE''') > 0 AS audit_gate,
    pg_catalog.strpos(pa.prosrc, 'p_business_id = v_actor_business_id') > 0
      AND pg_catalog.strpos(pa.prosrc, 'cannot suspend its own tenant') > 0 AS self_suspend_guard,
    pg_catalog.strpos(be.prosrc, 'current_business_id() IS DISTINCT FROM p_business_id') > 0
      AS backup_export_gate
  FROM pg_catalog.pg_proc AS cb
  CROSS JOIN pg_catalog.pg_proc AS uc
  CROSS JOIN pg_catalog.pg_proc AS er
  CROSS JOIN pg_catalog.pg_proc AS aw
  CROSS JOIN pg_catalog.pg_proc AS pa
  CROSS JOIN pg_catalog.pg_proc AS be
  WHERE cb.oid = pg_catalog.to_regprocedure('public.current_business_id()')
    AND uc.oid = pg_catalog.to_regprocedure('public.user_can(text)')
    AND er.oid = pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
    AND aw.oid = pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
    AND pa.oid = pg_catalog.to_regprocedure(
      'public.fn_platform_admin_execute(uuid,uuid,text,uuid,text)'
    )
    AND be.oid = pg_catalog.to_regprocedure('public.fn_export_business_data(uuid)')
), policies AS (
  SELECT
    count(*) FILTER (
      WHERE p.tablename = 'businesses'
        AND p.policyname = 'businesses_select_own_tenant'
        AND p.roles = ARRAY['authenticated']::name[]
        AND pg_catalog.strpos(p.qual, 'current_business_id()') > 0
    ) AS business_policy,
    count(*) FILTER (
      WHERE p.tablename = 'business_settings_lists'
        AND p.policyname = 'settings_select_same_business'
        AND p.roles = ARRAY['authenticated']::name[]
        AND pg_catalog.strpos(p.qual, 'current_business_id()') > 0
    ) AS settings_policy
  FROM pg_catalog.pg_policies AS p
  WHERE p.schemaname = 'public'
), business_acl AS (
  SELECT
    NOT pg_catalog.has_table_privilege('authenticated', 'public.businesses', 'UPDATE')
      AS no_table_update,
    pg_catalog.has_column_privilege('authenticated', 'public.businesses', 'name', 'UPDATE')
      AND pg_catalog.has_column_privilege(
        'authenticated', 'public.businesses', 'updated_at', 'UPDATE'
      ) AS settings_update_preserved,
    NOT pg_catalog.has_column_privilege(
      'authenticated', 'public.businesses', 'platform_status', 'UPDATE'
    ) AND NOT pg_catalog.has_column_privilege(
      'authenticated', 'public.businesses', 'license_type', 'UPDATE'
    ) AS platform_update_denied
), private_acl AS (
  SELECT
    NOT pg_catalog.has_schema_privilege('anon', 'nexalvo_private', 'USAGE')
      AND NOT pg_catalog.has_schema_privilege('authenticated', 'nexalvo_private', 'USAGE')
      AND NOT pg_catalog.has_schema_privilege('service_role', 'nexalvo_private', 'USAGE')
      AS schema_private,
    NOT pg_catalog.has_table_privilege(
      'service_role', 'nexalvo_private.platform_admin_requests', 'SELECT'
    ) AND NOT pg_catalog.has_table_privilege(
      'authenticated', 'nexalvo_private.platform_admin_audit_logs', 'SELECT'
    ) AS tables_private,
    NOT pg_catalog.has_function_privilege(
      'authenticated', 'nexalvo_backup.export_business_data(uuid)', 'EXECUTE'
    ) AS direct_backup_export_denied
), session_status AS (
  SELECT
    p.prosecdef
      AND p.proconfig = ARRAY['search_path=""']::text[]
      AND pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      AND pg_catalog.strpos(p.prosrc, 'BUSINESS_SUSPENDED') > 0 AS valid
  FROM pg_catalog.pg_proc AS p
  WHERE p.oid = pg_catalog.to_regprocedure('public.fn_session_access_status()')
), checks(name, passed, detail) AS (
  SELECT 'exactly_one_signed_superadmin', c.signed_superadmins = 1,
         c.signed_superadmins::text FROM claims AS c
  UNION ALL SELECT 'signed_superadmin_has_active_profile', c.with_active_profile = 1,
                   c.with_active_profile::text FROM claims AS c
  UNION ALL SELECT 'legacy_operators_disabled', l.active_operators = 0,
                   l.active_operators::text FROM legacy AS l
  UNION ALL SELECT 'legacy_authenticated_endpoints_disabled', l.authenticated_executable = 0,
                   l.authenticated_executable::text FROM legacy AS l
  UNION ALL SELECT 'legacy_service_role_endpoints_disabled', l.service_role_executable = 0,
                   l.service_role_executable::text FROM legacy AS l
  UNION ALL SELECT 'cutover_marker_valid', m.marker_rows = 1 AND m.valid_marker_rows = 1,
                   pg_catalog.format('rows=%s valid=%s', m.marker_rows, m.valid_marker_rows)
            FROM marker AS m
  UNION ALL SELECT 'three_platform_rpcs_present', a.present = 3, a.present::text
            FROM admin_functions AS a
  UNION ALL SELECT 'platform_rpcs_security_definer_empty_path',
                   a.security_definers = 3 AND a.empty_search_paths = 3,
                   pg_catalog.format('definer=%s empty_path=%s',
                     a.security_definers, a.empty_search_paths) FROM admin_functions AS a
  UNION ALL SELECT 'platform_rpcs_service_role_only',
                   a.service_role_executable = 3 AND a.authenticated_executable = 0
                     AND a.anon_executable = 0,
                   pg_catalog.format('service=%s authenticated=%s anon=%s',
                     a.service_role_executable, a.authenticated_executable, a.anon_executable)
            FROM admin_functions AS a
  UNION ALL SELECT 'platform_rpcs_revalidate_signed_claim', a.server_claim_guarded,
                   a.server_claim_guarded::text FROM admin_functions AS a
  UNION ALL SELECT 'tenant_and_permission_suspension_gates',
                   a.business_gate AND a.permission_gate,
                   pg_catalog.format('business=%s permission=%s', a.business_gate, a.permission_gate)
            FROM authorization_functions AS a
  UNION ALL SELECT 'sensitive_facade_suspension_gates',
                   a.employee_gate AND a.audit_gate,
                   pg_catalog.format('employee=%s audit=%s', a.employee_gate, a.audit_gate)
            FROM authorization_functions AS a
  UNION ALL SELECT 'self_suspension_recovery_guard', a.self_suspend_guard,
                   a.self_suspend_guard::text FROM authorization_functions AS a
  UNION ALL SELECT 'backup_export_suspension_gate', a.backup_export_gate,
                   a.backup_export_gate::text FROM authorization_functions AS a
  UNION ALL SELECT 'tenant_select_policies_use_active_context',
                   p.business_policy = 1 AND p.settings_policy = 1,
                   pg_catalog.format('business=%s settings=%s',
                     p.business_policy, p.settings_policy) FROM policies AS p
  UNION ALL SELECT 'tenant_settings_update_preserved',
                   a.no_table_update AND a.settings_update_preserved,
                   pg_catalog.format('no_table=%s settings=%s',
                     a.no_table_update, a.settings_update_preserved) FROM business_acl AS a
  UNION ALL SELECT 'tenant_platform_update_denied', a.platform_update_denied,
                   a.platform_update_denied::text FROM business_acl AS a
  UNION ALL SELECT 'private_control_plane_not_directly_exposed',
                   a.schema_private AND a.tables_private,
                   pg_catalog.format('schema=%s tables=%s', a.schema_private, a.tables_private)
            FROM private_acl AS a
  UNION ALL SELECT 'direct_private_backup_export_denied', a.direct_backup_export_denied,
                   a.direct_backup_export_denied::text FROM private_acl AS a
  UNION ALL SELECT 'session_status_rpc_valid', s.valid, s.valid::text FROM session_status AS s
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'status', CASE WHEN count(*) = 20 AND pg_catalog.bool_and(COALESCE(passed, false))
                 THEN 'PASS_SINGLE_SIGNED_AUTHORITY'
                 ELSE 'BLOCKED_AUTHORITY_CUTOVER'
            END,
  'passed', count(*) FILTER (WHERE passed),
  'failed', count(*) FILTER (WHERE NOT COALESCE(passed, false)),
  'checks', pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('name', name, 'passed', COALESCE(passed, false), 'detail', detail)
    ORDER BY name
  )
) AS platform_admin_single_authority_postflight
FROM checks;

ROLLBACK;
