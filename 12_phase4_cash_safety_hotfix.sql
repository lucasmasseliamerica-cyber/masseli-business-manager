-- NEXALVO v1.5.3 — Phase 4 cash safety hotfix
-- 1) Opening a register with $0 no longer attempts a forbidden $0 cash_flow row.
-- 2) Cash expenses require an open register and are linked to that register so closing cash is correct.

create or replace function public.fn_open_cash_register(
  p_business_id uuid, p_location_id uuid, p_opening_cash numeric, p_notes text
) returns public.cash_registers
language plpgsql security definer set search_path = public as $$
declare
  v_existing public.cash_registers;
  v_register public.cash_registers;
begin
  if p_business_id is distinct from public.current_business_id() then raise exception 'business_id mismatch'; end if;
  if not public.user_can('manageCashRegister') then raise exception 'permission denied: manageCashRegister required'; end if;
  if not exists (select 1 from public.locations where id = p_location_id and business_id = p_business_id) then
    raise exception 'location not found';
  end if;
  select * into v_existing from public.cash_registers where location_id = p_location_id and status = 'open';
  if v_existing.id is not null then return v_existing; end if;
  if p_opening_cash < 0 then raise exception 'opening cash must be zero or a positive amount'; end if;

  insert into public.cash_registers (business_id, location_id, opened_by, opening_cash, expected_cash, notes)
  values (p_business_id, p_location_id, auth.uid(), p_opening_cash, p_opening_cash, p_notes)
  returning * into v_register;

  if p_opening_cash > 0 then
    insert into public.cash_flow
      (business_id, location_id, type, category, amount, payment_method, description, related_cash_register_id, created_by)
    values
      (p_business_id, p_location_id, 'opening_balance', 'Cash Register - Opening', p_opening_cash, 'Cash', 'Register opened', v_register.id, auth.uid());
  end if;

  insert into public.audit_logs (business_id, user_id, user_name_snapshot, role_snapshot, action, details)
  select p_business_id, u.id, u.name, u.role, 'Cash Register Opened', '$' || round(p_opening_cash, 2)
  from public.users u where u.id = auth.uid();

  return v_register;
end;
$$;

create or replace function public.fn_create_expense(
  p_business_id uuid, p_location_id uuid, p_expense_date date, p_category text,
  p_vendor text, p_amount numeric, p_payment_method text, p_recurring boolean, p_notes text
) returns public.expenses
language plpgsql security definer set search_path = public as $$
declare
  v_expense public.expenses;
  v_register public.cash_registers;
begin
  if p_business_id is distinct from public.current_business_id() then raise exception 'business_id mismatch'; end if;
  if not public.user_can('manageExpenses') then raise exception 'permission denied: manageExpenses required'; end if;
  if not exists (select 1 from public.locations where id = p_location_id and business_id = p_business_id) then
    raise exception 'location not found';
  end if;
  if p_amount <= 0 then raise exception 'expense amount must be greater than zero'; end if;

  if lower(coalesce(trim(p_payment_method), '')) = 'cash' then
    select * into v_register
    from public.cash_registers
    where business_id = p_business_id and location_id = p_location_id and status = 'open'
    order by opened_at desc
    limit 1;
    if v_register.id is null then
      raise exception 'the cash register is closed for this location. Open the register before recording a cash expense';
    end if;
  end if;

  insert into public.expenses
    (business_id, location_id, expense_date, category, vendor, amount, payment_method, recurring, description, created_by)
  values
    (p_business_id, p_location_id, p_expense_date, p_category, p_vendor, p_amount, p_payment_method, p_recurring, p_notes, auth.uid())
  returning * into v_expense;

  insert into public.cash_flow
    (business_id, location_id, type, category, amount, payment_method, description, expense_id, related_cash_register_id, created_by)
  values
    (p_business_id, p_location_id, 'expense', p_category, p_amount, p_payment_method,
     coalesce(p_notes, p_vendor), v_expense.id,
     case when lower(coalesce(trim(p_payment_method), '')) = 'cash' then v_register.id else null end,
     auth.uid());

  insert into public.audit_logs (business_id, user_id, user_name_snapshot, role_snapshot, action, details)
  select p_business_id, u.id, u.name, u.role, 'Expense Added', p_category || ' - ' || p_amount
  from public.users u where u.id = auth.uid();

  return v_expense;
end;
$$;

revoke all on function public.fn_open_cash_register(uuid, uuid, numeric, text) from public, anon;
revoke all on function public.fn_create_expense(uuid, uuid, date, text, text, numeric, text, boolean, text) from public, anon;
grant execute on function public.fn_open_cash_register(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.fn_create_expense(uuid, uuid, date, text, text, numeric, text, boolean, text) to authenticated;

select p.proname,
       p.prosecdef as security_definer,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_open_cash_register','fn_create_expense')
order by p.proname;
