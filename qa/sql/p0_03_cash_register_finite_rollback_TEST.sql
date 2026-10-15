-- NEXALVO QA P0.03 — cash-register finite opening-value regression.
-- TEST ONLY. Run only after the matching TEST migration is explicitly authorized and applied.
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
  v_tag text := 'QA_P003_REGISTER_FINITE_' || gen_random_uuid()::text;
  v_value numeric;
  v_register public.cash_registers;
  v_message text;
  v_blocked boolean;
  v_count integer;
  v_audit_before integer;
  v_audit_after integer;
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

  FOREACH v_value IN ARRAY ARRAY[
    NULL::numeric, 'NaN'::numeric, 'Infinity'::numeric, '-Infinity'::numeric, (-1)::numeric
  ] LOOP
    v_blocked := false;
    BEGIN
      PERFORM public.fn_open_cash_register(
        v_business_id, v_location_id, v_value, v_tag || ':invalid'
      );
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
      IF v_message NOT ILIKE '%opening cash must be zero or a positive finite amount%' THEN
        RAISE EXCEPTION 'Unexpected invalid opening-cash rejection: %', v_message;
      END IF;
      v_blocked := true;
    END;
    IF NOT v_blocked THEN
      RAISE EXCEPTION 'Invalid opening cash was accepted: %', v_value;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.cash_registers
      WHERE business_id = v_business_id AND location_id = v_location_id AND status = 'open'
    ) THEN
      RAISE EXCEPTION 'Rejected opening cash left an open register';
    END IF;
  END LOOP;

  SELECT count(*) INTO v_audit_before
  FROM public.audit_logs
  WHERE business_id = v_business_id
    AND user_id = v_owner_id
    AND action = 'Cash Register Opened';

  v_register := public.fn_open_cash_register(
    v_business_id, v_location_id, 25, v_tag || ':valid'
  );
  IF v_register.id IS NULL
     OR v_register.business_id IS DISTINCT FROM v_business_id
     OR v_register.location_id IS DISTINCT FROM v_location_id
     OR v_register.opening_cash IS DISTINCT FROM 25
     OR v_register.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'Finite opening cash did not create the controlled register';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.cash_flow
  WHERE related_cash_register_id = v_register.id
    AND business_id = v_business_id
    AND location_id = v_location_id
    AND type = 'opening_balance'
    AND amount = 25
    AND payment_method = 'Cash';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Finite opening cash created % opening ledger rows instead of one', v_count;
  END IF;

  SELECT count(*) INTO v_audit_after
  FROM public.audit_logs
  WHERE business_id = v_business_id
    AND user_id = v_owner_id
    AND action = 'Cash Register Opened';
  IF v_audit_after IS DISTINCT FROM v_audit_before + 1 THEN
    RAISE EXCEPTION 'Finite opening cash did not create exactly one audit row';
  END IF;

  RAISE NOTICE 'PASS: P0.03 finite opening-cash checks (rollback; no persistent mutations)';
END;
$qa$;

ROLLBACK;
