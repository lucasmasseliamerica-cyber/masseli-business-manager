# NEXALVO v1.4.1 — Phase 3 sale persistence hotfix

This build adds a hard fail-safe so authenticated tenant sales can never silently fall back to the legacy/local sale path. It also surfaces Supabase RPC errors in the checkout UI and shows a visible `v1.4.1` build marker beside the NEXALVO brand.

# NEXALVO v1.3 — Supabase Data Phase 2

Phase 2 moves the Products and Inventory screens to tenant-scoped Supabase data. Inventory quantity is ledger-derived and stock changes use RPCs. The legacy POS/Purchases transaction shadow intentionally remains local until the next atomic RPC cutover.

## Deploy order
1. Run `09_supabase_data_phase2.sql` in Supabase SQL Editor.
2. Deploy the frontend files.
3. Test Product creation + recipe, Inventory initial stock, Receive, Adjust, Waste, and browser refresh.

## v1.4 — Supabase Data Phase 3
Sales/Orders now use Supabase for production sale creation. Successful payments call `fn_create_sale`, which atomically creates the sale, sale items, recipe-based inventory deductions, cash flow, and audit log. Orders load from Supabase. Fulfillment advancement uses `fn_advance_sale_fulfillment`; cancellation uses the existing `fn_reverse_sale` RPC.
