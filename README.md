# NEXALVO v1.5.3 — Phase 4 Cash Safety Hotfix

Fixes:
- Cash register can open with $0.00 without inserting a zero-value cash-flow row.
- Cash expenses require an open register.
- Cash expenses are linked to the active register so expected cash at closing includes them.

## Deploy order
1. Run `12_phase4_cash_safety_hotfix.sql` in Supabase SQL Editor.
2. Verify both functions show security_definer=true, authenticated_execute=true, anon_execute=false.
3. Upload the frontend files to GitHub and wait for Vercel Production.
4. Confirm `v1.5.3` appears in the NEXALVO header.
