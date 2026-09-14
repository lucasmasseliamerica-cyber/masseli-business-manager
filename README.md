# NEXALVO v1.3 — Supabase Data Phase 2

Phase 2 moves the Products and Inventory screens to tenant-scoped Supabase data. Inventory quantity is ledger-derived and stock changes use RPCs. The legacy POS/Purchases transaction shadow intentionally remains local until the next atomic RPC cutover.

## Deploy order
1. Run `09_supabase_data_phase2.sql` in Supabase SQL Editor.
2. Deploy the frontend files.
3. Test Product creation + recipe, Inventory initial stock, Receive, Adjust, Waste, and browser refresh.
