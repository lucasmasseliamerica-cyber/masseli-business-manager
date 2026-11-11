-- Stripe Terminal online, TEST candidate. Existing sale and inventory routines are reused.
begin;

do $preflight$
begin
  if pg_catalog.md5(pg_catalog.pg_get_functiondef('public.fn_create_sale(uuid,uuid,uuid,text,text,uuid,uuid,numeric,numeric,text,text,jsonb)'::regprocedure)) <> 'aabbddc8a9c4a37a171b8a269e9c3139'
    or pg_catalog.md5(pg_catalog.pg_get_functiondef('public.current_business_id()'::regprocedure)) <> '8326e5f1bc2ecf720cb0aa3be9a0d0d6'
    or pg_catalog.md5(pg_catalog.pg_get_functiondef('public.user_can(text)'::regprocedure)) <> '78e7ac15c93a208fdec8baf37e2b9c02'
    or pg_catalog.md5(pg_catalog.pg_get_functiondef('public.fn_next_order_no(uuid,text)'::regprocedure)) <> '143dc0404b1e7710598030e5f4755bfa'
    or pg_catalog.md5(pg_catalog.pg_get_functiondef('public.fn_record_inventory_movement(uuid,uuid,uuid,text,numeric,numeric,uuid,uuid,uuid,text,boolean)'::regprocedure)) <> '27bb16e1ab20acc78ef5bb2f25eb9c04' then
    raise exception 'TERMINAL_SALE_CONTRACT_DRIFT';
  end if;
end;
$preflight$;

create schema terminal_private;
revoke all on schema terminal_private from public, anon, authenticated, service_role;

create table terminal_private.bindings (
  location_id uuid primary key references public.locations(id),
  business_id uuid not null references public.businesses(id),
  stripe_account_id text not null check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  stripe_location_id text not null check (stripe_location_id ~ '^tml_[A-Za-z0-9]+$'),
  reader_id text not null check (reader_id ~ '^tmr_[A-Za-z0-9]+$'),
  device_type text not null check (device_type in ('stripe_s700','simulated_stripe_s700')),
  network text not null check (network in ('wifi','ethernet')),
  max_amount_minor integer not null check (max_amount_minor between 50 and 99999999),
  enabled boolean not null default false,
  unique (stripe_account_id, reader_id)
);

create table terminal_private.attempts (
  operation_id uuid primary key,
  sale_id uuid not null unique,
  business_id uuid not null references public.businesses(id),
  location_id uuid not null references public.locations(id),
  actor_id uuid not null references public.users(id),
  binding jsonb not null,
  request_hash text not null,
  quote jsonb not null,
  amount_minor integer not null check (amount_minor between 50 and 99999999),
  state text not null default 'processing' check (state in ('processing','verifying','approved','declined','canceled')),
  payment_intent_id text check (payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),
  stripe_status text,
  stripe_confirmed boolean not null default false,
  create_reserved_at timestamptz,
  process_reserved_at timestamptz,
  cancel_reserved_at timestamptz,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((state = 'approved') = (committed_at is not null)),
  check (not stripe_confirmed or (stripe_status = 'succeeded' and payment_intent_id is not null))
);

create unique index terminal_intent_once
  on terminal_private.attempts ((binding ->> 'stripe_account_id'), payment_intent_id)
  where payment_intent_id is not null;
create unique index terminal_reader_in_use
  on terminal_private.attempts ((binding ->> 'stripe_account_id'), (binding ->> 'reader_id'))
  where state in ('processing','verifying');
create unique index terminal_open_location on terminal_private.attempts (business_id, location_id)
  where state in ('processing','verifying');

create table terminal_private.sale_authorizations (
  transaction_id xid8 not null,
  operation_id uuid not null references terminal_private.attempts(operation_id),
  primary key (transaction_id, operation_id)
);

