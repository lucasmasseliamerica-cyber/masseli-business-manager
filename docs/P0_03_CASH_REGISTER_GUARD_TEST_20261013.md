# P0.03 — Cash register server guard (TEST only)

Date: 2026-10-13
Target: Supabase TEST `msinksoilkluooxenecy` only; production `ebhlfghbdfqgrgmtzpti` not accessed or changed.
Source control branch: `automation/nexalvo-qa-actions`.

## Root cause and correction

Prior `public.fn_create_sale` selected an optional open `cash_registers` row for `Cash` and inserted a `cash_flow` ledger row with a potentially NULL `related_cash_register_id`. Client-side validation alone was insufficient.

Applied an authorized TEST migration `qa_cash_register_required_for_cash_sales_20261013` (migration tool response: `success:true`). The existing row-locking lookup now raises `cash register is closed for this location` if no open register is found. `CREATE OR REPLACE FUNCTION` retained existing authorization `user_can('manageSales')`, tenant check `current_business_id()`, UUID idempotency advisory transaction lock, and `SELECT ... FOR UPDATE` cash-register lock. Existing SQL routine is atomic: an exception rolls back attempted sale, cash-flow and inventory writes.

Migration source: `migrations/20261013_cash_register_required_for_cash_sales_TEST.sql`, commit `55f7577b6b592608ecbcdb2bc81aa19eec84da9a`.
Function fingerprint after migration: `aabbddc8a9c4a37a171b8a269e9c3139` (MD5 of `pg_get_functiondef`).

## Observed SQL verification (all against TEST)

- **PASS:** cash guard exists and cash register lookup uses `FOR UPDATE`.
- **PASS:** `anon` has no EXECUTE on `fn_create_sale`; `authenticated` retains EXECUTE; original `SECURITY DEFINER` setting preserved.
- **PASS:** transaction-scoped JWT subject simulation as TEST OWNER B, with all SQL changes rolled back: Cash sale rejected without open register; no sale, cash ledger, or stock movements persisted.
- **PASS:** TEST OWNER B transaction (rollback): open cash register, accept valid Cash sale, link exactly one $23.50 income row to register, repeat same sale UUID with no duplicate ledger, close register with expected cash $23.50, reject *new* cash sale after closure, allow Zelle sale without an open register and without a register link.
- **PASS:** TEST OWNER A transaction (rollback) on recipe-backed product: closed register rejects Cash while preserving inventory balance and no sale/inventory/cash ledger rows; open register allows one $10.00 sale and one unit stock deduction; after closing, replay of same sale UUID does not duplicate cash ledger or stock deduction; cross-tenant sale attempt raises `business_id mismatch`.
- **PASS:** post-rollback read-only check: 20 registers total, 0 open, 0 retained QA register fixtures, 0 retained QA sales, ingredient stock still 15.000. Six pre-existing cash-ledger rows without a register link remain unchanged; all six are on previously cancelled sales.

**Scope:** These are direct SQL/transaction tests using transaction-local JWT claim simulation. They are not independent HTTP bearer-token tests and do not prove real UI flow or concurrency races across separate database sessions. No permanent data was altered by these tests.

## Outstanding P0.03 release gates

1. Add authorized permanent API regression with a real TEST owner JWT; assert cash rejection and no side effects; ensure the test is in CI.
2. Add Playwright closed-register validation. The previous GitHub edit attempting this particular test was blocked by safety checks; do not bypass that restriction.
3. Test actual simultaneous cash sale/closing transactions in separate TEST sessions.
4. Validate normal positive checkout in UI and real owner/manager/employee permissions as fixtures become available.
5. Re-run the current full GitHub QA workflow on the new TEST schema with zero failures and zero skips. Last *previously* confirmed complete workflow was [#80](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38393907159): 10/10 jobs, 179/179 assertions before this DB migration.
6. Review function-security advisories separately; no global `SECURITY DEFINER` or privilege changes were made.

**NOT FULLY HOMOLOGATED.** Production unchanged. Purchase-idempotency migration is still disabled/uninstalled.


## Additional rollback regression — cash method normalization and payment routing

Transaction-scoped TEST OWNER B SQL checks passed (all rolled back):
- `Cash`, `cash` and ` CASH ` were rejected with the explicit closed-register error and left no sale or income ledger.
- `Credit Card`, `Debit Card`, `Zelle` and `Other` followed their existing sale RPC database paths without requiring a physical cash drawer and each created exactly one expected income row during the rolled-back test. **This is not terminal/payment-provider authorization verification.**

Post-test read-only state: 0 open / 20 total registers, 0 QA residual sales/registers, recipe ingredient stock 15.000 unchanged. Purchase-idempotency table and RPC still absent from TEST.

Security advisor recheck: 1 informational `rls_enabled_no_policy`, 41 warnings for authenticated-callable `SECURITY DEFINER` functions, and 1 warning for leaked-password protection; treat these as separate platform security review items, not evidence that the register guard failed. Advisory references:
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Note: No new GitHub Actions run was triggered by the migration/doc commits because the workflow path filter does not include `migrations/**` or `docs/**`. Do not claim CI #80 validates the changed TEST database.


## Separate-session close-versus-sale attempt (not accepted)

A dedicated TEST OWNER B register was opened with zero opening cash as fixture `1499f777-cf0b-4704-a8f2-19bebd0371df` (note `QA_CONCURRENT_CASH_GUARD_20261013`). Two independent Supabase connector SQL requests were dispatched concurrently: one closed the register while holding its row lock for four seconds, the other tried to sell for Cash and measured how long it waited.

- **PASS:** the closing transaction committed a register state of `closed` with expected cash `0.00`.
- **INCONCLUSIVE:** the sale-side test did not observe the required >=1-second lock contention; its deliberate contention assertion failed. It is *not* acceptable as proof of simultaneous close/sale serialization.
- **PASS (post-check):** no sales or cash-flow entries were left by the attempted race and zero registers remained open.
- One ordinary **closed QA register and its audit trail remain** in TEST intentionally; no destructive cleanup performed. Earlier 20-register read-only baseline therefore became 21.

This is not a production modification. A deterministic separate-connection concurrency harness with synchronization barriers remains an open P0 requirement. Do not retry by weakening the minimum contention assertion just to obtain a green result.

## Source control finalization

The migration file was completed with a SQL statement terminator in QA branch commit `dc3266667c00fba753b949f0575e7807b71c88ca`. It is a TEST-only source snapshot; do not include this in production deployment without separate approval.

**Release status: P0.03 server guard implemented and validated with reversible SQL transactions, but HTTP authenticated regression, browser test, deterministic concurrency and post-migration full CI remain outstanding.**
