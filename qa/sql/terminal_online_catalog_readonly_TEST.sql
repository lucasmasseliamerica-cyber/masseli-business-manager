-- Run against the fixed Supabase TEST project only. This query does not touch business rows.
begin transaction read only;
set local statement_timeout = '20s';
with dependencies(signature, expected_md5) as (values
  ('public.fn_create_sale(uuid,uuid,uuid,text,text,uuid,uuid,numeric,numeric,text,text,jsonb)','aabbddc8a9c4a37a171b8a269e9c3139'),
  ('public.current_business_id()','8326e5f1bc2ecf720cb0aa3be9a0d0d6'),
  ('public.user_can(text)','78e7ac15c93a208fdec8baf37e2b9c02'),
  ('public.fn_next_order_no(uuid,text)','143dc0404b1e7710598030e5f4755bfa'),
  ('public.fn_record_inventory_movement(uuid,uuid,uuid,text,numeric,numeric,uuid,uuid,uuid,text,boolean)','27bb16e1ab20acc78ef5bb2f25eb9c04')
), checked as (
  select signature, md5(pg_get_functiondef(to_regprocedure(signature))) = expected_md5 as matches from dependencies
)
select jsonb_build_object(
  'observed_utc', clock_timestamp(),
  'dependency_matches', (select jsonb_agg(to_jsonb(checked) order by signature) from checked),
  'private_schema_present', to_regnamespace('terminal_private') is not null,
  'sales_triggers', (select coalesce(jsonb_agg(t.tgname order by t.tgname),'[]') from pg_trigger t
    where t.tgrelid = 'public.sales'::regclass and not t.tgisinternal),
  'tables', (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,
    'client_select',has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT')) order by c.relname),'[]')
    from pg_class c where c.relnamespace = to_regnamespace('terminal_private') and c.relkind = 'r'),
  'service_rpcs', (select coalesce(jsonb_agg(jsonb_build_object('name',p.proname,
    'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'), 'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service_execute',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.proname),'[]')
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'fn_terminal_%')
) as terminal_catalog;
rollback;
