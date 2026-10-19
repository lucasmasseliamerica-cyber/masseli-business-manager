-- NEXALVO TEST-only atomic cutover to one signed-claim SUPERADMIN authority.
-- PREPARED ONLY: do not apply without explicit authorization and a passing result from
-- qa/sql/platform_admin_cutover_preflight_readonly_TEST.sql on project msinksoilkluooxenecy.
--
-- Required order:
--   1. deploy the prepared Edge Function while no SUPERADMIN claim exists (it remains denied);
--   2. add the signed claim to the sole active legacy operator identity;
--   3. obtain PASS_READY_FOR_ATOMIC_CUTOVER from the read-only preflight;
--   4. apply this migration once.
--
-- New RPCs and retirement of the legacy endpoints become visible at the same COMMIT. There is no
-- committed state in which both control planes are usable. This migration never creates a user or
-- changes Auth claims.

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path = pg_catalog;

DO $cutover_preflight$
DECLARE
  v_active_operators integer;
  v_signed_superadmins integer;
  v_matching_authorities integer;
  v_endpoint record;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('nexalvo-platform-authority-cutover-v1', 0)
  );

  IF pg_catalog.to_regnamespace('nexalvo_platform') IS NULL
     OR pg_catalog.to_regclass('nexalvo_platform.operators') IS NULL THEN
    RAISE EXCEPTION 'cutover preflight failed: legacy authority is absent';
  END IF;
  IF pg_catalog.to_regnamespace('nexalvo_private') IS NOT NULL THEN
    RAISE EXCEPTION 'cutover preflight failed: new private schema already exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'businesses'
      AND column_name IN (
        'platform_status', 'license_type', 'license_granted_at', 'license_granted_by',
        'license_revoked_at', 'license_revoked_by', 'platform_updated_at'
      )
  ) THEN
    RAISE EXCEPTION 'cutover preflight failed: platform business columns already exist';
  END IF;

  SELECT count(*)
    INTO v_active_operators
  FROM nexalvo_platform.operators AS o
  WHERE o.active;
  IF v_active_operators <> 1 THEN
    RAISE EXCEPTION 'cutover preflight failed: exactly one active legacy operator is required';
  END IF;

  SELECT count(*) INTO v_signed_superadmins
  FROM auth.users AS a
  JOIN public.users AS u ON u.id = a.id AND u.active
  WHERE a.raw_app_meta_data ->> 'nexalvo_platform_role' = 'SUPERADMIN'
    AND a.deleted_at IS NULL
    AND COALESCE(a.is_anonymous, false) = false
    AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now());
  SELECT count(*) INTO v_matching_authorities
  FROM auth.users AS a
  JOIN public.users AS u ON u.id = a.id AND u.active
  JOIN nexalvo_platform.operators AS o ON o.user_id = a.id AND o.active
  WHERE a.raw_app_meta_data ->> 'nexalvo_platform_role' = 'SUPERADMIN'
    AND a.deleted_at IS NULL
    AND COALESCE(a.is_anonymous, false) = false
    AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now());
  IF v_signed_superadmins <> 1 OR v_matching_authorities <> 1 THEN
    RAISE EXCEPTION 'cutover preflight failed: signed claim must match the sole active operator';
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
    IF pg_catalog.to_regprocedure(v_endpoint.signature) IS NULL
       OR pg_catalog.md5(pg_catalog.pg_get_functiondef(
            pg_catalog.to_regprocedure(v_endpoint.signature)
          )) <> v_endpoint.fingerprint
       OR NOT pg_catalog.has_function_privilege(
            'authenticated', pg_catalog.to_regprocedure(v_endpoint.signature), 'EXECUTE'
          ) THEN
      RAISE EXCEPTION 'cutover preflight failed: legacy endpoint % drifted', v_endpoint.signature;
    END IF;
  END LOOP;

  IF pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('public.current_business_id()')
     )) <> 'cb88feae5114dab5ff53ad35319544d4'
     OR pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('public.user_can(text)')
     )) <> 'dda7b605c2b77befc9ec56f7af184103' THEN
    RAISE EXCEPTION 'cutover preflight failed: tenant authorization baseline drifted';
  END IF;
  IF (SELECT pg_catalog.md5(p.prosrc) FROM pg_catalog.pg_proc AS p
      WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_employees_secure()'))
       <> '2c26a316e5cfc46dcfa187c550eb7108'
     OR (SELECT pg_catalog.md5(p.prosrc) FROM pg_catalog.pg_proc AS p
         WHERE p.oid = pg_catalog.to_regprocedure('public.fn_write_audit(text,text)'))
       <> '75c32789a68a73e29a8a82d33e3aad27' THEN
    RAISE EXCEPTION 'cutover preflight failed: applied catalog hardening baseline drifted';
  END IF;
  IF pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('public.fn_export_business_data(uuid)')
     )) <> '2bdd2117a84d5a95778cdf6392b11a49'
     OR pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('nexalvo_backup.export_business_data(uuid)')
     )) <> 'cabc5e9d96a6242ae42ade1d140b087e' THEN
    RAISE EXCEPTION 'cutover preflight failed: backup export baseline drifted';
  END IF;
