-- NEXALVO v1.5 — Supabase Data Phase 4
-- Adds safe server-side cancellation for an unreceived purchase order.

create or replace function public.fn_cancel_purchase_order(p_purchase_order_id uuid)
returns public.purchase_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.purchase_orders;
  v_has_received boolean;
begin
  if not public.user_can('managePurchases') then
    raise exception 'permission denied: managePurchases required';
  end if;

  select * into v_po
  from public.purchase_orders
  where id = p_purchase_order_id
  for update;

  if v_po.id is null or v_po.business_id is distinct from public.current_business_id() then
    raise exception 'purchase order not found';
  end if;
  if v_po.status = 'Cancelled' then return v_po; end if;
  if v_po.status = 'Reversed' then raise exception 'reversed purchase orders cannot be cancelled'; end if;

  select coalesce(bool_or(received_qty > 0), false)
    into v_has_received
  from public.purchase_order_items
  where purchase_order_id = p_purchase_order_id;

  if v_has_received then
    raise exception 'purchase order has received inventory; use reversal instead';
  end if;

  update public.purchase_orders
  set status = 'Cancelled', updated_at = now()
  where id = p_purchase_order_id
  returning * into v_po;

  insert into public.audit_logs (business_id, user_id, user_name_snapshot, role_snapshot, action, details)
  select v_po.business_id, u.id, u.name, u.role, 'Purchase Order Cancelled', 'PO #' || v_po.po_number
  from public.users u where u.id = auth.uid();

  return v_po;
end;
$$;

revoke all on function public.fn_cancel_purchase_order(uuid) from public, anon;
grant execute on function public.fn_cancel_purchase_order(uuid) to authenticated;

select p.proname,
       p.prosecdef as security_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'fn_create_purchase_order','fn_receive_purchase_order','fn_pay_purchase_order','fn_reverse_po_payment','fn_reverse_purchase_order','fn_cancel_purchase_order',
    'fn_create_expense','fn_reverse_expense','fn_open_cash_register','fn_record_cash_movement','fn_close_cash_register'
  )
order by p.proname;
