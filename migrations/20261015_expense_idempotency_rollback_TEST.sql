-- NEXALVO TEST-only rollback for 20261015_expense_idempotency_TEST.sql.
-- PREPARED ONLY: do not run without explicit authorization.
-- Refuses to discard any request key because it is part of replay/audit safety.

BEGIN;

DO $block$
BEGIN
  IF to_regclass('public.expense_request_keys') IS NOT NULL THEN
    PERFORM 1 FROM public.expense_request_keys LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'rollback refused: expense idempotency request history exists';
    END IF;
  END IF;
END
$block$;

DROP FUNCTION IF EXISTS public.fn_create_expense_idempotent(
  uuid, uuid, uuid, date, text, text, numeric, text, boolean, text
);
DROP TABLE IF EXISTS public.expense_request_keys;

COMMIT;