END
$cutover_preflight$;

ALTER TABLE public.businesses
  ADD COLUMN platform_status text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN license_type text NOT NULL DEFAULT 'NONE',
  ADD COLUMN license_granted_at timestamptz,
  ADD COLUMN license_granted_by uuid,
  ADD COLUMN license_revoked_at timestamptz,
  ADD COLUMN license_revoked_by uuid,
  ADD COLUMN platform_updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  ADD CONSTRAINT businesses_platform_status_check
    CHECK (platform_status IN ('ACTIVE', 'SUSPENDED')),
  ADD CONSTRAINT businesses_license_type_check
    CHECK (license_type IN ('NONE', 'TRIAL', 'SUBSCRIPTION', 'LIFETIME'));

-- A tenant administrator may update only application settings. Platform columns are server-only.
REVOKE UPDATE ON TABLE public.businesses FROM authenticated;
GRANT UPDATE (
  name, currency, tax_rate, tax_enabled, allow_negative_inventory, timezone, updated_at
) ON TABLE public.businesses TO authenticated;

CREATE SCHEMA nexalvo_private;
REVOKE ALL ON SCHEMA nexalvo_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE nexalvo_private.platform_authority_cutover (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  actor_user_id uuid NOT NULL,
  legacy_operator_ids uuid[] NOT NULL CHECK (pg_catalog.cardinality(legacy_operator_ids) = 1),
  occurred_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE nexalvo_private.platform_admin_requests (
  request_id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL,
  operation text NOT NULL CHECK (
    operation IN ('grant_lifetime_license', 'revoke_license', 'update_business_status')
  ),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  target_status text,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  completed_at timestamptz,
  CONSTRAINT platform_admin_request_payload_check CHECK (
    (operation = 'update_business_status' AND target_status IN ('ACTIVE', 'SUSPENDED'))
    OR (operation <> 'update_business_status' AND target_status IS NULL)
  )
);

CREATE TABLE nexalvo_private.platform_admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE
    REFERENCES nexalvo_private.platform_admin_requests(request_id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  operation text NOT NULL,
  previous_values jsonb NOT NULL,
  new_values jsonb NOT NULL,
  changed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE nexalvo_private.platform_authority_cutover ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexalvo_private.platform_admin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexalvo_private.platform_admin_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA nexalvo_private
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION nexalvo_private.is_signed_superadmin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM auth.users AS a
      JOIN public.users AS u ON u.id = a.id AND u.active
      WHERE a.id = p_user_id
        AND a.raw_app_meta_data ->> 'nexalvo_platform_role' = 'SUPERADMIN'
        AND a.deleted_at IS NULL
        AND COALESCE(a.is_anonymous, false) = false
        AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now())
    );