create table terminal_private.events (
  stripe_account_id text not null,
  event_id text not null check (event_id ~ '^evt_[A-Za-z0-9]+$'),
  operation_id uuid not null references terminal_private.attempts(operation_id),
  processed_at timestamptz not null default now(),
  primary key (stripe_account_id, event_id)
);

alter table terminal_private.bindings enable row level security;
alter table terminal_private.attempts enable row level security;
alter table terminal_private.sale_authorizations enable row level security;
alter table terminal_private.events enable row level security;
revoke all on all tables in schema terminal_private from public, anon, authenticated, service_role;

-- Only trusted service RPCs call this helper with an identity verified by Auth.
create function terminal_private.authorize_actor(p_actor uuid) returns uuid
language plpgsql set search_path = '' as $$
declare v_business uuid;
begin
  if p_actor is null or not exists (
    select 1 from public.users u where u.id = p_actor and u.role in ('OWNER','MANAGER','EMPLOYEE') and u.active
  ) then raise exception 'TERMINAL_SALES_FORBIDDEN' using errcode = '42501'; end if;
  perform pg_catalog.set_config('request.jwt.claim.sub', p_actor::text, true);
  perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  v_business := public.current_business_id();
  if v_business is null or public.user_can('manageSales') is not true then
    raise exception 'TERMINAL_SALES_FORBIDDEN' using errcode = '42501';
  end if;
  return v_business;
end;
$$;

create function public.fn_terminal_context(p_actor uuid, p_location uuid, p_operation uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_business uuid; v_binding jsonb; v_attempt jsonb; v_open jsonb;
begin
  v_business := terminal_private.authorize_actor(p_actor);
  if p_operation is not null then
    select to_jsonb(a) into v_attempt from terminal_private.attempts a
    where a.operation_id = p_operation and a.business_id = v_business and a.location_id = p_location;
    return jsonb_build_object('attempt', v_attempt);
  end if;
  if not exists (select 1 from public.locations l where l.id = p_location and l.business_id = v_business and l.active) then
    raise exception 'TERMINAL_LOCATION_FORBIDDEN' using errcode = '42501';
  end if;
  select to_jsonb(b) into v_binding from terminal_private.bindings b where b.location_id = p_location and b.business_id = v_business and b.enabled;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at), '[]'::jsonb) into v_open
  from terminal_private.attempts a where a.business_id = v_business and a.location_id = p_location and a.state in ('processing','verifying');
  return jsonb_build_object('binding', v_binding, 'pending', v_open);
end;
$$;

