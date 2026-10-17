-- NEXALVO TEST-only rollback for 20261012_purchase_order_idempotency_TEST.sql.
-- PREPARED ONLY: do not run without explicit authorization.
-- Refuses to discard any request key because it is part of replay/audit safety.

BEGIN;

DO $block$
BEGIN
  IF to_regclass('public.purchase_order_request_keys') IS NOT NULL THEN
    PERFORM 1 FROM public.purchase_order_request_keys LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'rollback refused: purchase idempotency request history exists';
    END IF;
  END IF;
END
$block$;

DROP FUNCTION IF EXISTS public.fn_create_purchase_order_idempotent(
  uuid, uuid, uuid, uuid, date, date, text, text, text, numeric, numeric, jsonb
);
DROP TABLE IF EXISTS public.purchase_order_request_keys;

COMMIT;
