-- NEXALVO P0.01 — MANUAL compensation for the dedicated OWNER B employee fixture.
-- Target after explicit authorization: Supabase TEST msinksoilkluooxenecy only.
-- PREPARED, NOT EXECUTED. No CASCADE and no broad predicate are permitted.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $qa_admin$
DECLARE
  v_business_id uuid := '3849b750-20f7-4929-8699-737a4e1983c8';
  v_owner_id uuid := '88eddcda-d8b5-4474-b5d7-19860dd97fba';
  v_employee_id uuid := '8bc7ab61-6c9e-4dd4-a19a-a504f57de002';
  v_tag text := 'QA_PREFLIGHT_EMPLOYEE_B_20261015';
  v_deleted integer;
  v_audit_rows integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = v_employee_id
      AND (business_id IS DISTINCT FROM v_business_id
           OR name IS DISTINCT FROM 'QA Preflight Employee B'
           OR job_title IS DISTINCT FROM 'QA Fixture'
           OR notes IS DISTINCT FROM v_tag)
  ) THEN
    RAISE EXCEPTION 'Compensation refused: fixture identity does not match';
  END IF;

  DELETE FROM public.employees
  WHERE id = v_employee_id
    AND business_id = v_business_id
    AND name = 'QA Preflight Employee B'
    AND job_title = 'QA Fixture'
    AND notes = v_tag;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted > 1 THEN
    RAISE EXCEPTION 'Compensation deleted more than one row';
  END IF;

  IF v_deleted = 1 THEN
    INSERT INTO public.audit_logs
      (business_id, user_id, user_name_snapshot, role_snapshot, action, details)
    SELECT v_business_id, u.id, u.name, u.role,
           'QA Fixture Removed', v_tag || ' · employee ' || v_employee_id::text
    FROM public.users AS u
    WHERE u.id = v_owner_id AND u.business_id = v_business_id;
    GET DIAGNOSTICS v_audit_rows = ROW_COUNT;
    IF v_audit_rows <> 1 THEN
      RAISE EXCEPTION 'Fixture compensation audit identity is unavailable';
    END IF;
  END IF;
END;
$qa_admin$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','88eddcda-d8b5-4474-b5d7-19860dd97fba',true);
SELECT set_config('request.jwt.claims','{"sub":"88eddcda-d8b5-4474-b5d7-19860dd97fba","role":"authenticated"}',true);
DO $qa_owner_b$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fn_read_employees_secure()
    WHERE id = '8bc7ab61-6c9e-4dd4-a19a-a504f57de002'
  ) OR EXISTS (
    SELECT 1 FROM public.employees
    WHERE id = '8bc7ab61-6c9e-4dd4-a19a-a504f57de002'
  ) THEN
    RAISE EXCEPTION 'Compensated employee B fixture remains visible';
  END IF;
END;
$qa_owner_b$;
RESET ROLE;

COMMIT;
