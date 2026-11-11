-- TEST msinksoilkluooxenecy. Prepared for review, not applied.
-- Replace only the existing closing RPC. The fingerprint blocks catalog drift.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $check$
begin
  if pg_catalog.md5(pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.fn_close_cash_register(uuid,numeric,text,text)')
  )) is distinct from 'abc12e6f24daac827c1fea828377e7a0' then
    raise exception 'CASH_REGISTER_CLOSE_CONTRACT_DRIFT';
  end if;
end;
$check$;

CREATE OR REPLACE FUNCTION public.fn_close_cash_register(p_register_id uuid, p_actual_cash numeric, p_difference_reason text, p_notes text)
 RETURNS cash_registers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_register cash_registers;
  v_expected numeric;
  v_difference numeric;
BEGIN

 IF p_actual_cash IS NOT NULL AND p_actual_cash::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'p_actual_cash must be finite'; END IF;
  if not user_can('manageCashRegister') then raise exception 'permission denied: manageCashRegister required'; end if;
  select * into v_register from cash_registers where id = p_register_id for update;
  if v_register.id is null or v_register.business_id is distinct from current_business_id() then raise exception 'register not found'; end if;
  if v_register.status = 'closed' then return v_register; end if;
  if p_actual_cash is null or p_actual_cash < 0 then raise exception 'enter a valid actual cash amount'; end if;

  -- Opening cash is added once. The ledger type distinguishes opening balances
  -- from income and expenses with a user-defined category of the same name.
  select v_register.opening_cash
         + coalesce(sum(case when cf.type = 'income' then cf.amount else -cf.amount end), 0)
    into v_expected
    from public.cash_flow cf
    where cf.related_cash_register_id = p_register_id
      and cf.business_id = v_register.business_id
      and cf.location_id = v_register.location_id
      and cf.type in ('income', 'expense')
      and pg_catalog.lower(pg_catalog.regexp_replace(
        cf.payment_method, '^[[:space:]]+|[[:space:]]+$', '', 'g'
      )) = 'cash';
  v_difference := round(p_actual_cash - v_expected, 2);
  if v_difference != 0 and (p_difference_reason is null or trim(p_difference_reason) = '') then
    raise exception 'a reason is required when actual cash does not match expected cash';
  end if;

  update cash_registers set status = 'closed', closed_by = auth.uid(), closed_at = now(),
    expected_cash = v_expected, actual_cash = p_actual_cash, difference = v_difference,
    difference_reason = case when v_difference != 0 then trim(p_difference_reason) else null end,
    notes = case when p_notes is not null then coalesce(notes || ' — ', '') || p_notes else notes end
    where id = p_register_id returning * into v_register;

  insert into audit_logs (business_id, user_id, user_name_snapshot, role_snapshot, action, details)
  select v_register.business_id, u.id, u.name, u.role, 'Cash Register Closed',
    '$' || round(p_actual_cash, 2) || ' actual vs ' || '$' || round(v_expected, 2) || ' expected'
  from users u where u.id = auth.uid();

  return v_register;
end;
$function$;

commit;
