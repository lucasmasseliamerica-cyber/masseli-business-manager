-- NEXALVO v1.6.8 / P0.03 — TEST-only prepared expense idempotency migration.
-- Target when explicitly authorized: Supabase TEST msinksoilkluooxenecy only.
-- PREPARED, NOT EXECUTED. Do not apply to production.
-- Apply only after 20261015_expense_cash_normalization_TEST.sql.
-- The legacy fn_create_expense signature remains available while the frontend flag is OFF.

BEGIN;

CREATE TABLE IF NOT EXISTS public.expense_request_keys (
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  request_id uuid NOT NULL,
  request_payload jsonb NOT NULL,
  expense_id uuid REFERENCES public.expenses(id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (business_id, request_id)
);

ALTER TABLE public.expense_request_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.expense_request_keys FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_create_expense_idempotent(
  p_request_id uuid,
  p_business_id uuid,
  p_location_id uuid,
  p_expense_date date,
  p_category text,
  p_vendor text,
  p_amount numeric,
  p_payment_method text,
  p_recurring boolean,
  p_notes text
) RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_payload jsonb;
  v_key public.expense_request_keys;
  v_expense public.expenses;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'p_request_id is required';
  END IF;
  IF p_business_id IS DISTINCT FROM public.current_business_id() THEN
    RAISE EXCEPTION 'business_id mismatch';
  END IF;
  IF public.user_can('manageExpenses') IS NOT TRUE THEN
    RAISE EXCEPTION 'permission denied: manageExpenses required';
  END IF;

  -- jsonb preserves the complete canonical request instead of relying on a collision-prone hash.
  -- A retry must use the same key and the same payload byte semantics after jsonb normalization.
  v_payload := pg_catalog.jsonb_build_object(
    'business_id', p_business_id,
    'location_id', p_location_id,
    'expense_date', p_expense_date,
    'category', p_category,
    'vendor', p_vendor,
    'amount', p_amount,
    'payment_method', p_payment_method,
    'recurring', p_recurring,
    'notes', p_notes
  );

  INSERT INTO public.expense_request_keys
    (business_id, request_id, request_payload)
  VALUES
    (p_business_id, p_request_id, v_payload)
  ON CONFLICT (business_id, request_id) DO NOTHING;

  -- Concurrent requests for the same tenant/key serialize here. The losing request observes
  -- either the committed expense_id or a rollback, never a second expense creation.
  SELECT * INTO v_key
  FROM public.expense_request_keys
  WHERE business_id = p_business_id AND request_id = p_request_id
  FOR UPDATE;

  IF v_key.request_payload IS DISTINCT FROM v_payload THEN
    RAISE EXCEPTION 'idempotency key reused with different payload';
  END IF;

  IF v_key.expense_id IS NOT NULL THEN
    SELECT * INTO v_expense
    FROM public.expenses
    WHERE id = v_key.expense_id AND business_id = p_business_id;
    IF v_expense.id IS NULL THEN
      RAISE EXCEPTION 'existing expense not found';
    END IF;
    RETURN v_expense;
  END IF;

  -- The normalized base function retains validation, drawer locking, ledger and audit atomicity.
  -- The request key and all base-function mutations commit or roll back in the same transaction.
  v_expense := public.fn_create_expense(
    p_business_id, p_location_id, p_expense_date, p_category, p_vendor,
    p_amount, p_payment_method, p_recurring, p_notes
  );

  UPDATE public.expense_request_keys
  SET expense_id = v_expense.id
  WHERE business_id = p_business_id AND request_id = p_request_id;

  RETURN v_expense;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_create_expense_idempotent(
  uuid, uuid, uuid, date, text, text, numeric, text, boolean, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_create_expense_idempotent(
  uuid, uuid, uuid, date, text, text, numeric, text, boolean, text
) TO authenticated;

COMMIT;
