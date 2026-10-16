-- NEXALVO P0.01 — MANUAL exact compensation for real-role application records.
-- TEST msinksoilkluooxenecy only, after separate explicit authorization.
-- PREPARED, NOT EXECUTED. This never deletes, bans or changes auth.users identities.
-- Replace the two sentinels with the exact Auth UUIDs used by the apply script.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $qa_roles_compensate$
DECLARE
  v_business_id uuid := 'd627563b-2ce4-491d-8cf6-141ef28d0f63';
  v_owner_id uuid := 'f37e9907-47c4-48bf-94b7-9a6fa5de1f88';
  v_manager_auth_id uuid := '00000000-0000-4000-8000-000000000501'; -- REPLACE
  v_employee_auth_id uuid := '00000000-0000-4000-8000-000000000502'; -- REPLACE
  v_manager_employee_id uuid := '8bc7ab61-6c9e-4dd4-a19a-a504f57de003';
  v_employee_employee_id uuid := '8bc7ab61-6c9e-4dd4-a19a-a504f57de004';
  v_deleted integer := 0;
  v_rows integer;
  v_audit_rows integer;
BEGIN
  IF v_manager_auth_id IN ('00000000-0000-4000-8000-000000000501'::uuid,
                           '00000000-0000-4000-8000-000000000502'::uuid)
     OR v_employee_auth_id IN ('00000000-0000-4000-8000-000000000501'::uuid,
                              '00000000-0000-4000-8000-000000000502'::uuid)
     OR v_manager_auth_id = v_employee_auth_id THEN
    RAISE EXCEPTION 'Replace both exact Auth UUID sentinels before compensation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_owner_id AND business_id = v_business_id
      AND role = 'OWNER' AND active = true
  ) THEN RAISE EXCEPTION 'QA A owner/business safety guard failed'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_manager_auth_id
      AND (business_id IS DISTINCT FROM v_business_id
        OR employee_id IS DISTINCT FROM v_manager_employee_id
        OR name IS DISTINCT FROM 'QA Real Manager 20261015'
        OR username IS DISTINCT FROM 'qa_real_manager_20261015'
        OR role IS DISTINCT FROM 'MANAGER'
        OR permission_overrides IS DISTINCT FROM '{}'::jsonb
        OR active IS DISTINCT FROM true)
  ) OR EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_employee_auth_id
      AND (business_id IS DISTINCT FROM v_business_id
        OR employee_id IS DISTINCT FROM v_employee_employee_id
        OR name IS DISTINCT FROM 'QA Real Employee 20261015'
        OR username IS DISTINCT FROM 'qa_real_employee_20261015'
        OR role IS DISTINCT FROM 'EMPLOYEE'
        OR permission_overrides IS DISTINCT FROM '{}'::jsonb
        OR active IS DISTINCT FROM true)
  ) OR EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = v_manager_employee_id
      AND (business_id IS DISTINCT FROM v_business_id
        OR name IS DISTINCT FROM 'QA Real Manager 20261015'
        OR job_title IS DISTINCT FROM 'QA Manager'
        OR hourly_rate IS DISTINCT FROM 25::numeric
        OR location_id IS NOT NULL OR manager_id IS NOT NULL
        OR active IS DISTINCT FROM true
        OR notes IS DISTINCT FROM 'QA_REAL_ROLE_MANAGER_20261015')
  ) OR EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = v_employee_employee_id
      AND (business_id IS DISTINCT FROM v_business_id
        OR name IS DISTINCT FROM 'QA Real Employee 20261015'
        OR job_title IS DISTINCT FROM 'QA Employee'
        OR hourly_rate IS DISTINCT FROM 15::numeric
        OR location_id IS NOT NULL
        OR manager_id IS DISTINCT FROM v_manager_employee_id
        OR active IS DISTINCT FROM true
        OR notes IS DISTINCT FROM 'QA_REAL_ROLE_EMPLOYEE_20261015')
  ) THEN
    RAISE EXCEPTION 'Compensation refused: dedicated fixture identity differs';
  END IF;

  DELETE FROM public.users
  WHERE (id = v_manager_auth_id AND business_id = v_business_id
         AND employee_id = v_manager_employee_id
         AND name = 'QA Real Manager 20261015'
         AND username = 'qa_real_manager_20261015' AND role = 'MANAGER'
         AND permission_overrides = '{}'::jsonb AND active = true)
     OR (id = v_employee_auth_id AND business_id = v_business_id
         AND employee_id = v_employee_employee_id
         AND name = 'QA Real Employee 20261015'
         AND username = 'qa_real_employee_20261015' AND role = 'EMPLOYEE'
         AND permission_overrides = '{}'::jsonb AND active = true);
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;

  DELETE FROM public.employees
  WHERE id = v_employee_employee_id AND business_id = v_business_id
    AND name = 'QA Real Employee 20261015' AND job_title = 'QA Employee'
    AND hourly_rate = 15::numeric AND location_id IS NULL
    AND manager_id = v_manager_employee_id AND active = true
    AND notes = 'QA_REAL_ROLE_EMPLOYEE_20261015';
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;

  DELETE FROM public.employees
  WHERE id = v_manager_employee_id AND business_id = v_business_id
    AND name = 'QA Real Manager 20261015' AND job_title = 'QA Manager'
    AND hourly_rate = 25::numeric AND location_id IS NULL
    AND manager_id IS NULL AND active = true
    AND notes = 'QA_REAL_ROLE_MANAGER_20261015';
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted := v_deleted + v_rows;

  IF EXISTS (SELECT 1 FROM public.users WHERE id IN (v_manager_auth_id, v_employee_auth_id))
     OR EXISTS (SELECT 1 FROM public.employees WHERE id IN (v_manager_employee_id, v_employee_employee_id)) THEN
    RAISE EXCEPTION 'Compensation left dedicated application rows behind';
  END IF;

  IF v_deleted > 0 THEN
    INSERT INTO public.audit_logs
      (business_id, user_id, user_name_snapshot, role_snapshot, action, details)
    SELECT v_business_id, u.id, u.name, u.role, 'QA Role Fixtures Removed',
           'QA_REAL_ROLES_20261015 · application profiles/employees only; Auth identities retained'
    FROM public.users AS u
    WHERE u.id = v_owner_id AND u.business_id = v_business_id;
    GET DIAGNOSTICS v_audit_rows = ROW_COUNT;
    IF v_audit_rows <> 1 THEN RAISE EXCEPTION 'Role compensation audit identity unavailable'; END IF;
  END IF;
END;
$qa_roles_compensate$;

COMMIT;
