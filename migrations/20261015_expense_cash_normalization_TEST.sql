-- NEXALVO v1.6.8 / P0.03 — TEST-only prepared migration.
-- Target when explicitly authorized: Supabase TEST msinksoilkluooxenecy only.
-- PREPARED, NOT EXECUTED. Do not apply to production.
-- Keeps the existing expense transaction contract while making Cash normalization and
-- live-drawer balance checks consistent for current and historical payment-method casing.
-- This signature has no operation/request ID, so it is not replay-idempotent. A caller that
-- loses the response must reconcile expense/cash-flow history before attempting another write.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_create_expense(
  p_business_id uuid, p_location_id uuid, p_expense_date date, p_category text,
  p_vendor text, p_amount numeric, p_payment_method text, p_recurring boolean, p_notes text
) RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_expense public.expenses;
  v_register public.cash_registers;
  v_available_cash numeric;
  v_is_cash boolean;
  v_payment_method text;
  v_audit_rows integer;
BEGIN
  IF p_business_id IS DISTINCT FROM public.current_business_id() THEN
    RAISE EXCEPTION 'business_id mismatch';
  END IF;
  IF public.user_can('manageExpenses') IS NOT TRUE THEN
    RAISE EXCEPTION 'permission denied: manageExpenses required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.locations
    WHERE id = p_location_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'location not found';
  END IF;
  IF p_amount IS NULL
     OR pg_catalog.lower(p_amount::text) IN ('nan', 'infinity', '-infinity')
     OR p_amount <= 0 THEN
    RAISE EXCEPTION 'expense amount must be greater than zero and finite';
  END IF;
  v_payment_method := pg_catalog.regexp_replace(
    p_payment_method, '^[[:space:]]+|[[:space:]]+$', '', 'g'
  );
  IF NULLIF(v_payment_method, '') IS NULL THEN
    RAISE EXCEPTION 'payment method is required';
  END IF;

  v_is_cash := pg_catalog.lower(v_payment_method) = 'cash';
  v_payment_method := CASE WHEN v_is_cash THEN 'Cash' ELSE v_payment_method END;

  IF v_is_cash THEN
    SELECT * INTO v_register
    FROM public.cash_registers
    WHERE business_id = p_business_id
      AND location_id = p_location_id
      AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1
    FOR UPDATE;
    IF v_register.id IS NULL THEN
      RAISE EXCEPTION 'the cash register is closed for this location. Open the register before recording a cash expense';
    END IF;

    SELECT v_register.opening_cash
           + COALESCE(SUM(CASE
               WHEN cf.type = 'income' THEN cf.amount
               WHEN cf.type = 'expense' THEN -cf.amount
             END), 0)
      INTO v_available_cash
    FROM public.cash_flow AS cf
    WHERE cf.related_cash_register_id = v_register.id
      AND cf.business_id = p_business_id
      AND cf.location_id = p_location_id
      AND cf.type IN ('income', 'expense')
      AND pg_catalog.lower(pg_catalog.regexp_replace(
        cf.payment_method, '^[[:space:]]+|[[:space:]]+$', '', 'g'
      )) = 'cash';

    IF v_available_cash IS NULL
       OR pg_catalog.lower(v_available_cash::text) IN ('nan', 'infinity', '-infinity')
       OR v_available_cash < 0 THEN
      RAISE EXCEPTION 'cash register balance is unavailable';
    END IF;
    IF p_amount > v_available_cash THEN
      RAISE EXCEPTION 'insufficient cash in register: available $%, expense $%',
        pg_catalog.round(v_available_cash, 2), pg_catalog.round(p_amount, 2);
    END IF;
  END IF;

  INSERT INTO public.expenses
    (business_id, location_id, expense_date, category, vendor, amount, payment_method, recurring, description, created_by)
  VALUES
    (p_business_id, p_location_id, p_expense_date, p_category, p_vendor, p_amount, v_payment_method, p_recurring, p_notes, auth.uid())
  RETURNING * INTO v_expense;

  INSERT INTO public.cash_flow
    (business_id, location_id, type, category, amount, payment_method, description, expense_id, related_cash_register_id, created_by)
  VALUES
    (p_business_id, p_location_id, 'expense', p_category, p_amount, v_payment_method,
     COALESCE(p_notes, p_vendor), v_expense.id,
     CASE WHEN v_is_cash THEN v_register.id ELSE NULL END,
     auth.uid());

  INSERT INTO public.audit_logs
    (business_id, user_id, user_name_snapshot, role_snapshot, action, details)
  SELECT p_business_id, u.id, u.name, u.role, 'Expense Added', p_category || ' - ' || p_amount
  FROM public.users AS u
  WHERE u.id = auth.uid() AND u.business_id = p_business_id;
  GET DIAGNOSTICS v_audit_rows = ROW_COUNT;
  IF v_audit_rows <> 1 THEN
    RAISE EXCEPTION 'expense audit identity is unavailable';
  END IF;

  RETURN v_expense;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_create_expense(
  uuid, uuid, date, text, text, numeric, text, boolean, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_expense(
  uuid, uuid, date, text, text, numeric, text, boolean, text
) TO authenticated;

COMMIT;
