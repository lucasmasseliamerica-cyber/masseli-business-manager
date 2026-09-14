# NEXALVO v1.5.1 — Phase 4 Hotfix

Fixes Cash Register modal wiring so Open / Movement / Close use the Supabase RPC operations instead of the guarded legacy persistence path.

# NEXALVO v1.5 — Supabase Data Phase 4

Phase 4 makes Purchases, Expenses, Cash Flow and Cash Register server-authoritative.

## What changed
- Purchase Orders load from Supabase (`purchase_orders`, `purchase_order_items`, `purchase_order_payments`).
- New PO uses `fn_create_purchase_order`.
- Receiving uses `fn_receive_purchase_order` and updates inventory/weighted cost atomically.
- Supplier payments use `fn_pay_purchase_order` and write Cash Flow atomically.
- Payment reversal and whole purchase reversal use their RPCs.
- Safe unreceived PO cancellation uses new `fn_cancel_purchase_order`.
- Expenses use `fn_create_expense` / `fn_reverse_expense` and Cash Flow is refreshed from Supabase.
- Cash Register opens, records movements and closes using server RPCs.
- Build marker: `v1.5`.

## Deploy order
1. Run `11_supabase_data_phase4.sql` in Supabase SQL Editor.
2. Verify the returned function permissions: `security_definer=true`, `authenticated_execute=true`, `anon_execute=false`.
3. Upload the project files to GitHub and let Vercel deploy.
4. Hard refresh and confirm the visible `v1.5` marker.

## Validation sequence
Use test data only:
1. Create a Draft/Ordered PO for an existing inventory item and location.
2. Confirm rows in `purchase_orders` + `purchase_order_items`.
3. Receive part/all of the PO; confirm `PURCHASE` in `inventory_transactions`, increased `inventory_stock`, and weighted average cost.
4. Record supplier payment; confirm `purchase_order_payments` + `cash_flow`.
5. Create an expense; confirm `expenses` + `cash_flow`.
6. Open a cash register, record an addition/withdrawal, then close; confirm `cash_registers` + `cash_flow`.
