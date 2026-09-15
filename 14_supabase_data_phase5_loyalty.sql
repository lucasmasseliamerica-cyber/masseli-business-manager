-- NEXALVO v1.6 — Phase 5A: Loyalty verification / default reward
-- Existing loyalty ledger mutations remain RPC-only. This patch only ensures a usable
-- default reward exists per tenant and reasserts the intended execute grants.

insert into public.loyalty_rewards (business_id, name, required_points, discount_type, discount_value, active)
select b.id, '$10 Off', 100, 'fixed', 10, true
from public.businesses b
where not exists (
  select 1 from public.loyalty_rewards r where r.business_id = b.id
);

revoke all on function public.fn_commit_loyalty_for_sale(uuid, uuid) from public, anon;
revoke all on function public.fn_reverse_loyalty_for_sale(uuid) from public, anon;
revoke all on function public.fn_manual_loyalty_adjustment(uuid, uuid, text, numeric, text) from public, anon;
grant execute on function public.fn_commit_loyalty_for_sale(uuid, uuid) to authenticated;
grant execute on function public.fn_reverse_loyalty_for_sale(uuid) to authenticated;
grant execute on function public.fn_manual_loyalty_adjustment(uuid, uuid, text, numeric, text) to authenticated;

select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_commit_loyalty_for_sale','fn_reverse_loyalty_for_sale','fn_manual_loyalty_adjustment')
order by p.proname;
