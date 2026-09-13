-- NEXALVO v1.2 — Supabase Data Phase 1
-- Run once in Supabase SQL Editor BEFORE deploying the v1.2 frontend.
begin;

-- The React CRM already supports archive/restore; persist that state in PostgreSQL.
alter table public.customers
  add column if not exists active boolean not null default true;

-- A tenant Owner / user with manageSettings may edit only their own business profile.
drop policy if exists businesses_update on public.businesses;
create policy businesses_update on public.businesses
for update
using (id = public.current_business_id() and public.user_can('manageSettings'))
with check (id = public.current_business_id() and public.user_can('manageSettings'));

-- Match the existing UI rule: a supplier with no historical references may be hard-deleted.
drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers
for delete
using (business_id = public.current_business_id() and public.user_can('manageSuppliers'));

commit;

-- Verification only
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='customers' and column_name='active';
