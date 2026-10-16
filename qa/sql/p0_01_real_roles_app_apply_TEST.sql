-- NEXALVO P0.01 — MANUAL persistent TEST-only application records for real roles.
-- Target after separate Auth preparation and explicit authorization: msinksoilkluooxenecy only.
-- PREPARED, NOT EXECUTED. Never run in CI. Never inserts/updates auth.users.
-- Replace both sentinel Auth UUIDs only after two dedicated TEST identities exist and are confirmed.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $qa_roles$
DECLARE
  v_business_id uuid := 'd627563b-2ce4-491d-8cf6-141ef28d0f63';
  v_owner_id uuid := 'f37e9907-47c4-48bf-94b7-9a6fa5de1f88';
  v_manager_auth_id uuid := '00000000-0000-4000-8000-000000000501'; -- REPLACE before authorized run
  v_employee_auth_id uuid := '00000000-0000-4000-8000-000000000502'; -- REPLACE before authorized run
  v_manager_employee_id uuid := '8bc7ab61-6c9e-4dd4-a19a-a504f57de003';
  v_employee_employee_id uuid := '8bc7ab61-6c9e-4dd4-a19a-a504f57de004';
  v_manager_tag text := 'QA_REAL_ROLE_MANAGER_20261015';
  v_employee_tag text := 'QA_REAL_ROLE_EMPLOYEE_20261015';
  v_changed integer := 0;
  v_rows integer;
  v_audit_rows integer;
