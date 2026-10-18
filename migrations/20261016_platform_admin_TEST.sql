-- NEXALVO TEST-only platform administration control plane.
-- PREPARED ONLY: do not apply without explicit authorization and a deployed-schema review.
-- This migration is additive. It does not create or promote a SUPERADMIN identity.

BEGIN;
SET LOCAL search_path = pg_catalog;

-- TEST already contains an older operator-table control plane in some environments. Installing a
-- second SUPERADMIN authority beside it would leave two independent ways to administer tenants.
-- Refuse that state until an explicitly reviewed migration maps operators to signed Auth claims and
-- retires or adopts the legacy wrappers.
DO $legacy_authority_guard$
BEGIN
  IF pg_catalog.to_regnamespace('nexalvo_platform') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.fn_platform_access()') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.fn_platform_company_directory(text,integer,integer)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.fn_platform_provision_company(uuid,text,text,text,text)') IS NOT NULL
     OR pg_catalog.to_regprocedure('public.fn_platform_assign_first_owner(uuid,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy nexalvo_platform authority must be reconciled before installation';
  END IF;
END
$legacy_authority_guard$;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS platform_status text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS license_type text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS license_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS license_granted_by uuid,
  ADD COLUMN IF NOT EXISTS license_revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS license_revoked_by uuid,
  ADD COLUMN IF NOT EXISTS platform_updated_at timestamptz NOT NULL DEFAULT now();

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.businesses'::regclass
      AND conname = 'businesses_platform_status_check'
  ) THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_platform_status_check
      CHECK (platform_status IN ('ACTIVE', 'SUSPENDED')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.businesses'::regclass
      AND conname = 'businesses_license_type_check'
  ) THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_license_type_check
      CHECK (license_type IN ('NONE', 'TRIAL', 'SUBSCRIPTION', 'LIFETIME')) NOT VALID;
  END IF;
END
$block$;

-- Fail the whole transaction if existing rows do not satisfy the new control-plane domain.
ALTER TABLE public.businesses VALIDATE CONSTRAINT businesses_platform_status_check;
ALTER TABLE public.businesses VALIDATE CONSTRAINT businesses_license_type_check;

CREATE SCHEMA IF NOT EXISTS nexalvo_private;
REVOKE ALL ON SCHEMA nexalvo_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA nexalvo_private TO service_role;

