-- NEXALVO TEST-only rollback for the manage-staff-user profile RPC.
-- PREPARED ONLY: do not run without explicit authorization.
-- User profiles, Auth identities and audit history are retained.

BEGIN;

DROP FUNCTION IF EXISTS public.fn_manage_staff_profile(
  text, uuid, uuid, uuid, uuid, text, text, text, jsonb, boolean
);

COMMIT;
