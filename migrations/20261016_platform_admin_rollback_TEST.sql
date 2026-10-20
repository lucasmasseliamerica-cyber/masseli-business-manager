-- NEXALVO TEST-only rollback for the signed-claim platform authority cutover.
-- PREPARED ONLY: do not run without explicit authorization, a demonstrated incompatibility and
-- the recovery order in docs/QA_PLATFORM_ADMIN_SINGLE_AUTHORITY_20261019.md.
--
-- Quiesce platform-admin calls before this separately authorized transaction. The chosen signed
-- claim and both tenant profiles are preserved. The new RPC authority is disabled and removed in
-- the same transaction that restores only the recorded legacy operator. No dual committed plane.
-- The private identity/role/tenant marker is retained as ROLLED_BACK for audit and recovery.

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = pg_catalog;

DO $rollback_preflight$
DECLARE
  v_valid_claims integer;
  v_marker_count integer;
  v_request_count integer;
  v_audit_count integer;
  v_endpoint record;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexalvo-platform-authority-cutover-v1', 0)
  );
  IF pg_catalog.to_regclass('nexalvo_private.platform_authority_cutover') IS NULL
     OR pg_catalog.to_regclass('nexalvo_private.platform_admin_requests') IS NULL
     OR pg_catalog.to_regclass('nexalvo_private.platform_admin_audit_logs') IS NULL THEN
    RAISE EXCEPTION 'rollback refused: cutover state is incomplete';
  END IF;
  LOCK TABLE nexalvo_platform.operators IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE auth.users, public.users IN SHARE MODE;

  SELECT count(*) INTO v_valid_claims FROM auth.users AS a
  WHERE a.raw_app_meta_data ->> 'nexalvo_platform_role' = 'SUPERADMIN'
    AND a.deleted_at IS NULL
    AND COALESCE(a.is_anonymous, false) = false
    AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now());
  IF v_valid_claims <> 1 THEN
    RAISE EXCEPTION 'rollback refused: the one existing signed SUPERADMIN must be preserved';
  END IF;
  SELECT count(*) INTO v_marker_count
  FROM nexalvo_private.platform_authority_cutover
  WHERE authority_state = 'ACTIVE'
    AND actor_user_id <> legacy_operator_user_id
    AND EXISTS (
      SELECT 1 FROM auth.users AS a
      JOIN public.users AS u ON u.id = a.id AND u.active
      WHERE a.id = actor_user_id AND u.business_id = actor_business_id
        AND u.role = actor_tenant_role
        AND a.raw_app_meta_data ->> 'nexalvo_platform_role' = 'SUPERADMIN'
        AND a.deleted_at IS NULL AND COALESCE(a.is_anonymous, false) = false
        AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now())
    )
    AND EXISTS (
      SELECT 1 FROM nexalvo_platform.operators AS o
      JOIN public.users AS u ON u.id = o.user_id AND u.active
      JOIN auth.users AS a ON a.id = o.user_id
      WHERE o.user_id = legacy_operator_user_id AND o.active IS FALSE
        AND u.business_id = legacy_business_id AND u.role = legacy_tenant_role
        AND (a.raw_app_meta_data ->> 'nexalvo_platform_role') IS DISTINCT FROM 'SUPERADMIN'
        AND a.deleted_at IS NULL AND COALESCE(a.is_anonymous, false) = false
        AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now())
    );
  IF v_marker_count <> 1 THEN
    RAISE EXCEPTION 'rollback refused: exact legacy authority marker is unavailable';
  END IF;
  SELECT count(*) INTO v_request_count FROM nexalvo_private.platform_admin_requests;
  SELECT count(*) INTO v_audit_count FROM nexalvo_private.platform_admin_audit_logs;
  IF v_request_count <> 0 OR v_audit_count <> 0 THEN
    RAISE EXCEPTION 'rollback refused: platform request or audit history exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.businesses AS b
    WHERE b.platform_status IS DISTINCT FROM 'ACTIVE'
       OR b.license_type IS DISTINCT FROM 'NONE'
       OR b.license_granted_at IS NOT NULL OR b.license_granted_by IS NOT NULL
       OR b.license_revoked_at IS NOT NULL OR b.license_revoked_by IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'rollback refused: commercial platform state has changed';
  END IF;
  IF (SELECT count(*) FROM nexalvo_platform.operators WHERE active) <> 0 THEN
    RAISE EXCEPTION 'rollback refused: legacy authority is already active';
  END IF;
  FOR v_endpoint IN
    SELECT * FROM (VALUES
      ('nexalvo_platform.has_access()'::text, 'f8c4de1c66633a83b050b452ee631e50'::text),
      ('nexalvo_platform.company_directory(text,integer,integer)', '42c1ed67869c3aae0d08b60936e5caff'),
      ('nexalvo_platform.provision_company(uuid,text,text,text,text)', '7a43c557618697ca23ac279a44422be5'),
      ('nexalvo_platform.assign_first_owner(uuid,uuid,text)', 'c4339c2a62276d87afaf1fbe2bdaf25e'),
      ('public.fn_platform_access()', 'a82de17a79ccd430cc1c3a3cd111f72f'),
      ('public.fn_platform_company_directory(text,integer,integer)', 'e59f6c55a7c035d3b6d01d801bfd3d11'),
      ('public.fn_platform_provision_company(uuid,text,text,text,text)', '6944009d04d8ca1eeeccfc2e29dcad47'),
      ('public.fn_platform_assign_first_owner(uuid,uuid,text)', 'ab894e8e11f407261218dcc3dd7fb36e')
    ) AS expected(signature, fingerprint)
  LOOP
    IF pg_catalog.md5(pg_catalog.pg_get_functiondef(
         pg_catalog.to_regprocedure(v_endpoint.signature)
       )) IS DISTINCT FROM v_endpoint.fingerprint THEN
      RAISE EXCEPTION 'rollback refused: legacy endpoint definition drifted';
    END IF;
  END LOOP;
