-- NEXALVO TEST-only rollback for the manage-staff-user profile RPC.
-- PREPARED ONLY: do not run without explicit authorization.
-- User profiles, Auth identities and audit history are retained.

BEGIN;

GRANT EXECUTE ON FUNCTION public.fn_save_user_profile(
  uuid, text, text, text, uuid, boolean, jsonb
) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.fn_manage_staff_profile(
  text, uuid, uuid, uuid, uuid, text, text, text, jsonb, boolean
);

COMMIT;
