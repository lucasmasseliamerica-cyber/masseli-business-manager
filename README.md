# NEXALVO v1.2 — Supabase Data Phase 1

This phase begins the real removal of `window.storage` from NEXALVO.

Now stored in Supabase/PostgreSQL with tenant RLS:
- business profile + settings lists
- locations
- suppliers
- customers
- employees

Still intentionally on the legacy storage layer until their RPC-backed migration phases:
- products/recipes and inventory
- sales, cash flow, expenses and purchases
- tasks, shifts, loyalty, alerts and audit log
- staff account administration (the signed-in user's real Supabase profile is already used for auth/role)

## Required order
1. Run `08_supabase_data_phase1.sql` once in Supabase SQL Editor.
2. Upload this frontend to GitHub.
3. Let Vercel deploy it with the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` variables.
4. Sign in and verify Settings > Business Name, Locations, Customers, Suppliers and Employees.

Do not put a service-role/secret key in this project.
