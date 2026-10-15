-- NEXALVO v1.6.8 / P0.03 — TEST-only prepared cash-register finite-value guard.
-- Target when explicitly authorized: Supabase TEST msinksoilkluooxenecy only.
-- PREPARED, NOT EXECUTED. Do not apply to production.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_open_cash_register(
  p_business_id uuid, p_location_id uuid, p_opening_cash numeric, p_notes text
) RETURNS public.cash_registers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_existing public.cash_registers;
  v_register public.cash_registers;
  v_audit_rows integer;
BEGIN
  IF p_business_id IS DISTINCT FROM public.current_business_id() THEN
    RAISE EXCEPTION 'business_id mismatch';
  END IF;
  IF public.user_can('manageCashRegister') IS NOT TRUE THEN
    RAISE EXCEPTION 'permission denied: manageCashRegister required';
  END IF;
  IF p_opening_cash IS NULL
     OR pg_catalog.lower(p_opening_cash::text) IN ('nan', 'infinity', '-infinity')
     OR p_opening_cash < 0 THEN
    RAISE EXCEPTION 'opening cash must be zero or a positive finite amount';
  END IF;

  -- Lock the tenant-owned location before checking for an existing register. This both validates
  -- ownership before mutation and serializes concurrent opens for the same location.
  PERFORM 1
  FROM public.locations
  WHERE id = p_location_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'location not found';
  END IF;

  SELECT * INTO v_existing
  FROM public.cash_registers
  WHERE business_id = p_business_id
    AND location_id = p_location_id
    AND status = 'open'
  ORDER BY opened_at DESC
  LIMIT 1
  FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.cash_registers
    (business_id, location_id, opened_by, opening_cash, expected_cash, notes)
  VALUES
    (p_business_id, p_location_id, auth.uid(), p_opening_cash, p_opening_cash, p_notes)
  RETURNING * INTO v_register;

  IF p_opening_cash > 0 THEN
    INSERT INTO public.cash_flow
      (business_id, location_id, type, category, amount, payment_method, description,
       related_cash_register_id, created_by)
    VALUES
      (p_business_id, p_location_id, 'opening_balance', 'Cash Register - Opening',
       p_opening_cash, 'Cash', 'Register opened', v_register.id, auth.uid());
  END IF;

  INSERT INTO public.audit_logs
    (business_id, user_id, user_name_snapshot, role_snapshot, action, details)
  SELECT p_business_id, u.id, u.name, u.role,
         'Cash Register Opened', '$' || pg_catalog.round(p_opening_cash, 2)
  FROM public.users AS u
  WHERE u.id = auth.uid() AND u.business_id = p_business_id;
  GET DIAGNOSTICS v_audit_rows = ROW_COUNT;
  IF v_audit_rows <> 1 THEN
    RAISE EXCEPTION 'cash register audit identity is unavailable';
  END IF;

  RETURN v_register;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_open_cash_register(
  uuid, uuid, numeric, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_open_cash_register(
  uuid, uuid, numeric, text
) TO authenticated;

COMMIT;