END
$rollback_preflight$;

-- Retire the new authority before restoring any old access; all changes publish atomically.
UPDATE nexalvo_private.platform_authority_cutover
SET authority_state = 'ROLLED_BACK', rolled_back_at = pg_catalog.now()
WHERE authority_state = 'ACTIVE';
REVOKE ALL ON FUNCTION public.fn_platform_admin_execute(uuid, uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_platform_admin_list_audit_logs(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_platform_admin_list_businesses(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Restore the applied catalog-hardening behavior while removing only the suspension dependency.
CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT business_id FROM users WHERE id=auth.uid() AND active=true;
$function$;

CREATE OR REPLACE FUNCTION public.user_can(p_permission_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_role text; v_override jsonb; v_default boolean;
BEGIN
  SELECT role,permission_overrides INTO v_role,v_override FROM users WHERE id=auth.uid() AND active=true;
  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role='OWNER' THEN RETURN true; END IF;
  IF v_override ? p_permission_key THEN
    IF jsonb_typeof(v_override->p_permission_key)<>'boolean' THEN RETURN false; END IF;
    RETURN (v_override->>p_permission_key)::boolean;
  END IF;
  SELECT granted INTO v_default FROM role_default_permissions WHERE role=v_role AND permission_key=p_permission_key;
  RETURN coalesce(v_default,false);
END;$function$;

CREATE OR REPLACE FUNCTION public.fn_read_employees_secure()
RETURNS SETOF public.employees
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH actor AS (
    SELECT u.business_id,
           u.employee_id,
           u.role,
           public.user_can('manageUsers') AS can_manage_users,
           public.user_can('viewFinancials') AS can_view_financials
    FROM public.users AS u
    WHERE u.id = auth.uid() AND u.active = true
  )
  SELECT e.id,
         e.business_id,
         e.name,
         e.job_title,
         CASE WHEN a.can_view_financials THEN e.hourly_rate ELSE NULL END AS hourly_rate,
         e.location_id,
         e.manager_id,
         e.active,
         e.notes,
         e.created_at,
         e.updated_at
  FROM public.employees AS e
  JOIN actor AS a ON a.business_id = e.business_id
  WHERE a.role = 'OWNER'
     OR a.can_manage_users
     OR e.id = a.employee_id
     OR (a.role = 'MANAGER' AND e.manager_id = a.employee_id);
$function$;

CREATE OR REPLACE FUNCTION public.fn_write_audit(p_action text, p_details text)
RETURNS public.audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_entry public.audit_logs;
  v_user public.users;
  v_action text := pg_catalog.regexp_replace(pg_catalog.btrim(p_action), '[[:cntrl:]]+', ' ', 'g');
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = auth.uid() AND active = true;
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'active user profile required'; END IF;
  IF NULLIF(v_action, '') IS NULL OR pg_catalog.length(v_action) > 120 THEN
    RAISE EXCEPTION 'client audit action must contain 1 to 120 characters';
  END IF;
  IF pg_catalog.length(COALESCE(p_details, '')) > 2000 THEN
    RAISE EXCEPTION 'client audit details must contain at most 2000 characters';
  END IF;
  INSERT INTO public.audit_logs(
    business_id, user_id, user_name_snapshot, role_snapshot, action, details
  ) VALUES (
    v_user.business_id, v_user.id, v_user.name, v_user.role,
    'Client: ' || v_action, COALESCE(p_details, '')
  ) RETURNING * INTO v_entry;
  RETURN v_entry;
END;
$function$;

ALTER POLICY businesses_select_own_tenant ON public.businesses
  TO authenticated
  USING (id IN (SELECT u.business_id FROM public.users AS u WHERE u.id = auth.uid()));
ALTER POLICY settings_select_same_business ON public.business_settings_lists
  TO authenticated
  USING (business_id IN (SELECT u.business_id FROM public.users AS u WHERE u.id = auth.uid()));

REVOKE UPDATE (
  name, currency, tax_rate, tax_enabled, allow_negative_inventory, timezone, updated_at
) ON TABLE public.businesses FROM authenticated;
GRANT UPDATE ON TABLE public.businesses TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_export_business_data(p_business_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$select nexalvo_backup.export_business_data(p_business_id);$function$;
REVOKE ALL ON FUNCTION public.fn_export_business_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_export_business_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION nexalvo_backup.export_business_data(uuid) TO authenticated;

-- Restore only the recorded legacy identity; do not alter the selected SUPERADMIN or its claim.
UPDATE nexalvo_platform.operators AS o SET active = true
FROM nexalvo_private.platform_authority_cutover AS c
WHERE o.user_id = c.legacy_operator_user_id AND c.authority_state = 'ROLLED_BACK';
GRANT USAGE ON SCHEMA nexalvo_platform TO authenticated;
GRANT EXECUTE ON FUNCTION nexalvo_platform.has_access() TO authenticated;
GRANT EXECUTE ON FUNCTION nexalvo_platform.company_directory(text, integer, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION nexalvo_platform.provision_company(uuid, text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION nexalvo_platform.assign_first_owner(uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_platform_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_platform_company_directory(text, integer, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_platform_provision_company(uuid, text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_platform_assign_first_owner(uuid, uuid, text)
  TO authenticated;

DROP FUNCTION public.fn_session_access_status();
DROP FUNCTION public.fn_platform_admin_execute(uuid, uuid, text, uuid, text);
DROP FUNCTION public.fn_platform_admin_list_audit_logs(uuid, integer);
DROP FUNCTION public.fn_platform_admin_list_businesses(uuid);
DROP FUNCTION nexalvo_private.is_signed_superadmin(uuid);
DROP TABLE nexalvo_private.platform_admin_audit_logs;
DROP TABLE nexalvo_private.platform_admin_requests;
-- Keep platform_authority_cutover and its inaccessible schema. Never erase the transition record.

ALTER TABLE public.businesses
  DROP CONSTRAINT businesses_platform_status_check,
  DROP CONSTRAINT businesses_license_type_check,
  DROP COLUMN platform_status,
  DROP COLUMN license_type,
  DROP COLUMN license_granted_at,
  DROP COLUMN license_granted_by,
  DROP COLUMN license_revoked_at,
  DROP COLUMN license_revoked_by,
  DROP COLUMN platform_updated_at;

DO $rollback_postflight$
DECLARE
  v_legacy_executable integer;
BEGIN
  IF (SELECT count(*) FROM nexalvo_platform.operators WHERE active) <> 1 THEN
    RAISE EXCEPTION 'rollback postflight failed: legacy operator was not restored';
  END IF;
  IF (SELECT count(*) FROM nexalvo_private.platform_authority_cutover
      WHERE authority_state = 'ROLLED_BACK' AND rolled_back_at IS NOT NULL) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM nexalvo_private.platform_authority_cutover AS c
       JOIN nexalvo_platform.operators AS o ON o.user_id = c.legacy_operator_user_id AND o.active
       JOIN public.users AS u ON u.id = c.actor_user_id AND u.active
       JOIN auth.users AS a ON a.id = c.actor_user_id
       WHERE u.role = c.actor_tenant_role AND u.business_id = c.actor_business_id
         AND a.raw_app_meta_data ->> 'nexalvo_platform_role' = 'SUPERADMIN'
     )
     OR pg_catalog.to_regprocedure('public.fn_platform_admin_execute(uuid,uuid,text,uuid,text)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.fn_platform_admin_list_businesses(uuid)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.fn_platform_admin_list_audit_logs(uuid,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback postflight failed: exact authorities or preserved identity marker differ';
  END IF;
  SELECT count(*) INTO v_legacy_executable
  FROM (VALUES
    ('nexalvo_platform.has_access()'::text),
    ('nexalvo_platform.company_directory(text,integer,integer)'),
    ('nexalvo_platform.provision_company(uuid,text,text,text,text)'),
    ('nexalvo_platform.assign_first_owner(uuid,uuid,text)'),
    ('public.fn_platform_access()'),
    ('public.fn_platform_company_directory(text,integer,integer)'),
    ('public.fn_platform_provision_company(uuid,text,text,text,text)'),
    ('public.fn_platform_assign_first_owner(uuid,uuid,text)')
  ) AS endpoint(signature)
  WHERE pg_catalog.has_function_privilege(
    'authenticated', pg_catalog.to_regprocedure(endpoint.signature), 'EXECUTE'
  );
  IF v_legacy_executable <> 8 THEN
    RAISE EXCEPTION 'rollback postflight failed: legacy grants were not restored';
  END IF;
  IF pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('public.current_business_id()')
     )) IS DISTINCT FROM 'cb88feae5114dab5ff53ad35319544d4'
     OR pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('public.user_can(text)')
     )) IS DISTINCT FROM 'dda7b605c2b77befc9ec56f7af184103'
     OR pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('public.fn_export_business_data(uuid)')
     )) IS DISTINCT FROM '2bdd2117a84d5a95778cdf6392b11a49' THEN
    RAISE EXCEPTION 'rollback postflight failed: authorization baseline was not restored';
  END IF;
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.businesses', 'UPDATE')
     OR NOT pg_catalog.has_function_privilege(
       'authenticated', 'nexalvo_backup.export_business_data(uuid)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'rollback postflight failed: baseline grants were not restored';
  END IF;
END
$rollback_postflight$;

COMMIT;
