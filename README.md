# NEXALVO v1.5.5 — Phase 4 Cash Register Ledger Display Fix

Frontend-only hotfix.

## Fix
The Cash Register live balance now uses `related_cash_register_id` as the authoritative link for Supabase cash-register movements, matching the exact rule used by `fn_close_cash_register` in PostgreSQL.

This fixes the case where a successful Cash Addition existed in `cash_flow` but the modal still displayed Cash Additions = $0.00 and Expected Cash = $0.00.

Legacy rows without a register FK keep the previous location/time fallback.

## Deploy
No SQL is required. Upload the project files to GitHub and deploy through Vercel.