$function$;
REVOKE ALL ON FUNCTION nexalvo_private.is_signed_superadmin(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_platform_admin_list_businesses(p_actor_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  status text,
  license_type text,
  active_users bigint,
  created_at timestamptz,
  licensed_at timestamptz,
  license_revoked_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT nexalvo_private.is_signed_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'platform access denied';
  END IF;
  RETURN QUERY
  SELECT b.id, b.name::text, b.platform_status::text, b.license_type::text,
         count(u.id) FILTER (WHERE u.active IS TRUE)::bigint, b.created_at::timestamptz,
         b.license_granted_at, b.license_revoked_at
  FROM public.businesses AS b
  LEFT JOIN public.users AS u ON u.business_id = b.id
  GROUP BY b.id, b.name, b.platform_status, b.license_type,
           b.created_at, b.license_granted_at, b.license_revoked_at
  ORDER BY b.name, b.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_platform_admin_list_audit_logs(
  p_actor_user_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  request_id uuid,
  actor_user_id uuid,
  business_id uuid,
  business_name text,
  operation text,
  previous_values jsonb,
  new_values jsonb,
  changed boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT nexalvo_private.is_signed_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'platform access denied';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid audit limit';
  END IF;
  RETURN QUERY
  SELECT a.id, a.request_id, a.actor_user_id, a.business_id, b.name::text,
         a.operation, a.previous_values, a.new_values, a.changed, a.created_at
  FROM nexalvo_private.platform_admin_audit_logs AS a
  JOIN public.businesses AS b ON b.id = a.business_id
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_platform_admin_execute(
  p_request_id uuid,
  p_actor_user_id uuid,
  p_operation text,
  p_business_id uuid,
  p_target_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_inserted integer;
  v_request nexalvo_private.platform_admin_requests%ROWTYPE;
  v_business public.businesses%ROWTYPE;
  v_actor_business_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_response jsonb;
  v_changed boolean := false;
BEGIN
  IF NOT nexalvo_private.is_signed_superadmin(p_actor_user_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'platform access denied';
  END IF;
  IF p_request_id IS NULL OR p_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'request and business are required';
  END IF;
  IF p_operation NOT IN ('grant_lifetime_license', 'revoke_license', 'update_business_status') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported platform operation';
  END IF;
  IF p_operation = 'update_business_status' AND p_target_status NOT IN ('ACTIVE', 'SUSPENDED') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid platform status';
  END IF;
  IF p_operation <> 'update_business_status' AND p_target_status IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unexpected platform status payload';
  END IF;

  SELECT u.business_id INTO v_actor_business_id
  FROM public.users AS u WHERE u.id = p_actor_user_id AND u.active;
  IF p_operation = 'update_business_status'
     AND p_target_status = 'SUSPENDED'
     AND p_business_id = v_actor_business_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'the sole platform administrator cannot suspend its own tenant';
  END IF;

  INSERT INTO nexalvo_private.platform_admin_requests (
    request_id, actor_user_id, operation, business_id, target_status
  ) VALUES (
    p_request_id, p_actor_user_id, p_operation, p_business_id, p_target_status
  ) ON CONFLICT (request_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT * INTO v_request
  FROM nexalvo_private.platform_admin_requests
  WHERE request_id = p_request_id
  FOR UPDATE;
  IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
     OR v_request.operation IS DISTINCT FROM p_operation
     OR v_request.business_id IS DISTINCT FROM p_business_id
     OR v_request.target_status IS DISTINCT FROM p_target_status THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = 'platform request id reused with different payload';
  END IF;
  IF v_inserted = 0 THEN
    IF v_request.response IS NULL OR v_request.completed_at IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'platform request is still in progress';
    END IF;
    RETURN v_request.response || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_business FROM public.businesses
  WHERE id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'business not found';
  END IF;
  v_before := pg_catalog.jsonb_build_object(
    'status', v_business.platform_status, 'license_type', v_business.license_type,
    'licensed_at', v_business.license_granted_at,
    'license_revoked_at', v_business.license_revoked_at
  );

  CASE p_operation
    WHEN 'grant_lifetime_license' THEN
      IF v_business.license_type IS DISTINCT FROM 'LIFETIME'
         OR v_business.license_revoked_at IS NOT NULL THEN
        UPDATE public.businesses
        SET license_type = 'LIFETIME', license_granted_at = pg_catalog.now(),
            license_granted_by = p_actor_user_id, license_revoked_at = NULL,
            license_revoked_by = NULL, platform_updated_at = pg_catalog.now()
        WHERE id = p_business_id;
        v_changed := true;
      END IF;
    WHEN 'revoke_license' THEN
      IF v_business.license_type IS DISTINCT FROM 'NONE' THEN
        UPDATE public.businesses
        SET license_type = 'NONE', license_revoked_at = pg_catalog.now(),
            license_revoked_by = p_actor_user_id, platform_updated_at = pg_catalog.now()
        WHERE id = p_business_id;
        v_changed := true;
      END IF;
    WHEN 'update_business_status' THEN
      IF v_business.platform_status IS DISTINCT FROM p_target_status THEN
        UPDATE public.businesses
        SET platform_status = p_target_status, platform_updated_at = pg_catalog.now()
        WHERE id = p_business_id;
        v_changed := true;
      END IF;
  END CASE;

  SELECT * INTO v_business FROM public.businesses WHERE id = p_business_id;
  v_after := pg_catalog.jsonb_build_object(
    'status', v_business.platform_status, 'license_type', v_business.license_type,
    'licensed_at', v_business.license_granted_at,
    'license_revoked_at', v_business.license_revoked_at
  );
  v_response := pg_catalog.jsonb_build_object(
    'ok', true, 'replayed', false, 'changed', v_changed,
    'business', pg_catalog.jsonb_build_object(
      'id', v_business.id, 'name', v_business.name,
      'status', v_business.platform_status, 'license_type', v_business.license_type,
      'created_at', v_business.created_at, 'licensed_at', v_business.license_granted_at,
      'license_revoked_at', v_business.license_revoked_at
    )
  );

  INSERT INTO nexalvo_private.platform_admin_audit_logs (
    request_id, actor_user_id, business_id, operation,
    previous_values, new_values, changed
  ) VALUES (
    p_request_id, p_actor_user_id, p_business_id, p_operation,
    v_before, v_after, v_changed
  );
  UPDATE nexalvo_private.platform_admin_requests
  SET response = v_response, completed_at = pg_catalog.now()
  WHERE request_id = p_request_id;
  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_platform_admin_list_businesses(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_platform_admin_list_audit_logs(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_platform_admin_execute(uuid, uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_platform_admin_list_businesses(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_platform_admin_list_audit_logs(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_platform_admin_execute(uuid, uuid, text, uuid, text)
  TO service_role;

-- Tenant suspension is enforced at the shared authorization root used by RLS and business RPCs.
CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT u.business_id
  FROM public.users AS u
  JOIN public.businesses AS b ON b.id = u.business_id
  WHERE u.id = auth.uid() AND u.active = true AND b.platform_status = 'ACTIVE';
$function$;

CREATE OR REPLACE FUNCTION public.user_can(p_permission_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  v_override jsonb;
  v_default boolean;
BEGIN
  SELECT u.role, u.permission_overrides INTO v_role, v_override
  FROM public.users AS u
  JOIN public.businesses AS b ON b.id = u.business_id
  WHERE u.id = auth.uid() AND u.active = true AND b.platform_status = 'ACTIVE';
  IF v_role IS NULL THEN RETURN false; END IF;
  IF v_role = 'OWNER' THEN RETURN true; END IF;
  IF v_override ? p_permission_key THEN
    IF pg_catalog.jsonb_typeof(v_override -> p_permission_key) <> 'boolean' THEN RETURN false; END IF;
    RETURN (v_override ->> p_permission_key)::boolean;
  END IF;
  SELECT granted INTO v_default FROM public.role_default_permissions
  WHERE role = v_role AND permission_key = p_permission_key;
  RETURN COALESCE(v_default, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_session_access_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'AUTH_REQUIRED'
    WHEN u.id IS NULL OR u.active IS DISTINCT FROM true THEN 'PROFILE_INACTIVE'
    WHEN b.id IS NULL THEN 'BUSINESS_MISSING'
    WHEN b.platform_status = 'SUSPENDED' THEN 'BUSINESS_SUSPENDED'
    WHEN b.platform_status = 'ACTIVE' THEN 'ACTIVE'
    ELSE 'BUSINESS_UNAVAILABLE'
  END
  FROM (SELECT auth.uid() AS actor_id) AS actor
  LEFT JOIN public.users AS u ON u.id = actor.actor_id
  LEFT JOIN public.businesses AS b ON b.id = u.business_id;
$function$;
REVOKE ALL ON FUNCTION public.fn_session_access_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_session_access_status() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_read_employees_secure()
RETURNS SETOF public.employees
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH actor AS (
    SELECT u.business_id, u.employee_id, u.role,
           public.user_can('manageUsers') AS can_manage_users,
           public.user_can('viewFinancials') AS can_view_financials
    FROM public.users AS u
    JOIN public.businesses AS b ON b.id = u.business_id
    WHERE u.id = auth.uid() AND u.active = true AND b.platform_status = 'ACTIVE'
  )
  SELECT e.id, e.business_id, e.name, e.job_title,
         CASE WHEN a.can_view_financials THEN e.hourly_rate ELSE NULL END AS hourly_rate,
         e.location_id, e.manager_id, e.active, e.notes, e.created_at, e.updated_at
  FROM public.employees AS e
  JOIN actor AS a ON a.business_id = e.business_id
  WHERE a.role = 'OWNER' OR a.can_manage_users OR e.id = a.employee_id
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
  SELECT u.* INTO v_user
  FROM public.users AS u
  JOIN public.businesses AS b ON b.id = u.business_id
  WHERE u.id = auth.uid() AND u.active = true AND b.platform_status = 'ACTIVE';
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
  TO authenticated USING (id = public.current_business_id());
ALTER POLICY settings_select_same_business ON public.business_settings_lists
  TO authenticated USING (business_id = public.current_business_id());

-- Remove the direct private-export bypass and keep the public wrapper gated by active tenancy.
REVOKE ALL ON FUNCTION nexalvo_backup.export_business_data(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.fn_export_business_data(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF p_business_id IS NULL
     OR public.current_business_id() IS DISTINCT FROM p_business_id
     OR NOT EXISTS (
       SELECT 1 FROM public.users AS u
       WHERE u.id = auth.uid() AND u.business_id = p_business_id
         AND u.role = 'OWNER' AND u.active
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Owner access denied';
  END IF;
  RETURN nexalvo_backup.export_business_data(p_business_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_export_business_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_export_business_data(uuid) TO authenticated, service_role;

-- Record the previous authority before retiring it. The legacy function bodies remain intact so a
-- reviewed, fail-closed rollback can restore access without reconstructing historical SQL.
INSERT INTO nexalvo_private.platform_authority_cutover(actor_user_id, legacy_operator_ids)
SELECT a.id, ARRAY[
  (SELECT o.user_id FROM nexalvo_platform.operators AS o WHERE o.active)
]::uuid[]
FROM auth.users AS a
JOIN nexalvo_platform.operators AS o ON o.user_id = a.id AND o.active
WHERE a.raw_app_meta_data ->> 'nexalvo_platform_role' = 'SUPERADMIN'
  AND a.deleted_at IS NULL
  AND COALESCE(a.is_anonymous, false) = false
  AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now());

UPDATE nexalvo_platform.operators SET active = false WHERE active;
REVOKE USAGE ON SCHEMA nexalvo_platform FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION nexalvo_platform.has_access()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION nexalvo_platform.company_directory(text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION nexalvo_platform.provision_company(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION nexalvo_platform.assign_first_owner(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_platform_access()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_platform_company_directory(text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_platform_provision_company(uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_platform_assign_first_owner(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

DO $cutover_postflight$
DECLARE
  v_legacy_executable integer;
BEGIN
  IF (SELECT count(*) FROM nexalvo_platform.operators WHERE active) <> 0 THEN
    RAISE EXCEPTION 'cutover postflight failed: legacy operator remains active';
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
  IF v_legacy_executable <> 0 THEN
    RAISE EXCEPTION 'cutover postflight failed: legacy endpoint remains executable';
  END IF;
  IF (SELECT count(*) FROM nexalvo_private.platform_authority_cutover) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM nexalvo_private.platform_authority_cutover AS c
       WHERE nexalvo_private.is_signed_superadmin(c.actor_user_id)
     ) THEN
    RAISE EXCEPTION 'cutover postflight failed: signed authority marker is invalid';
  END IF;
  IF NOT pg_catalog.has_function_privilege(
       'service_role', 'public.fn_platform_admin_execute(uuid,uuid,text,uuid,text)', 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'authenticated', 'public.fn_platform_admin_execute(uuid,uuid,text,uuid,text)', 'EXECUTE'
     )
     OR pg_catalog.has_function_privilege(
       'anon', 'public.fn_platform_admin_execute(uuid,uuid,text,uuid,text)', 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'cutover postflight failed: platform execution ACL is invalid';
  END IF;
  IF pg_catalog.has_table_privilege('authenticated', 'public.businesses', 'UPDATE')
     OR NOT pg_catalog.has_column_privilege(
       'authenticated', 'public.businesses', 'name', 'UPDATE'
     )
     OR pg_catalog.has_column_privilege(
       'authenticated', 'public.businesses', 'platform_status', 'UPDATE'
     ) THEN
    RAISE EXCEPTION 'cutover postflight failed: business update ACL is invalid';
  END IF;
END
$cutover_postflight$;

COMMIT;
