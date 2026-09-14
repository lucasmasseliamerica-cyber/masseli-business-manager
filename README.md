# NEXALVO v1.5.4 — Phase 4 Cash Register Live Balance Fix

Fixes live Cash Register balance display by mapping `cash_flow.location_id` into the frontend model.
Adds backend protection so a Cash expense cannot make the physical drawer negative.

Run `13_phase4_cash_live_balance_hotfix.sql` in Supabase before deploying the frontend.
