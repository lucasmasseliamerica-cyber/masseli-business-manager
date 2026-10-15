-- NEXALVO QA P0.03 — expense request-id replay regression.
-- TEST ONLY. Run only after both 20261015 expense migrations are explicitly authorized/applied.
-- NO persistent mutations: every operation is enclosed by BEGIN ... ROLLBACK.
-- This file is prepared evidence; its presence does not claim database execution or approval.

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT set_config('request.jwt.claim.sub','88eddcda-d8b5-4474-b5d7-19860dd97fba',true);
SELECT set_config('request.jwt.claims','{"sub":"88eddcda-d8b5-4474-b5d7-19860dd97fba","role":"authenticated"}',true);

DO $qa$
DECLARE
  v_business_id uuid := '3849b750-20f7-4929-8699-737a4e1983c8';
  v_location_id uuid := 'f0715b85-af37-4bba-be7e-448732176446';
  v_owner_id uuid := '88eddcda-d8b5-4474-b5d7-19860dd97fba';
  v_request_id uuid := gen_random_uuid();
  v_foreign_request_id uuid := gen_random_uuid();
  v_tag text := 'QA_P003_EXPENSE_REPLAY_' || gen_random_uuid()::text;
  v_first public.expenses;
  v_replay public.expenses;
  v_count integer;
  v_audit_before integer;
  v_audit_after integer;
  v_message text;
  v_changed_payload_blocked boolean := false;
  v_foreign_blocked boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.businesses
    WHERE id = v_business_id AND name = 'ZZ_QA_PLATFORM_20261009_AUTO'
  ) THEN
    RAISE EXCEPTION 'TEST-only business safety guard failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_owner_id AND business_id = v_business_id AND role = 'OWNER' AND active = true
  ) THEN
    RAISE EXCEPTION 'TEST-only OWNER identity guard failed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.locations
    WHERE id = v_location_id AND business_id = v_business_id
  ) THEN
    RAISE EXCEPTION 'TEST-only location safety guard failed';
  END IF;

  SELECT count(*) INTO v_audit_before
  FROM public.audit_logs
  WHERE business_id = v_business_id
    AND user_id = v_owner_id
    AND action = 'Expense Added';

  v_first := public.fn_create_expense_idempotent(
    v_request_id, v_business_id, v_location_id, CURRENT_DATE,
    'QA Replay', v_tag, 12.34, 'Card', false, v_tag
  );
  v_replay := public.fn_create_expense_idempotent(
    v_request_id, v_business_id, v_location_id, CURRENT_DATE,
    'QA Replay', v_tag, 12.34, 'Card', false, v_tag
  );
  IF v_first.id IS NULL OR v_replay.id IS DISTINCT FROM v_first.id THEN
    RAISE EXCEPTION 'Exact replay did not return the original expense';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.expenses
  WHERE business_id = v_business_id AND description = v_tag;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Exact replay created % expense rows instead of one', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.cash_flow
  WHERE business_id = v_business_id AND expense_id = v_first.id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Exact replay created % expense ledger rows instead of one', v_count;
  END IF;

  SELECT count(*) INTO v_audit_after
  FROM public.audit_logs
  WHERE business_id = v_business_id
    AND user_id = v_owner_id
    AND action = 'Expense Added';
  IF v_audit_after IS DISTINCT FROM v_audit_before + 1 THEN
    RAISE EXCEPTION 'Exact replay changed the expense audit count by more than one';
  END IF;

  BEGIN
    PERFORM public.fn_create_expense_idempotent(
      v_request_id, v_business_id, v_location_id, CURRENT_DATE,
      'QA Replay', v_tag, 12.35, 'Card', false, v_tag
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT ILIKE '%idempotency key reused with different payload%' THEN
      RAISE EXCEPTION 'Unexpected changed-payload rejection: %', v_message;
    END IF;
    v_changed_payload_blocked := true;
  END;
  IF NOT v_changed_payload_blocked THEN
    RAISE EXCEPTION 'Changed payload reused the same idempotency key';
  END IF;

  BEGIN
    PERFORM public.fn_create_expense_idempotent(
      v_foreign_request_id,
      'd627563b-2ce4-491d-8cf6-141ef28d0f63',
      'a3e4b2ed-eb00-4963-afd0-38c256aff87d',
      CURRENT_DATE, 'QA Replay', v_tag, 1, 'Card', false, v_tag || ':foreign'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT ILIKE '%business_id mismatch%' THEN
      RAISE EXCEPTION 'Unexpected cross-tenant rejection: %', v_message;
    END IF;
    v_foreign_blocked := true;
  END;
  IF NOT v_foreign_blocked THEN
    RAISE EXCEPTION 'Cross-tenant idempotent expense was accepted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expenses WHERE description = v_tag || ':foreign'
  ) OR EXISTS (
    SELECT 1 FROM public.cash_flow WHERE description = v_tag || ':foreign'
  ) THEN
    RAISE EXCEPTION 'Rejected cross-tenant replay left business rows';
  END IF;

  RAISE NOTICE 'PASS: P0.03 expense idempotency checks (rollback; no persistent mutations)';
END;
$qa$;

ROLLBACK;
