-- NEXALVO v1.6.8 — TEST-only rollback for catalog security hardening.
-- Target when explicitly authorized: Supabase TEST msinksoilkluooxenecy only.
-- PREPARED, NOT EXECUTED. Restores the exact reviewed pre-apply access model.
-- Reconciled capture SHA-256:
-- 8ba0df6e79a39f850f7b4a37430a42fbba603fac6b08a9344a92f14a25bc6c1c.
-- Run only after the apply migration committed and only for a demonstrated incompatibility.

BEGIN;
SET LOCAL search_path = pg_catalog;

DO $rollback_preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
    WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
      AND pg_catalog.md5(p.prosrc) = '2c26a316e5cfc46dcfa187c550eb7108'
      AND p.proconfig = ARRAY['search_path=""']::text[]
  ) THEN
    RAISE EXCEPTION 'rollback refused: employee facade is not the reviewed hardening target';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
    WHERE p.oid = pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
      AND pg_catalog.md5(p.prosrc) = '75c32789a68a73e29a8a82d33e3aad27'
      AND p.proconfig = ARRAY['search_path=""']::text[]
  ) THEN
    RAISE EXCEPTION 'rollback refused: audit facade is not the reviewed hardening target';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
    WHERE p.oid = pg_catalog.to_regprocedure('public.fn_read_sale_items_secure()')
      AND pg_catalog.md5(p.prosrc) = 'def30868edefbc15696aff8955f90296'
  ) THEN
    RAISE EXCEPTION 'rollback refused: sale item facade changed during hardening';
  END IF;
  IF pg_catalog.has_column_privilege('authenticated', 'public.employees', 'hourly_rate', 'SELECT')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.employees', 'updated_at', 'SELECT')
     OR pg_catalog.has_column_privilege('authenticated', 'public.sale_items', 'unit_cost_snapshot', 'SELECT')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.sale_items', 'unit_price', 'SELECT') THEN
    RAISE EXCEPTION 'rollback refused: sensitive column grants do not match hardening target';
  END IF;
  IF pg_catalog.to_regprocedure('public.trg_validate_inventory_item_tenant_references()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_trigger
       WHERE tgrelid = 'public.inventory_items'::pg_catalog.regclass
         AND tgname = 'inventory_items_validate_tenant_references'
         AND NOT tgisinternal
     ) THEN
    RAISE EXCEPTION 'rollback refused: inventory tenant guard is not installed';
  END IF;
END;
$rollback_preflight$;

DROP TRIGGER IF EXISTS inventory_items_validate_tenant_references ON public.inventory_items;
DROP FUNCTION IF EXISTS public.trg_validate_inventory_item_tenant_references();

-- Remove explicit column ACLs before restoring the original table-level SELECT grant.
REVOKE SELECT (
  id, business_id, name, job_title, location_id, manager_id, active, notes, created_at, updated_at
) ON TABLE public.employees FROM authenticated;
GRANT SELECT ON TABLE public.employees TO authenticated;

REVOKE SELECT (
  id, sale_id, product_id, product_name_snapshot, qty, unit_price
) ON TABLE public.sale_items FROM authenticated;
GRANT SELECT ON TABLE public.sale_items TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_read_employees_secure()
RETURNS SETOF public.employees
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
 SELECT e.id,e.business_id,e.name,e.job_title,
 CASE WHEN public.user_can('viewFinancials') THEN e.hourly_rate ELSE NULL END AS hourly_rate,
 e.location_id,e.manager_id,e.active,e.notes,e.created_at,e.updated_at
 FROM public.employees e WHERE e.business_id=public.current_business_id()
$function$;

