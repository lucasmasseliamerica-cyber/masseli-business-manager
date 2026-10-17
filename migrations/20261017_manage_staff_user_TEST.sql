-- NEXALVO TEST-only staff profile service used by the manage-staff-user Edge Function.
-- PREPARED ONLY: do not apply without explicit authorization and deployed-schema review.
-- This migration does not create Auth identities or send invitations.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_manage_staff_profile(
  p_operation text,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_business_id uuid,
  p_employee_id uuid,
  p_name text,
  p_username text,
  p_role text,
  p_permission_overrides jsonb,
  p_active boolean
) RETURNS public.users
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_actor public.users;
  v_target public.users;
  v_result public.users;
  v_audit_rows integer;
BEGIN
  IF p_operation NOT IN ('invite', 'update')
     OR p_actor_user_id IS NULL OR p_target_user_id IS NULL OR p_business_id IS NULL THEN
    RAISE EXCEPTION 'invalid staff operation';
  END IF;
  IF NULLIF(pg_catalog.btrim(p_name), '') IS NULL OR pg_catalog.length(pg_catalog.btrim(p_name)) > 160
     OR NULLIF(pg_catalog.btrim(p_username), '') IS NULL OR pg_catalog.length(pg_catalog.btrim(p_username)) > 80 THEN
    RAISE EXCEPTION 'invalid staff profile fields';
  END IF;
  IF p_role NOT IN ('OWNER', 'MANAGER', 'EMPLOYEE') OR p_active IS NULL THEN
    RAISE EXCEPTION 'invalid staff role or active state';
  END IF;
  IF p_permission_overrides IS NULL OR pg_catalog.jsonb_typeof(p_permission_overrides) <> 'object'
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_each(p_permission_overrides) AS permission(key, value)
       WHERE permission.key <> ALL (ARRAY[
         'viewFinancials','manageSales','reverseSales','manageExpenses','reverseExpenses',
         'manageInventory','adjustInventory','manageRecipesAndCosts','managePurchases',
         'receivePurchases','paySuppliers','reversePurchases','manageSuppliers','viewReports',
         'manageTasks','manageUsers','manageSettings','manageCashRegister','manageCustomers','manageLoyalty'
       ]) OR pg_catalog.jsonb_typeof(permission.value) <> 'boolean'
     )
     OR (p_role = 'OWNER' AND p_permission_overrides <> '{}'::jsonb) THEN
    RAISE EXCEPTION 'invalid permission overrides';
  END IF;

  SELECT * INTO v_actor FROM public.users
  WHERE id = p_actor_user_id AND business_id = p_business_id
  FOR SHARE;
  IF v_actor.id IS NULL OR v_actor.active IS NOT TRUE
     OR (v_actor.role <> 'OWNER' AND (
       v_actor.role NOT IN ('MANAGER', 'EMPLOYEE')
       OR v_actor.permission_overrides -> 'manageUsers' IS DISTINCT FROM 'true'::jsonb
     )) THEN
    RAISE EXCEPTION 'permission denied: manageUsers required';
  END IF;

  IF p_employee_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.employees WHERE id = p_employee_id AND business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'employee link does not belong to this business';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.users
    WHERE business_id = p_business_id AND pg_catalog.lower(username) = pg_catalog.lower(pg_catalog.btrim(p_username))
      AND id <> p_target_user_id
  ) THEN
    RAISE EXCEPTION 'username is already in use';
  END IF;
  IF p_employee_id IS NOT NULL AND p_active IS TRUE AND EXISTS (
    SELECT 1 FROM public.users
    WHERE business_id = p_business_id AND employee_id = p_employee_id AND active IS TRUE
      AND id <> p_target_user_id
  ) THEN
    RAISE EXCEPTION 'employee is already linked to an active login';
  END IF;

  IF p_operation = 'invite' THEN
    IF EXISTS (SELECT 1 FROM public.users WHERE id = p_target_user_id) THEN
      RAISE EXCEPTION 'staff profile already exists';
    END IF;
    IF p_role = 'OWNER' AND v_actor.role <> 'OWNER' THEN
      RAISE EXCEPTION 'only an owner can invite another owner';
    END IF;
    IF v_actor.role <> 'OWNER' AND p_permission_overrides <> '{}'::jsonb THEN
      RAISE EXCEPTION 'only an owner can grant permission overrides';
    END IF;
    INSERT INTO public.users
      (id, business_id, employee_id, name, username, role, permission_overrides, active, updated_at)
    VALUES
      (p_target_user_id, p_business_id, p_employee_id, pg_catalog.btrim(p_name),
       pg_catalog.btrim(p_username), p_role, p_permission_overrides, p_active, pg_catalog.now())
    RETURNING * INTO v_result;
  ELSE
    SELECT * INTO v_target FROM public.users
    WHERE id = p_target_user_id AND business_id = p_business_id
    FOR UPDATE;
    IF v_target.id IS NULL THEN RAISE EXCEPTION 'staff profile not found'; END IF;
    IF v_actor.role <> 'OWNER' AND v_target.id = v_actor.id THEN
      RAISE EXCEPTION 'non-owner staff managers cannot change their own profile';
    END IF;
    IF (v_target.role = 'OWNER' OR p_role = 'OWNER') AND v_actor.role <> 'OWNER' THEN
      RAISE EXCEPTION 'only an owner can manage owner profiles';
    END IF;
    IF v_actor.role <> 'OWNER'
       AND (p_role IS DISTINCT FROM v_target.role
         OR p_permission_overrides IS DISTINCT FROM v_target.permission_overrides) THEN
      RAISE EXCEPTION 'only an owner can change roles or permission overrides';
    END IF;
    IF v_target.role = 'OWNER' AND (p_role <> 'OWNER' OR p_active IS NOT TRUE)
       AND NOT EXISTS (
         SELECT 1 FROM public.users
         WHERE business_id = p_business_id AND role = 'OWNER' AND active IS TRUE AND id <> p_target_user_id
       ) THEN
      RAISE EXCEPTION 'at least one active owner must remain';
    END IF;
    UPDATE public.users SET
      employee_id = p_employee_id,
      name = pg_catalog.btrim(p_name),
      username = pg_catalog.btrim(p_username),
      role = p_role,
      permission_overrides = p_permission_overrides,
      active = p_active,
      updated_at = pg_catalog.now()
    WHERE id = p_target_user_id AND business_id = p_business_id
    RETURNING * INTO v_result;
  END IF;

  INSERT INTO public.audit_logs
    (business_id, user_id, user_name_snapshot, role_snapshot, action, details)
  VALUES
    (p_business_id, v_actor.id, v_actor.name, v_actor.role,
     CASE WHEN p_operation = 'invite' THEN 'Staff User Invited' ELSE 'Staff User Updated' END,
     p_target_user_id::text || ' · ' || p_role || ' · active=' || p_active::text);
  GET DIAGNOSTICS v_audit_rows = ROW_COUNT;
  IF v_audit_rows <> 1 THEN RAISE EXCEPTION 'staff audit could not be recorded'; END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_manage_staff_profile(
  text, uuid, uuid, uuid, uuid, text, text, text, jsonb, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_manage_staff_profile(
  text, uuid, uuid, uuid, uuid, text, text, text, jsonb, boolean
) TO service_role;

COMMIT;
