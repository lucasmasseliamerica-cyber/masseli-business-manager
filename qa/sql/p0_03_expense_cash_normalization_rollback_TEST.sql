-- NEXALVO QA P0.03 — expense Cash normalization and live-balance regression.
-- TEST ONLY. Run only after the matching TEST migration is explicitly authorized and applied.
-- NO persistent mutations: every business operation is enclosed by BEGIN ... ROLLBACK.
-- This file is prepared evidence; its presence does not claim database execution or approval.
-- The current RPC has no request ID and this script does not claim replay idempotency.

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
  v_register public.cash_registers;
  v_expense public.expenses;
  v_tag text := 'QA_P003_EXPENSE_CASH_' || gen_random_uuid()::text;
  v_available_cash numeric;
  v_count integer;
  v_audit_before integer;
  v_audit_after integer;
  v_message text;
  v_blocked boolean := false;
  v_foreign_blocked boolean := false;
  v_foreign_location_blocked boolean := false;
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
  IF EXISTS (
    SELECT 1 FROM public.cash_registers
    WHERE business_id = v_business_id AND location_id = v_location_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Unsafe fixture: TEST cash register is already open';
  END IF;

  BEGIN
    PERFORM public.fn_create_expense(
      'd627563b-2ce4-491d-8cf6-141ef28d0f63',
      'a3e4b2ed-eb00-4963-afd0-38c256aff87d',
      CURRENT_DATE, 'QA Rollback', v_tag, 1, 'Cash', false, v_tag || ':foreign'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT ILIKE '%business_id mismatch%' THEN
      RAISE EXCEPTION 'Unexpected cross-tenant rejection: %', v_message;
    END IF;
    v_foreign_blocked := true;
  END;
  IF NOT v_foreign_blocked THEN
    RAISE EXCEPTION 'Cross-tenant expense was accepted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expenses WHERE description = v_tag || ':foreign'
  ) OR EXISTS (
    SELECT 1 FROM public.cash_flow WHERE description = v_tag || ':foreign'
  ) THEN
    RAISE EXCEPTION 'Rejected cross-tenant expense left residual rows';
  END IF;

  BEGIN
    PERFORM public.fn_create_expense(
      v_business_id,
      'a3e4b2ed-eb00-4963-afd0-38c256aff87d',
      CURRENT_DATE, 'QA Rollback', v_tag, 1, 'Cash', false, v_tag || ':foreign-location'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT ILIKE '%location not found%' THEN
      RAISE EXCEPTION 'Unexpected foreign-location rejection: %', v_message;
    END IF;
    v_foreign_location_blocked := true;
  END;
  IF NOT v_foreign_location_blocked THEN
    RAISE EXCEPTION 'Location from another business was accepted';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.expenses WHERE description = v_tag || ':foreign-location'
  ) OR EXISTS (
    SELECT 1 FROM public.cash_flow WHERE description = v_tag || ':foreign-location'
  ) THEN
    RAISE EXCEPTION 'Rejected foreign-location expense left residual rows';
  END IF;

  v_register := public.fn_open_cash_register(
    v_business_id, v_location_id, 100, v_tag || ':register'
  );
  IF v_register.id IS NULL
     OR v_register.status IS DISTINCT FROM 'open'
     OR v_register.business_id IS DISTINCT FROM v_business_id
     OR v_register.location_id IS DISTINCT FROM v_location_id
     OR v_register.opening_cash IS DISTINCT FROM 100
     OR v_register.notes IS DISTINCT FROM v_tag || ':register' THEN
    RAISE EXCEPTION 'Controlled TEST cash register fixture was not created as requested';
  END IF;

  SELECT count(*) INTO v_audit_before
  FROM public.audit_logs
  WHERE business_id = v_business_id
    AND user_id = v_owner_id
    AND action = 'Expense Added';

  -- The category deliberately collides with the opening label. The authoritative type must
  -- still make this expense reduce the drawer balance.
  v_expense := public.fn_create_expense(
    v_business_id, v_location_id, CURRENT_DATE, 'Cash Register - Opening', v_tag,
    60, E'\tCaSh\t', false, v_tag || ':accepted'
  );
  IF v_expense.id IS NULL OR v_expense.payment_method IS DISTINCT FROM 'Cash' THEN
    RAISE EXCEPTION 'Expense payment method was not stored canonically as Cash';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.cash_flow
  WHERE expense_id = v_expense.id
    AND related_cash_register_id = v_register.id
    AND payment_method = 'Cash'
    AND amount = 60;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Canonical Cash expense ledger entry missing or duplicated';
  END IF;

  SELECT v_register.opening_cash
         + COALESCE(SUM(CASE WHEN cf.type = 'income' THEN cf.amount ELSE -cf.amount END), 0)
    INTO v_available_cash
  FROM public.cash_flow AS cf
  WHERE cf.related_cash_register_id = v_register.id
    AND cf.business_id = v_business_id
    AND cf.location_id = v_location_id
    AND cf.type IN ('income', 'expense')
    AND pg_catalog.lower(pg_catalog.regexp_replace(
      cf.payment_method, '^[[:space:]]+|[[:space:]]+$', '', 'g'
    )) = 'cash';
  IF v_available_cash IS DISTINCT FROM 40 THEN
    RAISE EXCEPTION 'Expected $40 controlled balance after canonical Cash expense, got $%', v_available_cash;
  END IF;

  BEGIN
    PERFORM public.fn_create_expense(
      v_business_id, v_location_id, CURRENT_DATE, 'QA Rollback', v_tag,
      50, 'Cash', false, v_tag || ':blocked'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
    IF v_message NOT ILIKE '%insufficient cash in register%' THEN
      RAISE EXCEPTION 'Unexpected second-expense rejection: %', v_message;
    END IF;
    v_blocked := true;
  END;
  IF NOT v_blocked THEN
    RAISE EXCEPTION 'Expense above the remaining controlled cash balance was accepted';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.expenses
    WHERE business_id = v_business_id AND description = v_tag || ':blocked'
  ) OR EXISTS (
    SELECT 1 FROM public.cash_flow
    WHERE business_id = v_business_id AND description = v_tag || ':blocked'
  ) THEN
    RAISE EXCEPTION 'Rejected second expense left residual expense or ledger rows';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.expenses
  WHERE business_id = v_business_id AND description = v_tag || ':accepted';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Accepted expense count changed after rejected retry: %', v_count;
  END IF;

  SELECT count(*) INTO v_audit_after
  FROM public.audit_logs
  WHERE business_id = v_business_id
    AND user_id = v_owner_id
    AND action = 'Expense Added';
  IF v_audit_after IS DISTINCT FROM v_audit_before + 1 THEN
    RAISE EXCEPTION 'Accepted expense audit row was not atomic: before %, after %', v_audit_before, v_audit_after;
  END IF;

  SELECT v_register.opening_cash
         + COALESCE(SUM(CASE WHEN cf.type = 'income' THEN cf.amount ELSE -cf.amount END), 0)
    INTO v_available_cash
  FROM public.cash_flow AS cf
  WHERE cf.related_cash_register_id = v_register.id
    AND cf.business_id = v_business_id
    AND cf.location_id = v_location_id
    AND cf.type IN ('income', 'expense')
    AND pg_catalog.lower(pg_catalog.regexp_replace(
      cf.payment_method, '^[[:space:]]+|[[:space:]]+$', '', 'g'
    )) = 'cash';
  IF v_available_cash IS DISTINCT FROM 40 THEN
    RAISE EXCEPTION 'Rejected expense changed the controlled cash balance: %', v_available_cash;
  END IF;
  RAISE NOTICE 'PASS: P0.03 expense Cash normalization checks (rollback; no persistent mutations)';
END;
$qa$;

ROLLBACK;