REVOKE ALL ON FUNCTION public.fn_read_employees_secure() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_read_employees_secure() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_write_audit(p_action text, p_details text)
RETURNS public.audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare v_entry audit_logs; v_user users;
begin
 select * into v_user from users where id=auth.uid() and active=true;
 if v_user.id is null then raise exception 'active user profile required'; end if;
 if nullif(btrim(p_action),'') is null then raise exception 'audit action is required'; end if;
 insert into audit_logs(business_id,user_id,user_name_snapshot,role_snapshot,action,details)
 values(v_user.business_id,v_user.id,v_user.name,v_user.role,btrim(p_action),coalesce(p_details,''))
 returning * into v_entry;
 return v_entry;
end;$function$;

REVOKE ALL ON FUNCTION public.fn_write_audit(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_write_audit(text, text) TO authenticated, service_role;

ALTER POLICY employees_select ON public.employees
  TO PUBLIC
  USING (business_id = public.current_business_id());
ALTER POLICY users_select ON public.users
  TO PUBLIC
  USING (business_id = public.current_business_id());

ALTER POLICY cashregisters_select ON public.cash_registers TO PUBLIC;
ALTER POLICY customers_select ON public.customers TO PUBLIC;
ALTER POLICY invitems_select ON public.inventory_items TO PUBLIC;
ALTER POLICY invitems_write ON public.inventory_items TO PUBLIC;
ALTER POLICY invstock_select ON public.inventory_stock TO PUBLIC;
ALTER POLICY loyaltyrewards_select ON public.loyalty_rewards TO PUBLIC;
ALTER POLICY loyaltytx_select ON public.loyalty_transactions TO PUBLIC;
ALTER POLICY recipes_delete ON public.product_recipes TO PUBLIC;
ALTER POLICY recipes_write ON public.product_recipes TO PUBLIC;
ALTER POLICY products_write ON public.products TO PUBLIC;
ALTER POLICY role_defaults_readable ON public.role_default_permissions TO PUBLIC;
ALTER POLICY sale_items_select ON public.sale_items TO PUBLIC;
ALTER POLICY sales_select ON public.sales TO PUBLIC;
ALTER POLICY shiftbreaks_select ON public.shift_breaks TO PUBLIC;
ALTER POLICY shifts_select ON public.shifts TO PUBLIC;
ALTER POLICY suppliers_delete ON public.suppliers TO PUBLIC;
ALTER POLICY task_activity_select ON public.task_activity TO PUBLIC;
ALTER POLICY task_activity_write ON public.task_activity TO PUBLIC;
ALTER POLICY waste_select ON public.waste_transactions TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.trg_prevent_self_privilege_escalation() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_set_updated_at() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.trg_validate_user_permission_overrides() TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;

DO $rollback_postflight$
BEGIN
  IF pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('public.fn_read_employees_secure()')
     )) <> '6a004cb40f967cc39f4c3bd20fec817e'
     OR pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('public.fn_read_sale_items_secure()')
     )) <> 'b9c489bf2a75339768bcc19ba174821c'
     OR pg_catalog.md5(pg_catalog.pg_get_functiondef(
       pg_catalog.to_regprocedure('public.fn_write_audit(text,text)')
     )) <> '2d1742df2500389b93028511b1cb17e5' THEN
    RAISE EXCEPTION 'rollback postflight failed: reconciled function baseline was not restored';
  END IF;
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.employees', 'SELECT')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.employees', 'hourly_rate', 'SELECT')
     OR NOT pg_catalog.has_table_privilege('authenticated', 'public.sale_items', 'SELECT')
     OR NOT pg_catalog.has_column_privilege('authenticated', 'public.sale_items', 'unit_cost_snapshot', 'SELECT')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.fn_read_employees_secure()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.fn_read_employees_secure()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.fn_read_employees_secure()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.fn_read_sale_items_secure()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.fn_read_sale_items_secure()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.fn_read_sale_items_secure()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.fn_write_audit(text,text)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.fn_write_audit(text,text)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.fn_write_audit(text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'rollback postflight failed: reconciled grants were not restored';
  END IF;
END;
$rollback_postflight$;

COMMIT;
