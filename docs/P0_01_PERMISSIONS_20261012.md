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
