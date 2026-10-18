-- NEXALVO v1.6.8 — TEST-only rollback for catalog security hardening.
-- Target when explicitly authorized: Supabase TEST msinksoilkluooxenecy only.
-- PREPARED, NOT EXECUTED. Restores the exact reviewed pre-apply access model.

BEGIN;

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
DECLARE v_entry audit_logs; v_user users;
BEGIN
 SELECT * INTO v_user FROM users WHERE id=auth.uid() AND active=true;
 IF v_user.id IS NULL THEN RAISE EXCEPTION 'active user profile required'; END IF;
 IF NULLIF(btrim(p_action),'') IS NULL THEN RAISE EXCEPTION 'audit action is required'; END IF;
 INSERT INTO audit_logs(business_id,user_id,user_name_snapshot,role_snapshot,action,details)
 VALUES(v_user.business_id,v_user.id,v_user.name,v_user.role,btrim(p_action),coalesce(p_details,''))
 RETURNING * INTO v_entry;
 RETURN v_entry;
END;
$function$;

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

COMMIT;
