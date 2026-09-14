-- NEXALVO v1.3 — Supabase Data Phase 2
-- Adds the one missing frontend-safe RPC required by the existing "Receive" stock action.
-- All other Phase 2 stock changes use already-installed RPCs.

begin;

create or replace function public.fn_receive_manual_stock(
  p_business_id uuid,
  p_inventory_item_id uuid,
  p_location_id uuid,
  p_qty numeric,
  p_notes text default null
) returns public.inventory_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock public.inventory_stock;
  v_item public.inventory_items;
begin
  if p_business_id is distinct from public.current_business_id() then
    raise exception 'business_id mismatch';
  end if;
  if not public.user_can('manageInventory') then
    raise exception 'permission denied: manageInventory required';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'received quantity must be greater than zero';
  end if;

  select * into v_item
  from public.inventory_items
  where id = p_inventory_item_id and business_id = p_business_id;
  if not found then raise exception 'inventory item not found'; end if;

  if not exists (
    select 1 from public.locations
    where id = p_location_id and business_id = p_business_id
  ) then raise exception 'location not found'; end if;

  select * into v_stock
  from public.inventory_stock
  where inventory_item_id = p_inventory_item_id and location_id = p_location_id;
  if not found then raise exception 'stock row not found for item/location'; end if;

  return public.fn_record_inventory_movement(
    p_business_id,
    p_inventory_item_id,
    p_location_id,
    'ADJUSTMENT',
    p_qty,
    v_stock.avg_cost_per_unit,
    null,
    null,
    null,
    'Manual quick-receive' || coalesce(' — ' || nullif(p_notes, ''), ''),
    true
  );
end;
$$;

revoke all on function public.fn_receive_manual_stock(uuid,uuid,uuid,numeric,text) from public, anon;
grant execute on function public.fn_receive_manual_stock(uuid,uuid,uuid,numeric,text) to authenticated;

commit;

-- Verification: expected authenticated_execute = true
select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fn_receive_manual_stock';