CREATE TABLE IF NOT EXISTS nexalvo_private.platform_admin_requests (
  request_id uuid PRIMARY KEY,
  actor_user_id uuid NOT NULL,
  operation text NOT NULL CHECK (operation IN ('grant_lifetime_license', 'revoke_license', 'update_business_status')),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  target_status text,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT platform_admin_request_payload_check CHECK (
    (operation = 'update_business_status' AND target_status IN ('ACTIVE', 'SUSPENDED'))
    OR (operation <> 'update_business_status' AND target_status IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS nexalvo_private.platform_admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES nexalvo_private.platform_admin_requests(request_id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  operation text NOT NULL,
  previous_values jsonb NOT NULL,
  new_values jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nexalvo_private.platform_admin_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE nexalvo_private.platform_admin_audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE nexalvo_private.platform_admin_requests FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE nexalvo_private.platform_admin_audit_logs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE nexalvo_private.platform_admin_requests TO service_role;
GRANT SELECT, INSERT ON TABLE nexalvo_private.platform_admin_audit_logs TO service_role;

CREATE OR REPLACE FUNCTION public.fn_platform_admin_list_businesses()
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
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT
    b.id,
    b.name::text,
    b.platform_status::text,
    b.license_type::text,
    count(u.id) FILTER (WHERE u.active IS TRUE)::bigint,
    b.created_at::timestamptz,
    b.license_granted_at,
    b.license_revoked_at
  FROM public.businesses AS b
  LEFT JOIN public.users AS u ON u.business_id = b.id
  GROUP BY b.id, b.name, b.platform_status, b.license_type,
           b.created_at, b.license_granted_at, b.license_revoked_at
  ORDER BY b.name, b.id;
$function$;

CREATE OR REPLACE FUNCTION public.fn_platform_admin_list_audit_logs(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  request_id uuid,
  actor_user_id uuid,
  business_id uuid,
  business_name text,
  operation text,
  previous_values jsonb,
  new_values jsonb,
  created_at timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT
    a.id,
    a.request_id,
    a.actor_user_id,
    a.business_id,
    b.name::text,
    a.operation,
    a.previous_values,
    a.new_values,
    a.created_at
  FROM nexalvo_private.platform_admin_audit_logs AS a
  JOIN public.businesses AS b ON b.id = a.business_id
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
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
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_inserted integer;
  v_request nexalvo_private.platform_admin_requests%ROWTYPE;
  v_business public.businesses%ROWTYPE;
  v_before jsonb;
  v_after jsonb;
  v_response jsonb;
BEGIN
  IF p_request_id IS NULL OR p_actor_user_id IS NULL OR p_business_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'request, actor and business are required';
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

  INSERT INTO nexalvo_private.platform_admin_requests (
    request_id, actor_user_id, operation, business_id, target_status
  ) VALUES (
    p_request_id, p_actor_user_id, p_operation, p_business_id, p_target_status
  )
  ON CONFLICT (request_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT * INTO v_request
  FROM nexalvo_private.platform_admin_requests
  WHERE request_id = p_request_id
  FOR UPDATE;

  IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
     OR v_request.operation IS DISTINCT FROM p_operation
     OR v_request.business_id IS DISTINCT FROM p_business_id
     OR v_request.target_status IS DISTINCT FROM p_target_status THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'platform request id reused with different payload';
  END IF;

  IF v_inserted = 0 THEN
    IF v_request.response IS NULL OR v_request.completed_at IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'platform request is still in progress';
    END IF;
    RETURN v_request.response || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO v_business
  FROM public.businesses
  WHERE id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'business not found';
  END IF;

  v_before := jsonb_build_object(
    'status', v_business.platform_status,
    'license_type', v_business.license_type,
    'licensed_at', v_business.license_granted_at,
    'license_revoked_at', v_business.license_revoked_at
  );

  CASE p_operation
    WHEN 'grant_lifetime_license' THEN
      UPDATE public.businesses
      SET license_type = 'LIFETIME',
          license_granted_at = now(),
          license_granted_by = p_actor_user_id,
          license_revoked_at = NULL,
          license_revoked_by = NULL,
          platform_updated_at = now()
      WHERE id = p_business_id;
    WHEN 'revoke_license' THEN
      UPDATE public.businesses
      SET license_type = 'NONE',
          license_revoked_at = now(),
          license_revoked_by = p_actor_user_id,
          platform_updated_at = now()
      WHERE id = p_business_id;
    WHEN 'update_business_status' THEN
      UPDATE public.businesses
      SET platform_status = p_target_status,
          platform_updated_at = now()
      WHERE id = p_business_id;
  END CASE;

  SELECT * INTO v_business FROM public.businesses WHERE id = p_business_id;
  v_after := jsonb_build_object(
    'status', v_business.platform_status,
    'license_type', v_business.license_type,
    'licensed_at', v_business.license_granted_at,
    'license_revoked_at', v_business.license_revoked_at
  );
  v_response := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'business', jsonb_build_object(
      'id', v_business.id,
      'name', v_business.name,
      'status', v_business.platform_status,
      'license_type', v_business.license_type,
      'created_at', v_business.created_at,
      'licensed_at', v_business.license_granted_at,
      'license_revoked_at', v_business.license_revoked_at
    )
  );

  INSERT INTO nexalvo_private.platform_admin_audit_logs (
    request_id, actor_user_id, business_id, operation, previous_values, new_values
  ) VALUES (
    p_request_id, p_actor_user_id, p_business_id, p_operation, v_before, v_after
  );

  UPDATE nexalvo_private.platform_admin_requests
  SET response = v_response, completed_at = now()
  WHERE request_id = p_request_id;

  RETURN v_response;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_platform_admin_list_businesses() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_platform_admin_list_audit_logs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_platform_admin_execute(uuid, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_platform_admin_list_businesses() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_platform_admin_list_audit_logs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_platform_admin_execute(uuid, uuid, text, uuid, text) TO service_role;

COMMIT;
