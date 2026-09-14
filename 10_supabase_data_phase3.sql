begin;

-- Advance exactly one fulfillment step server-side. Sales table remains protected from
-- direct browser writes; this RPC is the only operational status mutation exposed in Phase 3.
create or replace function public.fn_advance_sale_fulfillment(p_sale_id uuid)
returns public.sales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales;
  v_next text;
begin
  if not public.user_can('manageSales') then
    raise exception 'permission denied: manageSales required';
  end if;

  select * into v_sale
  from public.sales
  where id = p_sale_id
    and business_id = public.current_business_id()
  for update;

  if v_sale.id is null then raise exception 'sale not found'; end if;
  if v_sale.status = 'cancelled' then raise exception 'sale is cancelled'; end if;

  v_next := case v_sale.fulfillment_status
    when 'Received' then 'Preparing'
    when 'Preparing' then 'Ready'
    when 'Ready' then 'Completed'
    else 'Completed'
  end;

  if v_next is distinct from v_sale.fulfillment_status then
    update public.sales set fulfillment_status = v_next where id = p_sale_id returning * into v_sale;
  end if;

  return v_sale;
end;
$$;

revoke all on function public.fn_advance_sale_fulfillment(uuid) from public, anon;
grant execute on function public.fn_advance_sale_fulfillment(uuid) to authenticated;

commit;

select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('fn_create_sale','fn_reverse_sale','fn_advance_sale_fulfillment')
order by p.proname;
