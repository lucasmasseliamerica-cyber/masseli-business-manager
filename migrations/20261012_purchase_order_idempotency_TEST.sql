-- NEXALVO TEST-only / QA branch migration.
-- PREPARED, NOT EXECUTED. Apply only to Supabase TEST msinksoilkluooxenecy after explicit authorization.
-- Legacy fn_create_purchase_order remains unchanged for existing callers.
BEGIN;

CREATE TABLE IF NOT EXISTS public.purchase_order_request_keys (
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 request_id uuid NOT NULL,
 request_payload jsonb NOT NULL,
 purchase_order_id uuid REFERENCES public.purchase_orders(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(business_id,request_id)
);
ALTER TABLE public.purchase_order_request_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_order_request_keys FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.fn_create_purchase_order_idempotent(
 p_request_id uuid,
 p_business_id uuid,
 p_supplier_id uuid,
 p_location_id uuid,
 p_order_date date,
 p_expected_date date,
 p_status text,
 p_payment_method text,
 p_notes text,
 p_discount numeric,
 p_tax numeric,
 p_items jsonb
) RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
 v_payload jsonb;
 v_row public.purchase_order_request_keys;
 v_po public.purchase_orders;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
 IF p_request_id IS NULL THEN RAISE EXCEPTION 'p_request_id is required'; END IF;
 IF p_business_id IS DISTINCT FROM public.current_business_id() THEN
   RAISE EXCEPTION 'business_id mismatch';
 END IF;
 IF NOT public.user_can('managePurchases') THEN
   RAISE EXCEPTION 'permission denied: managePurchases required';
 END IF;
 -- Retain the complete canonical payload. Exact retry only; changed terms or line-items with the
 -- same key must be rejected without relying on a collision-prone digest.
 v_payload:=jsonb_build_object(
   'business_id',p_business_id,'supplier_id',p_supplier_id,'location_id',p_location_id,
   'order_date',p_order_date,'expected_date',p_expected_date,'status',p_status,
   'payment_method',p_payment_method,'notes',p_notes,'discount',p_discount,
   'tax',p_tax,'items',p_items
 );
 INSERT INTO public.purchase_order_request_keys(business_id,request_id,request_payload)
 VALUES(p_business_id,p_request_id,v_payload)
 ON CONFLICT(business_id,request_id) DO NOTHING;
 SELECT * INTO v_row FROM public.purchase_order_request_keys
 WHERE business_id=p_business_id AND request_id=p_request_id
 FOR UPDATE;
 IF v_row.request_payload IS DISTINCT FROM v_payload THEN
   RAISE EXCEPTION 'idempotency key reused with different payload';
 END IF;
 IF v_row.purchase_order_id IS NOT NULL THEN
   SELECT * INTO v_po FROM public.purchase_orders
   WHERE id=v_row.purchase_order_id AND business_id=p_business_id;
   IF v_po.id IS NULL THEN RAISE EXCEPTION 'existing purchase order not found'; END IF;
   RETURN v_po;
 END IF;
 -- The old function owns all original validation, receipt and audit semantics.
 -- New key record and purchase order commit atomically in one transaction.
 v_po:=public.fn_create_purchase_order(
   p_business_id,p_supplier_id,p_location_id,p_order_date,p_expected_date,p_status,
   p_payment_method,p_notes,p_discount,p_tax,p_items
 );
 UPDATE public.purchase_order_request_keys SET purchase_order_id=v_po.id
 WHERE business_id=p_business_id AND request_id=p_request_id;
 RETURN v_po;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_create_purchase_order_idempotent(
 uuid,uuid,uuid,uuid,date,date,text,text,text,numeric,numeric,jsonb
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_create_purchase_order_idempotent(
 uuid,uuid,uuid,uuid,date,date,text,text,text,numeric,numeric,jsonb
) TO authenticated,service_role;

COMMIT;
