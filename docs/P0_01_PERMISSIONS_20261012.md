# P0.01 — Roles & authorization validation (TEST only)

Date: 2026-10-12
Target project: `msinksoilkluooxenecy` (TEST only).
Production project `ebhlfghbdfqgrgmtzpti` was not queried or mutated.

## Execution

All checks ran through SQL on the isolated TEST instance inside `BEGIN ... ROLLBACK`. JWT subject and (when needed) `SET LOCAL ROLE authenticated` were used to exercise PostgreSQL permission functions and RPC guards.

### Suite A: full default permission matrix
- 20 permission keys x four QA profiles = **80/80 passed**.
- Profiles: active OWNER, active EMPLOYEE, transaction-temporarily-activated MANAGER, inactive EMPLOYEE.
- A temporary manager activation was reverted by rollback.
- Every `user_can(permission)` result was compared against the explicit `role_default_permissions` table (OWNER expected all, inactive user expected none).
- Zero failures.

### Suite B: privilege overrides & prohibited RPC
- **8/8 passed**:
  - manager custom `viewFinancials:false` denied;
  - manager custom `manageUsers:true` allowed by authorization helper;
  - manager still denied OWNER-only business data export despite the custom override;
  - employee lacks `reverseSales`;
  - employee retains `manageSales`;
  - employee `fn_reverse_sale` RPC denied;
  - employee `fn_save_task` administration RPC denied;
  - inactive employee blocked from sales.
- Zero failures, rollback performed.

## Important limitations

**88 passed SQL checks do not prove end-to-end authenticated manager/employee sessions.** Role identities were simulated with transaction-scoped JWT claims; actual TEST accounts for MANAGER and EMPLOYEE still need independent password or invitation/login credentials in the GitHub `nexalvo-test` environment. Do not place passwords in repository source. Do not alter production or enable disabled accounts outside rollback.

Additional P0.01 completion work:
1. Connect dedicated TEST-only MANAGER and EMPLOYEE sessions, without changing owners or production accounts.
2. Verify real PostgREST/HTTP permission response, RLS row visibility, cross-tenant access and each protected RPC.
3. Execute Playwright login for both roles and verify navigation/buttons/operation restrictions.
4. Audit custom overrides/revocation after login and stale JWT refresh; collect audit logs.
5. Re-run all GitHub Actions QA suites with 0 skips and approve the role matrix.

Next phases: P0.02 session lifecycle invitations/password recovery/expiry; P0.03 checkout, payments and cash register; etc.

Existing last fully passing QA workflow before this permission test: GitHub run #54, 9/9 jobs green, 0 failures, 0 skipped:
https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38299455362


## Continuation: authenticated OWNER browser/API regressions — GitHub run #58

