-- NEXALVO v1.6.8 — TEST-only catalog security hardening.
-- Target when explicitly authorized: Supabase TEST msinksoilkluooxenecy only.
-- PREPARED, NOT EXECUTED. Do not apply to production.
-- Source evidence: complete read-only catalog export SHA-256
-- a9e17a9bd5284616fc2356555beb407fb823994e4d34b8ebcdc10784b7e2856f.
-- Reconciled function capture SHA-256:
-- 8ba0df6e79a39f850f7b4a37430a42fbba603fac6b08a9344a92f14a25bc6c1c.
-- The apparent drift was limited to pg_get_functiondef return-type qualification under a fixed
-- pg_catalog search_path. Function bodies and semantics are byte-identical to the reviewed export.

BEGIN;
SET LOCAL search_path = pg_catalog;

DO $preflight$
DECLARE
  v_public_policy_count integer;
BEGIN
  IF pg_catalog.to_regprocedure('public.fn_read_employees_secure()') IS NULL THEN
    RAISE EXCEPTION 'preflight failed: fn_read_employees_secure() is missing';
  END IF;
  IF pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
     )) <> '6a004cb40f967cc39f4c3bd20fec817e' THEN
    RAISE EXCEPTION 'preflight failed: fn_read_employees_secure() drifted from reviewed TEST definition';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
    WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
      AND pg_catalog.md5(p.prosrc) = '540c5e0821623ebaac46e8d33ed947a7'
      AND p.prorettype = pg_catalog.to_regtype('public.employees')
      AND p.proretset AND p.prosecdef AND p.provolatile = 's'
      AND p.proconfig = ARRAY['search_path=""']::text[]
      AND l.lanname = 'sql'
  ) THEN
    RAISE EXCEPTION 'preflight failed: fn_read_employees_secure() body or attributes drifted';
  END IF;
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.employees', 'SELECT')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.employees', 'hourly_rate', 'SELECT') THEN
    RAISE EXCEPTION 'preflight failed: reviewed employee grants have changed';
  END IF;
  IF pg_catalog.to_regprocedure('public.fn_read_sale_items_secure()') IS NULL
     OR pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('public.fn_read_sale_items_secure()')
     )) <> 'b9c489bf2a75339768bcc19ba174821c' THEN
    RAISE EXCEPTION 'preflight failed: fn_read_sale_items_secure() drifted from reviewed TEST definition';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
    WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_sale_items_secure()')
      AND pg_catalog.md5(p.prosrc) = 'def30868edefbc15696aff8955f90296'
      AND p.prorettype = pg_catalog.to_regtype('public.sale_items')
      AND p.proretset AND p.prosecdef AND p.provolatile = 's'
      AND p.proconfig = ARRAY['search_path=""']::text[]
      AND l.lanname = 'sql'
  ) THEN
    RAISE EXCEPTION 'preflight failed: fn_read_sale_items_secure() body or attributes drifted';
  END IF;
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.sale_items', 'SELECT')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.sale_items', 'unit_cost_snapshot', 'SELECT') THEN
    RAISE EXCEPTION 'preflight failed: reviewed sale_items grants have changed';
  END IF;
  IF pg_catalog.to_regprocedure('public.fn_write_audit(text,text)') IS NULL
     OR pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
     )) <> '2d1742df2500389b93028511b1cb17e5' THEN
    RAISE EXCEPTION 'preflight failed: fn_write_audit(text,text) drifted from reviewed TEST definition';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
    WHERE p.oid = pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
      AND pg_catalog.md5(p.prosrc) = '4cf28670a1afda97f728954c6b58ff60'
      AND p.prorettype = pg_catalog.to_regtype('public.audit_logs')
      AND NOT p.proretset AND p.prosecdef AND p.provolatile = 'v'
      AND p.proconfig = ARRAY['search_path=public']::text[]
      AND l.lanname = 'plpgsql'
  ) THEN
    RAISE EXCEPTION 'preflight failed: fn_write_audit(text,text) body or attributes drifted';
  END IF;
  IF NOT (
    pg_catalog.has_function_privilege('authenticated', 'public.fn_read_employees_secure()', 'EXECUTE')
    AND pg_catalog.has_function_privilege('service_role', 'public.fn_read_employees_secure()', 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon', 'public.fn_read_employees_secure()', 'EXECUTE')
    AND pg_catalog.has_function_privilege('authenticated', 'public.fn_read_sale_items_secure()', 'EXECUTE')
    AND pg_catalog.has_function_privilege('service_role', 'public.fn_read_sale_items_secure()', 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon', 'public.fn_read_sale_items_secure()', 'EXECUTE')
    AND pg_catalog.has_function_privilege('authenticated', 'public.fn_write_audit(text,text)', 'EXECUTE')
    AND pg_catalog.has_function_privilege('service_role', 'public.fn_write_audit(text,text)', 'EXECUTE')
    AND NOT pg_catalog.has_function_privilege('anon', 'public.fn_write_audit(text,text)', 'EXECUTE')
    AND (
      SELECT count(*) = 3
      FROM pg_catalog.pg_proc AS p
      WHERE p.oid IN (
        pg_catalog.to_regprocedure('public.fn_read_employees_secure()'),
        pg_catalog.to_regprocedure('public.fn_read_sale_items_secure()'),
        pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
      )
        AND pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    )
  ) THEN
    RAISE EXCEPTION 'preflight failed: reviewed function owner or execute ACL drifted';
  END IF;
  IF pg_catalog.has_schema_privilege('authenticated', 'public', 'CREATE')
     OR pg_catalog.has_schema_privilege('anon', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'preflight failed: an API role can CREATE in public';
  END IF;
  SELECT count(*) INTO v_public_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND roles @> ARRAY['public']::name[];
  IF v_public_policy_count <> 21 THEN
    RAISE EXCEPTION 'preflight failed: expected 21 PUBLIC policies, found %', v_public_policy_count;
  END IF;
  IF pg_catalog.to_regprocedure('public.trg_validate_inventory_item_tenant_references()') IS NOT NULL
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid = 'public.inventory_items'::pg_catalog.regclass
         AND tgname = 'inventory_items_validate_tenant_references'
         AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'preflight failed: inventory item tenant guard already exists';
  END IF;
END;
$preflight$;

-- The deployed facade redacts hourly_rate but returned every employee in the tenant. Scope the
-- result before redaction: OWNER/manageUsers may read all; MANAGER may read self/direct reports;
-- other users may read only their own linked employee record.
CREATE OR REPLACE FUNCTION public.fn_read_employees_secure()
RETURNS SETOF public.employees
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH actor AS (
    SELECT u.business_id,
           u.employee_id,
           u.role,
           public.user_can('manageUsers') AS can_manage_users,
           public.user_can('viewFinancials') AS can_view_financials
    FROM public.users AS u
    WHERE u.id = auth.uid() AND u.active = true
  )
  SELECT e.id,
         e.business_id,
         e.name,
         e.job_title,
         CASE WHEN a.can_view_financials THEN e.hourly_rate ELSE NULL END AS hourly_rate,
         e.location_id,
         e.manager_id,
         e.active,
         e.notes,
         e.created_at,
         e.updated_at
  FROM public.employees AS e
  JOIN actor AS a ON a.business_id = e.business_id
  WHERE a.role = 'OWNER'
     OR a.can_manage_users
     OR e.id = a.employee_id
     OR (a.role = 'MANAGER' AND e.manager_id = a.employee_id);
$function$;

REVOKE ALL ON FUNCTION public.fn_read_employees_secure() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_read_employees_secure() TO authenticated, service_role;

-- Client audit messages are useful for UI-only outcomes, but they are not authoritative proof of
-- a database mutation. Mark their provenance at the server boundary and bound their size so they
-- cannot be confused with audit rows written transactionally inside business RPCs.
CREATE OR REPLACE FUNCTION public.fn_write_audit(p_action text, p_details text)
RETURNS public.audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_entry public.audit_logs;
  v_user public.users;
  v_action text := pg_catalog.regexp_replace(pg_catalog.btrim(p_action), '[[:cntrl:]]+', ' ', 'g');
BEGIN
  SELECT * INTO v_user FROM public.users WHERE id = auth.uid() AND active = true;
  IF v_user.id IS NULL THEN RAISE EXCEPTION 'active user profile required'; END IF;
  IF NULLIF(v_action, '') IS NULL OR pg_catalog.length(v_action) > 120 THEN
    RAISE EXCEPTION 'client audit action must contain 1 to 120 characters';
  END IF;
  IF pg_catalog.length(COALESCE(p_details, '')) > 2000 THEN
    RAISE EXCEPTION 'client audit details must contain at most 2000 characters';
  END IF;
  INSERT INTO public.audit_logs(
    business_id, user_id, user_name_snapshot, role_snapshot, action, details
  ) VALUES (
    v_user.business_id, v_user.id, v_user.name, v_user.role,
    'Client: ' || v_action, COALESCE(p_details, '')
  ) RETURNING * INTO v_entry;
  RETURN v_entry;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_write_audit(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_write_audit(text, text) TO authenticated, service_role;

-- RLS applies the same row scope to direct non-sensitive reads. Column privileges remove the
-- salary bypass; authorized salary reads continue through fn_read_employees_secure(). updated_at
-- remains readable so writes can use a non-sensitive optimistic-concurrency version predicate.
ALTER POLICY employees_select ON public.employees
  TO authenticated
  USING (
    business_id = public.current_business_id()
    AND (
      id = (SELECT u.employee_id FROM public.users AS u WHERE u.id = auth.uid() AND u.active = true)
      OR manager_id = (SELECT u.employee_id FROM public.users AS u
                       WHERE u.id = auth.uid() AND u.active = true AND u.role = 'MANAGER')
      OR public.user_can('manageUsers')
    )
  );

REVOKE SELECT ON TABLE public.employees FROM authenticated;
GRANT SELECT (
  id, business_id, name, job_title, location_id, manager_id, active, notes, created_at, updated_at
) ON TABLE public.employees TO authenticated;

-- The deployed sale-item facade redacts unit_cost_snapshot unless the actor may manage recipe
-- costs. Keep operational sale lines readable while closing the direct cost bypass.
REVOKE SELECT ON TABLE public.sale_items FROM authenticated;
GRANT SELECT (
  id, sale_id, product_id, product_name_snapshot, qty, unit_price
) ON TABLE public.sale_items TO authenticated;

-- Reading another login profile is an account-administration action. Every active user keeps
-- access to their own profile so bootstrap/login remains functional.
ALTER POLICY users_select ON public.users
  TO authenticated
  USING (
    business_id = public.current_business_id()
    AND (id = auth.uid() OR public.user_can('manageUsers'))
  );

-- These policies were assigned to PUBLIC even though anon has no matching table grants. Narrowing
-- the role preserves current authenticated behavior and removes dependence on that separate ACL.
ALTER POLICY cashregisters_select ON public.cash_registers TO authenticated;
ALTER POLICY customers_select ON public.customers TO authenticated;
ALTER POLICY invitems_select ON public.inventory_items TO authenticated;
ALTER POLICY invitems_write ON public.inventory_items TO authenticated;
ALTER POLICY invstock_select ON public.inventory_stock TO authenticated;
ALTER POLICY loyaltyrewards_select ON public.loyalty_rewards TO authenticated;
ALTER POLICY loyaltytx_select ON public.loyalty_transactions TO authenticated;
ALTER POLICY recipes_delete ON public.product_recipes TO authenticated;
ALTER POLICY recipes_write ON public.product_recipes TO authenticated;
ALTER POLICY products_write ON public.products TO authenticated;
ALTER POLICY role_defaults_readable ON public.role_default_permissions TO authenticated;
ALTER POLICY sale_items_select ON public.sale_items TO authenticated;
ALTER POLICY sales_select ON public.sales TO authenticated;
ALTER POLICY shiftbreaks_select ON public.shift_breaks TO authenticated;
ALTER POLICY shifts_select ON public.shifts TO authenticated;
ALTER POLICY suppliers_delete ON public.suppliers TO authenticated;
ALTER POLICY task_activity_select ON public.task_activity TO authenticated;
ALTER POLICY task_activity_write ON public.task_activity TO authenticated;
ALTER POLICY waste_select ON public.waste_transactions TO authenticated;

-- inventory_items is directly writable by adjustInventory. Its simple supplier_id FK proves that
-- the supplier exists, but not that it belongs to the same tenant.
CREATE FUNCTION public.trg_validate_inventory_item_tenant_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.supplier_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.suppliers AS s
       WHERE s.id = NEW.supplier_id AND s.business_id = NEW.business_id
     ) THEN
    RAISE EXCEPTION 'inventory item supplier must belong to the same business'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_validate_inventory_item_tenant_references()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_validate_inventory_item_tenant_references() TO service_role;

CREATE TRIGGER inventory_items_validate_tenant_references
BEFORE INSERT OR UPDATE OF supplier_id, business_id ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_inventory_item_tenant_references();

-- Trigger functions are not API endpoints. Trigger execution does not need authenticated to have
-- a direct EXECUTE grant.
REVOKE ALL ON FUNCTION public.trg_prevent_self_privilege_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_validate_user_permission_overrides() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_prevent_self_privilege_escalation() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_validate_user_permission_overrides() TO service_role;

-- All 58 deployed public functions are currently denied to anon, but postgres defaults would grant
-- EXECUTE to future functions. Require each future API function to opt in explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

COMMIT;
