-- NEXALVO P0.01 — MANUAL TEST-only fixture provisioning for preflight OWNER B.
-- Target after explicit authorization: Supabase TEST msinksoilkluooxenecy only.
-- PREPARED, NOT EXECUTED. This script performs a persistent write and must never run in CI.
-- Compensation: qa/sql/p0_01_employee_b_fixture_compensate_TEST.sql

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $qa_admin$
DECLARE
  v_business_id uuid := '3849b750-20f7-4929-8699-737a4e1983c8';
  v_owner_id uuid := '88eddcda-d8b5-4474-b5d7-19860dd97fba';
  v_employee_id uuid := '8bc7ab61-6c9e-4dd4-a19a-a504f57de002';
  v_tag text := 'QA_PREFLIGHT_EMPLOYEE_B_20261015';
  v_inserted integer;
  v_audit_rows integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = v_business_id AND name = 'ZZ_QA_PLATFORM_20261009_AUTO'
  ) THEN
    RAISE EXCEPTION 'TEST-only business B safety guard failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_owner_id AND business_id = v_business_id
      AND role = 'OWNER' AND active = true
  ) THEN
    RAISE EXCEPTION 'TEST-only OWNER B identity guard failed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = v_employee_id
      AND (business_id IS DISTINCT FROM v_business_id
           OR name IS DISTINCT FROM 'QA Preflight Employee B'
           OR notes IS DISTINCT FROM v_tag)
  ) THEN
    RAISE EXCEPTION 'Dedicated fixture UUID is already used by another row';
  END IF;

  INSERT INTO public.employees
    (id, business_id, name, job_title, hourly_rate, location_id, manager_id,
     active, notes, updated_at)
  VALUES
    (v_employee_id, v_business_id, 'QA Preflight Employee B', 'QA Fixture', 0,
     NULL, NULL, true, v_tag, pg_catalog.now())
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = v_employee_id AND business_id = v_business_id
      AND name = 'QA Preflight Employee B' AND job_title = 'QA Fixture'
      AND hourly_rate = 0 AND location_id IS NULL AND manager_id IS NULL
      AND active = true AND notes = v_tag
  ) THEN
    RAISE EXCEPTION 'Employee B fixture does not match its controlled definition';
  END IF;

  IF v_inserted = 1 THEN
    INSERT INTO public.audit_logs
      (business_id, user_id, user_name_snapshot, role_snapshot, action, details)
    SELECT v_business_id, u.id, u.name, u.role,
           'QA Fixture Provisioned', v_tag || ' · employee ' || v_employee_id::text
    FROM public.users AS u
    WHERE u.id = v_owner_id AND u.business_id = v_business_id;
    GET DIAGNOSTICS v_audit_rows = ROW_COUNT;
    IF v_audit_rows <> 1 THEN
      RAISE EXCEPTION 'Fixture provisioning audit identity is unavailable';
    END IF;
  END IF;
END;
$qa_admin$;

-- Prove OWNER B can see the exact row through both the facade and corrected direct SELECT.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','88eddcda-d8b5-4474-b5d7-19860dd97fba',true);
SELECT set_config('request.jwt.claims','{"sub":"88eddcda-d8b5-4474-b5d7-19860dd97fba","role":"authenticated"}',true);
DO $qa_owner_b$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.fn_read_employees_secure()
    WHERE id = '8bc7ab61-6c9e-4dd4-a19a-a504f57de002'
      AND business_id = '3849b750-20f7-4929-8699-737a4e1983c8'
  ) THEN
    RAISE EXCEPTION 'OWNER B cannot read the fixture through fn_read_employees_secure';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = '8bc7ab61-6c9e-4dd4-a19a-a504f57de002'
      AND business_id = '3849b750-20f7-4929-8699-737a4e1983c8'
  ) THEN
    RAISE EXCEPTION 'OWNER B cannot read the fixture through direct SELECT';
  END IF;
END;
$qa_owner_b$;
RESET ROLE;

-- Prove OWNER A cannot see the exact B row through either path.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f37e9907-47c4-48bf-94b7-9a6fa5de1f88',true);
SELECT set_config('request.jwt.claims','{"sub":"f37e9907-47c4-48bf-94b7-9a6fa5de1f88","role":"authenticated"}',true);
DO $qa_owner_a$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fn_read_employees_secure()
    WHERE id = '8bc7ab61-6c9e-4dd4-a19a-a504f57de002'
  ) OR EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = '8bc7ab61-6c9e-4dd4-a19a-a504f57de002'
  ) THEN
    RAISE EXCEPTION 'OWNER A can read the dedicated employee B fixture';
  END IF;
END;
$qa_owner_a$;
RESET ROLE;

COMMIT;
