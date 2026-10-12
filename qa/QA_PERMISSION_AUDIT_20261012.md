# NEXALVO TEST — permission audit (2026-10-12)

Scope: Supabase **TEST only** (`msinksoilkluooxenecy`). All mutation probes use `BEGIN ... ROLLBACK`; production was not contacted.

## Results

**93 checks passed, 0 observed failures.** Count includes:
- 80 matrix assertions: all 20 `role_default_permissions` keys for four fictitious QA identities (OWNER active; EMPLOYEE active; MANAGER inactive; EMPLOYEE inactive). Expected values checked against `public.user_can` with simulated JWT subject.
- 10 custom-permission assertions: inactive manager denied; temporary manager activation in rollback; manager default grants/denials; boolean permission overrides to allow/deny; invalid override data rejected by validation trigger; active employee default grants/denials and two overrides. Attempt to change own permissions was also rejected by the privilege escalation trigger (not counted in 10).
- 3 additional DB-authorized probes under `SET LOCAL ROLE authenticated`: employee cannot see cash flow (0 rows); employee cannot see foreign-tenant products; employee rejected by `fn_reverse_sale` on a non-existing QA sale ID.

The 20 permissions in current DB defaults include sales, inventory, expense, purchase, finance, reporting, cash register, users, settings, reversal permissions, and others.

## Important limits and follow-ups

These probes exercise database permission functions, role security and RLS behavior. They do **not** certify end-to-end UI behavior, full test coverage for all 20 permissions on every write RPC, session expiry, or role elevation for real authenticated manager logins. Manager/employee credential-based HTTP tests are still to be expanded with dedicated TEST accounts. Manager impersonation was transaction-scoped in this audit.

Previously: GitHub Actions #35 passed 10 tests (static, API, 10x sale idempotency, two-tenant concurrency), all 4 jobs successful, no skips. This document records a different test group, not 93 additional GitHub CI tests.

## Production safety

Do not use project `ebhlfghbdfqgrgmtzpti` or the production Vercel deployment for QA writes. Protect QA accounts; no passwords are stored here.

## Suggested next tests

1. Explicitly inspect every stock/purchasing/employee financial RPC permission gate, and test forbidden and allowed operations with QA identities.
2. Validate the employee and manager UI workflows for the existing TEST accounts.
3. Add recurring CI checks for permissions using dedicated authenticated TEST manager/employee credentials when those are available.