create function public.fn_terminal_reserve(p_actor uuid, p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid; v_location uuid; v_sale uuid; v_operation uuid; v_employee uuid; v_customer uuid;
  v_binding terminal_private.bindings; v_attempt terminal_private.attempts;
  v_hash text; v_cart jsonb; v_items jsonb; v_priced_count integer; v_subtotal numeric;
  v_discount numeric; v_tax numeric; v_tax_rate numeric; v_minor numeric; v_quote jsonb;
  v_channel text; v_fulfillment text; v_notes text;
begin
  v_business := terminal_private.authorize_actor(p_actor);
  v_location := (p_request ->> 'location_id')::uuid;
  v_sale := (p_request ->> 'sale_id')::uuid;
  v_operation := (p_request ->> 'operation_id')::uuid;
  v_employee := (p_request ->> 'employee_id')::uuid;
  v_customer := (p_request ->> 'customer_id')::uuid;
  v_cart := p_request -> 'items';
  v_channel := p_request ->> 'channel';
  v_fulfillment := p_request ->> 'fulfillment_status';
  v_notes := p_request ->> 'notes';
  if v_sale is null or v_operation is null or v_location is null or v_channel is null or v_fulfillment is null
    or v_fulfillment not in ('Received','Preparing','Ready','Completed') or length(v_notes) > 1000
    or jsonb_typeof(v_cart) is distinct from 'array' then raise exception 'TERMINAL_INVALID_CART'; end if;
  if jsonb_array_length(v_cart) not between 1 and 50 then raise exception 'TERMINAL_INVALID_CART'; end if;
  v_hash := encode(sha256(convert_to(p_request::text, 'UTF8')), 'hex');

  -- Match the sale routine's lock and serialize requests sharing an operation ID.
  perform pg_advisory_xact_lock(hashtextextended(v_operation::text, 1));
  perform pg_advisory_xact_lock(hashtextextended(v_sale::text, 0));
  select * into v_attempt from terminal_private.attempts a where a.operation_id = v_operation;
  if found then
    if v_attempt.business_id is distinct from v_business or v_attempt.actor_id is distinct from p_actor or v_attempt.request_hash is distinct from v_hash then
      raise exception 'TERMINAL_OPERATION_CONFLICT' using errcode = '23505';
    end if;
    return jsonb_build_object('created', false, 'attempt', to_jsonb(v_attempt));
  end if;
  if exists (select 1 from public.sales s where s.id = v_sale)
    or exists (select 1 from terminal_private.attempts a where a.sale_id = v_sale) then
    raise exception 'TERMINAL_SALE_ALREADY_USED' using errcode = '23505';
  end if;
  select b.* into v_binding from terminal_private.bindings b
  join public.locations l on l.id = b.location_id and l.business_id = b.business_id and l.active
  where b.location_id = v_location and b.business_id = v_business and b.enabled for share of b;
  if not found then raise exception 'TERMINAL_BINDING_UNAVAILABLE'; end if;
  if not exists (select 1 from public.business_settings_lists s where s.business_id = v_business and s.list_type = 'channel' and s.value = v_channel and s.active)
    or (v_employee is not null and not exists (select 1 from public.employees e where e.id = v_employee and e.business_id = v_business and e.active))
    or (v_customer is not null and not exists (select 1 from public.customers c where c.id = v_customer and c.business_id = v_business and c.active)) then
    raise exception 'TERMINAL_CART_SCOPE' using errcode = '42501';
  end if;
  select case when b.tax_enabled then b.tax_rate else 0 end into v_tax_rate from public.businesses b
  where b.id = v_business and upper(b.currency) = 'USD' and b.platform_status = 'ACTIVE';
  if v_tax_rate is null or v_tax_rate not between 0 and 100 then raise exception 'TERMINAL_TAX_CONFIG'; end if;

  with cart as (
    select x.product_id, x.qty from jsonb_to_recordset(v_cart) as x(product_id uuid, qty numeric)
  )
  select jsonb_agg(jsonb_build_object('product_id', p.id, 'qty', c.qty, 'unit_price', p.price) order by p.id), count(*), sum(c.qty * p.price)
  into v_items, v_priced_count, v_subtotal
  from cart c join public.products p on p.id = c.product_id and p.business_id = v_business and p.active
  where c.qty between 0.001 and 9999 and c.qty = round(c.qty, 3) and p.price between 0 and 999999.99 and p.price = round(p.price, 2);
  if v_priced_count <> jsonb_array_length(v_cart) or (
    select count(distinct x ->> 'product_id') from jsonb_array_elements(v_items) x
  ) <> v_priced_count then raise exception 'TERMINAL_INVALID_CART'; end if;
  v_subtotal := round(v_subtotal, 2);
  v_discount := coalesce((p_request ->> 'discount_minor')::numeric, 0) / 100;
  if v_discount not between 0 and v_subtotal or v_discount <> round(v_discount, 2) then raise exception 'TERMINAL_INVALID_DISCOUNT'; end if;
  v_tax := round((v_subtotal - v_discount) * v_tax_rate / 100, 2);
  v_minor := round(v_subtotal - v_discount + v_tax, 2) * 100;
  if v_minor not between 50 and v_binding.max_amount_minor or v_minor is distinct from (p_request ->> 'expected_amount_minor')::numeric then
    raise exception 'TERMINAL_QUOTE_CHANGED';
  end if;

  -- An inventory change between this check and capture is handled by the sale transaction.
  if exists (
    select 1 from jsonb_to_recordset(v_items) c(product_id uuid, qty numeric)
    join public.product_recipes r on r.product_id = c.product_id
    left join public.inventory_items i on i.id = r.inventory_item_id
    left join public.inventory_stock s on s.inventory_item_id = r.inventory_item_id and s.location_id = v_location
    group by r.inventory_item_id, i.business_id, i.active, s.qty
    having i.business_id is distinct from v_business or i.active is distinct from true
      or bool_or(r.qty_per_unit is null or r.qty_per_unit <= 0 or r.qty_per_unit::text in ('NaN','Infinity','-Infinity')
        or c.qty * r.qty_per_unit <> round(c.qty * r.qty_per_unit, 3))
      or s.qty is null or s.qty::text in ('NaN','Infinity','-Infinity') or s.qty < sum(c.qty * r.qty_per_unit)
  ) then raise exception 'TERMINAL_INSUFFICIENT_STOCK'; end if;

  v_quote := jsonb_build_object('items', v_items, 'discount', v_discount, 'tax', v_tax, 'channel', v_channel,
    'employee_id', v_employee, 'customer_id', v_customer, 'notes', v_notes, 'fulfillment_status', v_fulfillment);
  insert into terminal_private.attempts(operation_id,sale_id,business_id,location_id,actor_id,binding,request_hash,quote,amount_minor)
  values(v_operation,v_sale,v_business,v_location,p_actor,to_jsonb(v_binding),v_hash,v_quote,v_minor::integer)
  returning * into v_attempt;
  return jsonb_build_object('created', true, 'attempt', to_jsonb(v_attempt));
end;
$$;

create function public.fn_terminal_attempt(p_operation uuid) returns jsonb
language sql security definer set search_path = '' as $$
  select to_jsonb(a) from terminal_private.attempts a where a.operation_id = p_operation;
$$;

create function public.fn_terminal_claim(p_operation uuid, p_stage text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_attempt terminal_private.attempts;
begin
  select * into v_attempt from terminal_private.attempts a where a.operation_id = p_operation for update;
  if not found or v_attempt.state not in ('processing','verifying') or v_attempt.stripe_confirmed then return null; end if;
  if p_stage in ('create','process') and terminal_private.authorize_actor(v_attempt.actor_id) is distinct from v_attempt.business_id then
    raise exception 'TERMINAL_SALES_FORBIDDEN' using errcode = '42501';
  end if;
  if p_stage = 'create' and v_attempt.create_reserved_at is null and v_attempt.cancel_reserved_at is null then
    update terminal_private.attempts set create_reserved_at = clock_timestamp() where operation_id = p_operation returning * into v_attempt;
  elsif p_stage = 'process' and v_attempt.payment_intent_id is not null and v_attempt.stripe_status = 'requires_payment_method'
      and v_attempt.process_reserved_at is null and v_attempt.cancel_reserved_at is null then
    update terminal_private.attempts set process_reserved_at = clock_timestamp() where operation_id = p_operation returning * into v_attempt;
  elsif p_stage = 'cancel' and v_attempt.cancel_reserved_at is null then
    if v_attempt.create_reserved_at is not null and v_attempt.payment_intent_id is null then return null; end if;
    update terminal_private.attempts set cancel_reserved_at = clock_timestamp(),
      state = case when create_reserved_at is null then 'canceled' else 'verifying' end
    where operation_id = p_operation returning * into v_attempt;
  else return null;
  end if;
  return to_jsonb(v_attempt);
end;
$$;

create function public.fn_terminal_observe(p_operation uuid, p_snapshot jsonb, p_reader_idle boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_attempt terminal_private.attempts; v_intent jsonb; v_status text; v_state text; v_confirmed boolean;
begin
  select * into v_attempt from terminal_private.attempts a where a.operation_id = p_operation for update;
  if not found or v_attempt.create_reserved_at is null then raise exception 'TERMINAL_UNRESERVED_INTENT'; end if;
  v_intent := p_snapshot -> 'intent';
  if p_snapshot ->> 'accountId' is distinct from v_attempt.binding ->> 'stripe_account_id'
    or v_intent -> 'livemode' is distinct from 'false'::jsonb
    or coalesce(v_intent ->> 'id', '') !~ '^pi_[A-Za-z0-9]+$'
    or (v_attempt.payment_intent_id is not null and v_intent ->> 'id' is distinct from v_attempt.payment_intent_id)
    or v_intent -> 'amount' is distinct from to_jsonb(v_attempt.amount_minor) or v_intent ->> 'currency' is distinct from 'usd'
    or v_intent ->> 'capture_method' is distinct from 'automatic' or v_intent -> 'payment_method_types' is distinct from '["card_present"]'::jsonb
    or v_intent #>> '{metadata,business_id}' is distinct from v_attempt.business_id::text
    or v_intent #>> '{metadata,sale_id}' is distinct from v_attempt.sale_id::text
    or v_intent #>> '{metadata,operation_id}' is distinct from p_operation::text then raise exception 'TERMINAL_INTENT_SCOPE'; end if;
  if v_attempt.stripe_confirmed or v_attempt.state = 'canceled' then return to_jsonb(v_attempt); end if;
  v_status := v_intent ->> 'status';
  v_confirmed := v_status = 'succeeded' and v_intent -> 'amount_received' = to_jsonb(v_attempt.amount_minor);
  if v_status = 'succeeded' and v_confirmed is not true then raise exception 'TERMINAL_RECEIVED_AMOUNT'; end if;
  v_state := case when v_status = 'canceled' and v_intent -> 'amount_received' = '0'::jsonb then 'canceled'
    when v_status = 'requires_payment_method' and p_reader_idle is true and jsonb_typeof(v_intent -> 'last_payment_error') = 'object'
      and v_intent -> 'amount_received' = '0'::jsonb then 'declined'
    when v_attempt.state = 'declined' and v_confirmed is not true then 'declined'
    else 'verifying' end;
  update terminal_private.attempts set payment_intent_id = v_intent ->> 'id', stripe_status = v_status,
    state = v_state, stripe_confirmed = coalesce(v_confirmed, false) where operation_id = p_operation returning * into v_attempt;
  return to_jsonb(v_attempt);
end;
$$;

create function terminal_private.guard_sale() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_attempt terminal_private.attempts;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.id::text, 0));
    select * into v_attempt from terminal_private.attempts a where a.sale_id = new.id;
    if (v_attempt.operation_id is not null or lower(trim(new.payment_method)) = 'stripe terminal') and not exists (
      select 1 from terminal_private.sale_authorizations g where g.transaction_id = pg_current_xact_id_if_assigned()
      and g.operation_id = v_attempt.operation_id and v_attempt.business_id = new.business_id
      and v_attempt.location_id = new.location_id and v_attempt.actor_id = new.created_by
      and v_attempt.amount_minor = new.total * 100 and new.payment_method = 'Stripe Terminal'
    ) then raise exception 'TERMINAL_SALE_REQUIRES_VERIFIED_PAYMENT' using errcode = '42501'; end if;
  else
    select * into v_attempt from terminal_private.attempts a where a.sale_id = old.id;
    if tg_op = 'UPDATE' and lower(trim(new.payment_method)) = 'stripe terminal' and new.payment_method is distinct from old.payment_method then
      raise exception 'TERMINAL_SALE_REQUIRES_VERIFIED_PAYMENT' using errcode = '42501';
    end if;
    if v_attempt.state = 'approved' and (tg_op = 'DELETE' or new.status is distinct from old.status or new.total is distinct from old.total
        or new.subtotal is distinct from old.subtotal or new.discount is distinct from old.discount or new.tax is distinct from old.tax
        or new.payment_method is distinct from old.payment_method or new.business_id is distinct from old.business_id
        or new.location_id is distinct from old.location_id or new.id is distinct from old.id) then
      raise exception 'TERMINAL_REFUND_REQUIRED' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger terminal_guard_sale before insert or update or delete on public.sales
for each row execute function terminal_private.guard_sale();

create function public.fn_terminal_finalize(p_operation uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_attempt terminal_private.attempts; v_sale public.sales; v_business uuid;
begin
  select * into v_attempt from terminal_private.attempts a where a.operation_id = p_operation for update;
  if not found or v_attempt.stripe_confirmed is not true or v_attempt.stripe_status is distinct from 'succeeded' then
    raise exception 'TERMINAL_PAYMENT_NOT_CONFIRMED';
  end if;
  if v_attempt.committed_at is not null then return to_jsonb(v_attempt); end if;
  v_business := terminal_private.authorize_actor(v_attempt.actor_id);
  if v_business is distinct from v_attempt.business_id then raise exception 'TERMINAL_SALES_FORBIDDEN' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_attempt.sale_id::text, 0));
  if exists (select 1 from public.sales s where s.id = v_attempt.sale_id) then raise exception 'TERMINAL_SALE_ALREADY_USED'; end if;
  insert into terminal_private.sale_authorizations values(pg_current_xact_id(), p_operation);
  v_sale := public.fn_create_sale(v_attempt.sale_id, v_attempt.business_id, v_attempt.location_id,
    v_attempt.quote ->> 'channel', 'Stripe Terminal', (v_attempt.quote ->> 'employee_id')::uuid,
    (v_attempt.quote ->> 'customer_id')::uuid, (v_attempt.quote ->> 'discount')::numeric, (v_attempt.quote ->> 'tax')::numeric,
    v_attempt.quote ->> 'notes', v_attempt.quote ->> 'fulfillment_status', v_attempt.quote -> 'items');
  if v_sale.id is distinct from v_attempt.sale_id or v_sale.total * 100 is distinct from v_attempt.amount_minor then
    raise exception 'TERMINAL_COMMIT_MISMATCH';
  end if;
  delete from terminal_private.sale_authorizations where transaction_id = pg_current_xact_id() and operation_id = p_operation;
  update terminal_private.attempts set state = 'approved', committed_at = clock_timestamp()
  where operation_id = p_operation returning * into v_attempt;
  return to_jsonb(v_attempt);
