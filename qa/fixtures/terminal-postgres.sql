-- Synthetic fixture for the Stripe Terminal PostgreSQL regression.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid
$$;
create table public.businesses (id uuid primary key, currency text not null, tax_enabled boolean not null,
  tax_rate numeric not null, platform_status text not null, allow_negative_inventory boolean not null default false);
create table public.users (id uuid primary key, business_id uuid references public.businesses, role text, name text,
  active boolean not null, permission_overrides jsonb not null default '{}');
create table public.role_default_permissions (role text, permission_key text, granted boolean, primary key(role,permission_key));
create table public.locations (id uuid primary key, business_id uuid references public.businesses, active boolean not null);
create table public.employees (id uuid primary key, business_id uuid references public.businesses, active boolean not null);
create table public.customers (id uuid primary key, business_id uuid references public.businesses, active boolean not null);
create table public.business_settings_lists (business_id uuid references public.businesses, list_type text, value text, active boolean);
create table public.products (id uuid primary key, business_id uuid references public.businesses, name text, price numeric, active boolean);
create table public.inventory_items (id uuid primary key, business_id uuid references public.businesses, unit text, active boolean);
create table public.product_recipes (product_id uuid references public.products, inventory_item_id uuid references public.inventory_items,
  qty_per_unit numeric, primary key(product_id,inventory_item_id));
create table public.inventory_stock (id uuid primary key default gen_random_uuid(), inventory_item_id uuid references public.inventory_items,
  location_id uuid references public.locations, qty numeric(14,3), avg_cost_per_unit numeric(14,4), last_purchase_cost numeric,
  last_purchase_date timestamptz, updated_at timestamptz default now(), unique(inventory_item_id,location_id));
create table public.business_counters (business_id uuid references public.businesses, counter_name text, next_value integer default 1,
  primary key(business_id,counter_name));
create table public.sales (id uuid primary key, business_id uuid references public.businesses, order_no integer, location_id uuid references public.locations,
  channel text, payment_method text, employee_id uuid, customer_id uuid, subtotal numeric, discount numeric, tax numeric, total numeric,
  fulfillment_status text, notes text, created_by uuid, status text default 'completed', cancelled_at timestamptz, cancelled_by uuid);
create table public.sale_items (id uuid primary key default gen_random_uuid(), sale_id uuid references public.sales, product_id uuid,
  product_name_snapshot text, qty numeric, unit_price numeric, unit_cost_snapshot numeric);
create table public.inventory_transactions (id uuid primary key default gen_random_uuid(), business_id uuid, inventory_item_id uuid,
  location_id uuid, type text, qty_change numeric, unit text, unit_cost numeric, total_cost numeric, sale_id uuid, purchase_order_id uuid,
  related_transaction_id uuid, prev_avg_cost numeric, new_avg_cost numeric, note text, created_by uuid);
create table public.cash_registers (id uuid primary key default gen_random_uuid(), business_id uuid, location_id uuid, status text,
  opened_at timestamptz default now(), opening_cash numeric);
create table public.cash_flow (id uuid primary key default gen_random_uuid(), business_id uuid, location_id uuid, type text, category text,
  amount numeric, payment_method text, description text, sale_id uuid, related_cash_register_id uuid, created_by uuid);
create table public.audit_logs (id uuid primary key default gen_random_uuid(), business_id uuid, user_id uuid, user_name_snapshot text,
  role_snapshot text, action text, details text, occurred_at timestamptz default now());
