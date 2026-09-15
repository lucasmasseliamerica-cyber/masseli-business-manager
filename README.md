# NEXALVO v1.6 — Supabase Data Phase 5A: Loyalty + Customers

Baseline: validated v1.5.5.

## What changed
- `loyalty_transactions` is loaded from Supabase and is the authoritative points ledger.
- Existing earn/redeem flow now calls `fn_commit_loyalty_for_sale`.
- Sale cancellation loyalty reversal now calls `fn_reverse_loyalty_for_sale`.
- Manual add/remove now calls `fn_manual_loyalty_adjustment`.
- `loyalty_rewards` is loaded from Supabase.
- SQL ensures each existing business has at least one default `$10 Off / 100 points` reward.
- Customers remain on the already-migrated tenant-scoped Supabase collection.

## Deploy order
1. Run `14_supabase_data_phase5_loyalty.sql` in Supabase SQL Editor.
2. Verify the three rows show `security_definer=true`, `authenticated_execute=true`, `anon_execute=false`.
3. Upload this project to GitHub and deploy through Vercel.
4. Confirm the UI build badge says `v1.6`.

## Test order
1. Open a customer and manually add 20 points; verify `loyalty_transactions`.
2. Create one sale assigned to that customer; verify exactly one `earn` row.
3. Refresh and verify the customer balance persists.
4. Later, when balance reaches 100+, test `$10 Off` redemption.
5. Cancel a loyalty-earning test sale and verify one `reversal` row only.