[Run #58](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38300920693) is **9/9 jobs successful**, zero failed/ignored tests.
- P0.02 Auth API: 9/9 TAP assertions, including explicit anonymous `GET /auth/v1/user` rejection and forged refresh token rejection, as well as 2 real TEST owner logins, session refresh, and refresh revocation after logout.
- P0.02 Playwright: browser smoke 25/25 TAP assertions, including tested end-to-end Settings → Log Out → login form, page reload does not resurrect session, and re-login. Real owner B credentials only.
- Added commits `3ed39a0` (browser) and `32cf83e` (auth).
- The existing 88 simulated-role SQL checks reported above remain valid and were run in reversible transactions.

**Still a blocker for certifying P0.01 at 100%:** independent password/secret-backed accounts for real TEST manager and employee roles are not configured in the CI environment. The profile rows already exist in TEST; manager profile is inactive. Do not permanently activate the manager without a coordinated controlled test setup. Do not treat simulated role JWT variables as real Supabase Auth credentials. Do not request passwords in chat; store them only as dedicated GitHub environment secrets once such test accounts are provisioned.

**P0.02 gaps:** invitation email/acceptance, account recovery email, real token expiry and revocation mid-session still need explicit isolated end-to-end coverage; tests above do not prove them.


## Continued P0 authorization: two live OWNER JWTs, HTTP cross-tenant checks

GitHub Actions [run #60](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38301655468), on isolated branch `automation/nexalvo-qa-actions`, added `qa/p0-isolation-matrix.test.mjs` and integrated it into the `access-regression` CI job.

- Test project only: `msinksoilkluooxenecy`. Production was not accessed.
- Access regression job: **65/65 TAP checks passed, 0 failed, 0 skipped**. Of these, 26 are newly added nested live HTTP assertions (two OWNER sessions x 13 cross-company checks). The count includes Node TAP parent test assertions.
- Verified RLS hiding across ten tables: customers, expenses, purchase_orders, suppliers, tasks, cash_registers, shifts, inventory_items, locations and users.
- Also confirmed `fn_read_employees_secure`, `fn_read_waste_transactions_secure` do not expose foreign tenant records; foreign `fn_export_business_data` is rejected.
- Additional **8/8** read-only/denied SQL checks performed in `BEGIN/ROLLBACK` for cross-company customers, purchase orders, products and backup export.
- These are OWNER credentials for two fictitious businesses, **not** real MANAGER/EMPLOYEE logins.

Pending P0 blockers: independently authenticated manager/employee credential-based positive/negative API and browser cases, invitations/recovery email, actual JWT expiry/revocation, and full production-ready transaction/backup recovery acceptance. Do not mark complete based on this result.


## P0 continued — cross-company privileged-write guards (run #63)

**GitHub Actions [run #63](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38302261805)**: all 9 jobs success. TAP totals: 134 passed, 0 failed, 0 skipped (including nested parent test counts).

Added `qa/p0-write-isolation.test.mjs` to the regular `access-regression` job. **16 new HTTP cases**: real OWNER A tries eight RPCs under B business context and OWNER B tries the equivalent operations under A. Tested: `fn_adjust_inventory_count`, `fn_transfer_inventory`, `fn_record_waste`, `fn_create_purchase_order`, `fn_create_expense`, `fn_open_cash_register`, `fn_save_product` and `fn_create_sale`. Each asserts an explicit `business_id mismatch` error, not just arbitrary HTTP 4xx. Intentionally invalid quantities/nonexistent QA fixture IDs ensure operations cannot succeed even if a scope guard unexpectedly regresses; **the test does not create successful business transactions**.

The access-regression job passed 82/82 TAP checks, 0 skipped. Existing 25 browser smoke and 9 auth lifecycle checks passed. CI branch exclusively points to TEST project `msinksoilkluooxenecy`.

Extra independent PostgreSQL TEST transaction checks: 5/5 negative validation cases passed with ROLLBACK — opening cash register negative; duplicate PO line; zero PO quantity; negative unit cost; receiving more than outstanding order quantity. No persisted fixture changes.

**P0 remains incomplete:** real MANAGER and EMPLOYEE credentials, invitation/recovery email and expiry, UI write flows, detailed stock and purchasing concurrency. Production unchanged.


## P0 operational-validation expansion — GitHub run #65

- Workflow: https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38302881553
- **9/9 jobs success, 152/152 TAP assertions passed, 0 failed, 0 skipped.**
- Added `qa/p0-validation-boundaries.test.mjs` to `access-regression`: **17 new negative-only authenticated HTTP cases** using OWNER A TEST fixtures.
- Purchase order: duplicate item, zero quantity, negative cost, empty list, discount exceeding total, invalid initial status, negative tax.
- Sales: discount greater than subtotal, empty channel, empty payment method, missing customer, negative tax.
- Inventory: negative physical count, same-location transfer, negative waste quantity.
- Cash register: negative opening balance.
- Expenses: negative amount.
- Each case asserts an expected application rejection **message**, not only HTTP 4xx; the suite has preflight checks that TEST supplier, stock item, product and closed register fixtures exist.
- Access regression job: **100/100 TAP assertions** including prior tenant RLS/read + privileged-write guards. This is a mix of nested assertions and parent tests.
- No successful business mutation is performed by the new suite; it uses only invalid/negative requests against the isolated TEST project.
- Existing browser, session, concurrency, financial replay, performance and static security jobs remained green.
- **Still unverified:** real MANAGER/EMPLOYEE token logins, invitations/password reset and real expiration, full UI write operations, performance at realistic production size, and restoration of an actual backup. Do not certify complete P0 on this evidence alone.


## P0.03 / P0.05 additional payment and reversal coverage — 2026-10-12

Automated QA branch change `dff1c54a6b83eac10bbeeedbc706559751bb7f29` updated `qa/replay-financial.test.mjs` (TEST B).
- A single idempotent sale is created, its lost application response is simulated, and the replay returns the existing sale.
- The sale is compensated with `fn_reverse_sale`; assert the sale is marked cancelled and has `cancelled_at`.
- Require exactly one original income ledger row and one offsetting Sale Cancellation expense ledger row, both $23, with zero net amount.
- Try a second cancellation: expect `sale already cancelled` error and no additional refund ledger row.
- **GitHub Actions [run #66](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38305160654), financial replay job: 5/5 TAP checks success, 0 failed, 0 skipped.**

Additional **8/8** isolated SQL checks via `BEGIN/ROLLBACK`, for QA tenant A:
- Create Draft PO.
- Reject supplier payment before any receipt.
- Partially receive item.
- Reject $5 payment against $4 due.
- Accept exactly $4 payment.
- Reject duplicate payment when due is $0.
- Verify one supplier payment record.
- Verify exactly one associated expense ledger entry.

**Limitation**: the supplier payment checks ran inside one transaction and are not yet part of GitHub Actions; real invoice UI, cash/card reversal and live network faults still need coverage. The automated card sale/reversal check is permanent CI.


## P0.02 / P0.03 replay and rejected authentication regression — run #68

GitHub [run #68](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38306237787): **9/9 jobs successful, 159/159 TAP checks passed (including TAP parent assertions), zero failures, zero skips**. Executed on TEST `msinksoilkluooxenecy` only.

New permanent tests:
- `qa/replay-financial.test.mjs`: reuse the same sale ID with a financially different retry payload; assert immutable committed sale total and only one income posting. After successful reversal, replay the original request: assert sale remains cancelled and only one refund and one sale ledger row exist. These are application replays, **not physical network interruptions**.
- `qa/auth-session-lifecycle.test.mjs`: real TEST owner B login with intentionally wrong password is rejected; malformed Bearer token cannot read protected sales; malformed token cannot call protected `fn_create_sale`. Reuses OWNER QA sessions only; manager/employee independent credentials remain missing.
- Auth-lifecycle 12/12 TAP checks and replay-financial 7/7; all prior suites still green.
- No production accounts, secrets, or databases were modified. New successful QA card-sale fixture is reversed at the end of the financial test, retaining an audit trail in TEST.

Remaining blockers: MANAGER and EMPLOYEE E2E login; invitation/password recovery delivery; real token expiration; complete UI sales, inventory and purchasing workflows; actual network outage; backup restore.


## P0.06 — Offline browser/reconnect regression (2026-10-12)

- [GitHub Actions run #70](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38319002252): **9/9 jobs success, 161/161 TAP checks passed, zero failures, zero skips** (including TAP parent assertions).
- Commit `a72c8de0b72f570ef4f33edfcc2b6798a9cf1204` added two permanent Playwright tests in `qa/browser-smoke.test.mjs`:
  1. With real TEST OWNER B logged in, temporarily set Playwright browser context to offline, navigate to Inventory, verify NEXALVO shell remains present and login form does not reappear.
  2. Reconnect context, reload browser page, verify TEST company dashboard and authenticated session are restored.
- Browser smoke: 27/27 TAP checks approved. Other jobs remain green.
- **Scope limitation:** this is a real browser network offline toggle, but **NOT** yet an interrupted in-flight sale/purchase write, timeout after commit, or automatic transaction retry validation. Do not mark P0.06 fully certified on this evidence alone.
- All execution against local TEST frontend and Supabase TEST project `msinksoilkluooxenecy`. Production unchanged.


## P0.06 — Actual post-commit HTTP interruption and reconciliation, CI run #72

- Workflow: https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38319660523
- New permanent isolated QA script: `qa/p0-network-after-commit.test.mjs`.
- New CI job: `network-after-commit`, uses TEST owner A secrets from `nexalvo-test` environment.
- Script starts a temporary local HTTP proxy that forwards exactly one authenticated `POST` to Supabase TEST `msinksoilkluooxenecy`, awaits actual upstream HTTP 200, and *destroys its response socket* before the client receives any successful response. Thus the application-side HTTP request fails even though the transaction committed.
- Sale: verifies transaction recovered by original client-generated UUID, safe idempotent retry and exactly one income ledger row.
- Purchase: verifies transaction uniquely reconciled by test-only distinctive notes marker, checks exactly one purchase item, and explicitly avoids a blind repeat `POST` (purchase creation RPC currently lacks a client-provided idempotency key).
- Cleanup: `fn_cancel_purchase_order` cancels QA Draft PO; `fn_reverse_sale` cancels QA card sale; asserts terminal statuses and exactly two compensating sale ledger rows.
- New job: **6/6 TAP checks passed, zero failures, zero skips**.
- Important scope distinction: this covers response loss **after confirmed upstream commit**. It does not establish safety if the server's commit status is unknown, and it does not make the purchase creation RPC itself idempotent. No in-flight browser UI interception for checkout has been proven. P0.06 remains partial.
- Production was not accessed or modified.


## P0.05 — Purchase idempotency staged but NOT deployed (2026-10-12)

**Current status: implementation staged behind OFF-by-default flag; database migration blocked; functional purchase-idempotency acceptance NOT executed.**

Inspection confirmed legacy `fn_create_purchase_order` has no caller-generated transaction UUID. Network-retry of a purchase may therefore create duplicate orders. Sales already use `p_sale_id` idempotency.

Prepared versioned SQL `migrations/20261012_purchase_order_idempotency_TEST.sql`, commit `1e6a2c1`:
- new locked request table `purchase_order_request_keys` keyed on (business_id,request_id);
- proposed `fn_create_purchase_order_idempotent` with active-user / tenant / `managePurchases` checks, canonical payload fingerprint, exact-replay return and rejection of changed payload;
- transaction-scoped atomic request key and purchase-order insert, with RLS and revoked client table privileges.
- Legacy creation RPC left unchanged for compatibility.

**IMPORTANT:** Attempt to deploy the migration to project TEST `msinksoilkluooxenecy` through the supported migration tool was **blocked by the tool's safety checks**. No workaround, SQL DDL or production deployment was performed. The new RPC is **not available or confirmed** on TEST. It requires a separate authorized migration review/deployment before any flag may be enabled.

Staged identical `src/App.jsx` and `App.jsx` code, commits `e7bbbee` and `b62b8f2`: form retains one UUID for repeat clicks while open, and `useSupabasePurchases.create` calls the proposed new RPC **only when** `VITE_PURCHASE_IDEMPOTENCY_ENABLED === "true"`. The default behavior stays on existing `fn_create_purchase_order`; **DO NOT set flag true until approved TEST schema deployment and live regression pass**.

New test `qa/security.test.mjs` asserts exact frontend copy sync, OFF-by-default gate and proposed SQL invariants. CI first intermediate run #73 failed as it caught temporarily unsynchronized App.jsx copies; subsequent synced-code [run #74](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38320589570) **10/10 jobs successful, 168/168 TAP passed, 0 failed, 0 skips**. These are tests of existing behavior and static staged implementation, NOT live verification of the undelivered idempotent purchase RPC.

Next: authorized TEST-only migration installation; inspect exposure/roles, real owner A + owner B strict isolation, repeat purchase UUID and changed-payload rejection, concurrent same UUID checks, fault injection post-commit response loss, non-duplicate purchase items and audit rows, safe cancellation and concurrency test. Only then consider enabling flag for QA and, separately, production after explicit release approval.
