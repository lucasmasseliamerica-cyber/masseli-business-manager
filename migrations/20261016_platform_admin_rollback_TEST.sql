-- NEXALVO TEST-only rollback for 20261016_platform_admin_TEST.sql.
-- PREPARED ONLY: do not run without explicit authorization.
-- This rollback is valid only if the preflight proved that every platform column/function/schema
-- was absent before installation. It refuses to erase any administrative audit history.

BEGIN;

DO $block$
DECLARE
  v_audit_count bigint;
BEGIN
  IF to_regclass('nexalvo_private.platform_admin_audit_logs') IS NOT NULL THEN
    SELECT count(*) INTO v_audit_count FROM nexalvo_private.platform_admin_audit_logs;
    IF v_audit_count > 0 THEN
      RAISE EXCEPTION 'rollback refused: platform administration audit history exists';
    END IF;
  END IF;
END
$block$;

DROP FUNCTION IF EXISTS public.fn_platform_admin_execute(uuid, uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.fn_platform_admin_list_audit_logs(integer);
DROP FUNCTION IF EXISTS public.fn_platform_admin_list_businesses();

DROP TABLE IF EXISTS nexalvo_private.platform_admin_audit_logs;
DROP TABLE IF EXISTS nexalvo_private.platform_admin_requests;
DROP SCHEMA IF EXISTS nexalvo_private;

ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_platform_status_check,
  DROP CONSTRAINT IF EXISTS businesses_license_type_check,
  DROP COLUMN IF EXISTS platform_status,
  DROP COLUMN IF EXISTS license_type,
  DROP COLUMN IF EXISTS license_granted_at,
  DROP COLUMN IF EXISTS license_granted_by,
  DROP COLUMN IF EXISTS license_revoked_at,
  DROP COLUMN IF EXISTS license_revoked_by,
  DROP COLUMN IF EXISTS platform_updated_at;

COMMIT;