BEGIN
  IF v_manager_auth_id IN ('00000000-0000-4000-8000-000000000501'::uuid,
                           '00000000-0000-4000-8000-000000000502'::uuid)
     OR v_employee_auth_id IN ('00000000-0000-4000-8000-000000000501'::uuid,
                              '00000000-0000-4000-8000-000000000502'::uuid)
     OR v_manager_auth_id = v_employee_auth_id THEN
    RAISE EXCEPTION 'Replace both distinct Auth UUID sentinels before execution';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_owner_id AND business_id = v_business_id
      AND role = 'OWNER' AND active = true
  ) THEN
    RAISE EXCEPTION 'QA A owner/business safety guard failed';
  END IF;
  IF (SELECT count(*) FROM auth.users
      WHERE id IN (v_manager_auth_id, v_employee_auth_id)) <> 2 THEN
    RAISE EXCEPTION 'Both dedicated Supabase Auth identities must exist first';
  END IF;
  IF EXISTS (
    SELECT 1 FROM auth.users
    WHERE id IN (v_manager_auth_id, v_employee_auth_id)
      AND (email_confirmed_at IS NULL OR deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Auth identities must be confirmed and not deleted';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = v_manager_employee_id
      AND (business_id IS DISTINCT FROM v_business_id
        OR name IS DISTINCT FROM 'QA Real Manager 20261015'
        OR job_title IS DISTINCT FROM 'QA Manager'
        OR hourly_rate IS DISTINCT FROM 25::numeric
        OR location_id IS NOT NULL OR manager_id IS NOT NULL
        OR active IS DISTINCT FROM true OR notes IS DISTINCT FROM v_manager_tag)
  ) OR EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = v_employee_employee_id
      AND (business_id IS DISTINCT FROM v_business_id
        OR name IS DISTINCT FROM 'QA Real Employee 20261015'
        OR job_title IS DISTINCT FROM 'QA Employee'
        OR hourly_rate IS DISTINCT FROM 15::numeric
        OR location_id IS NOT NULL OR manager_id IS DISTINCT FROM v_manager_employee_id
        OR active IS DISTINCT FROM true OR notes IS DISTINCT FROM v_employee_tag)
  ) THEN
    RAISE EXCEPTION 'Dedicated employee UUID collision';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_manager_auth_id
      AND (business_id IS DISTINCT FROM v_business_id
        OR employee_id IS DISTINCT FROM v_manager_employee_id
        OR name IS DISTINCT FROM 'QA Real Manager 20261015'
        OR username IS DISTINCT FROM 'qa_real_manager_20261015'
        OR role IS DISTINCT FROM 'MANAGER' OR active IS DISTINCT FROM true
        OR permission_overrides IS DISTINCT FROM '{}'::jsonb)
  ) OR EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_employee_auth_id
      AND (business_id IS DISTINCT FROM v_business_id
        OR employee_id IS DISTINCT FROM v_employee_employee_id
        OR name IS DISTINCT FROM 'QA Real Employee 20261015'
        OR username IS DISTINCT FROM 'qa_real_employee_20261015'
        OR role IS DISTINCT FROM 'EMPLOYEE' OR active IS DISTINCT FROM true
        OR permission_overrides IS DISTINCT FROM '{}'::jsonb)
  ) THEN
    RAISE EXCEPTION 'Auth UUID already has a different application profile';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE username IN ('qa_real_manager_20261015','qa_real_employee_20261015')
      AND id NOT IN (v_manager_auth_id, v_employee_auth_id)
  ) THEN
    RAISE EXCEPTION 'Dedicated QA username collision';
  END IF;

  INSERT INTO public.employees
    (id, business_id, name, job_title, hourly_rate, location_id, manager_id,
     active, notes, updated_at)
  VALUES
    (v_manager_employee_id, v_business_id, 'QA Real Manager 20261015', 'QA Manager', 25,
     NULL, NULL, true, v_manager_tag, pg_catalog.now())
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_changed := v_changed + v_rows;

  INSERT INTO public.employees
    (id, business_id, name, job_title, hourly_rate, location_id, manager_id,
     active, notes, updated_at)
  VALUES
    (v_employee_employee_id, v_business_id, 'QA Real Employee 20261015', 'QA Employee', 15,
     NULL, v_manager_employee_id, true, v_employee_tag, pg_catalog.now())
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_changed := v_changed + v_rows;

  INSERT INTO public.users
    (id, business_id, employee_id, name, username, role, permission_overrides, active, updated_at)
  VALUES
    (v_manager_auth_id, v_business_id, v_manager_employee_id, 'QA Real Manager 20261015',
     'qa_real_manager_20261015', 'MANAGER', '{}'::jsonb, true, pg_catalog.now()),
    (v_employee_auth_id, v_business_id, v_employee_employee_id, 'QA Real Employee 20261015',
     'qa_real_employee_20261015', 'EMPLOYEE', '{}'::jsonb, true, pg_catalog.now())
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_changed := v_changed + v_rows;

  IF NOT EXISTS (
    SELECT 1 FROM public.users AS u JOIN public.employees AS e ON e.id = u.employee_id
    WHERE u.id = v_manager_auth_id AND u.business_id = v_business_id
      AND u.role = 'MANAGER' AND u.active = true
      AND e.id = v_manager_employee_id AND e.business_id = v_business_id AND e.active = true
      AND e.notes = v_manager_tag
  ) OR NOT EXISTS (
    SELECT 1 FROM public.users AS u JOIN public.employees AS e ON e.id = u.employee_id
    WHERE u.id = v_employee_auth_id AND u.business_id = v_business_id
      AND u.role = 'EMPLOYEE' AND u.active = true
      AND e.id = v_employee_employee_id AND e.business_id = v_business_id AND e.active = true
      AND e.manager_id = v_manager_employee_id AND e.notes = v_employee_tag
  ) THEN
    RAISE EXCEPTION 'Real-role application fixture validation failed';
  END IF;

  IF v_changed > 0 THEN
    INSERT INTO public.audit_logs
      (business_id, user_id, user_name_snapshot, role_snapshot, action, details)
    SELECT v_business_id, u.id, u.name, u.role, 'QA Role Fixtures Provisioned',
           'QA_REAL_ROLES_20261015 · manager profile ' || v_manager_auth_id::text
             || ' · employee profile ' || v_employee_auth_id::text
    FROM public.users AS u
    WHERE u.id = v_owner_id AND u.business_id = v_business_id;
    GET DIAGNOSTICS v_audit_rows = ROW_COUNT;
    IF v_audit_rows <> 1 THEN RAISE EXCEPTION 'Role fixture audit identity unavailable'; END IF;
  END IF;
END;
$qa_roles$;

COMMIT;