end;
$$;

create function public.fn_terminal_event(p_operation uuid, p_event text, p_record boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_account text;
begin
  select a.binding ->> 'stripe_account_id' into v_account from terminal_private.attempts a where a.operation_id = p_operation;
  if v_account is null or coalesce(p_event, '') !~ '^evt_[A-Za-z0-9]+$' then raise exception 'TERMINAL_EVENT_SCOPE'; end if;
  if p_record then
    insert into terminal_private.events(stripe_account_id,event_id,operation_id) values(v_account,p_event,p_operation)
    on conflict (stripe_account_id,event_id) do nothing;
  end if;
  return exists (select 1 from terminal_private.events e where e.stripe_account_id = v_account and e.event_id = p_event and e.operation_id = p_operation);
end;
$$;

revoke all on all functions in schema terminal_private from public, anon, authenticated, service_role;
revoke all on function public.fn_terminal_context(uuid,uuid,uuid), public.fn_terminal_reserve(uuid,jsonb),
  public.fn_terminal_attempt(uuid), public.fn_terminal_claim(uuid,text), public.fn_terminal_observe(uuid,jsonb,boolean),
  public.fn_terminal_finalize(uuid), public.fn_terminal_event(uuid,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.fn_terminal_context(uuid,uuid,uuid), public.fn_terminal_reserve(uuid,jsonb),
  public.fn_terminal_attempt(uuid), public.fn_terminal_claim(uuid,text), public.fn_terminal_observe(uuid,jsonb,boolean),
  public.fn_terminal_finalize(uuid), public.fn_terminal_event(uuid,text,boolean) to service_role;

commit;
