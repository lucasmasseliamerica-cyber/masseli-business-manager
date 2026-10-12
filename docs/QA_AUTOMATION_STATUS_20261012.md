# NEXALVO v1.6.8 — Automation evidence, 2026-10-12

**Source of truth for current automated CI:** [GitHub Actions QA run #46](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38292313509), branch `automation/nexalvo-qa-actions`, commit `a45fe8bd179fcb38f30adcf7e7e1f77a09271bc5`.

**Result: 8/8 jobs successful, 72 TAP checks passed, 0 failed, 0 skipped.** This is not 72 unique business flows; Node TAP reports nested subtests and parent tests separately.

| Automated CI group | Checks | Passed | Skipped |
|---|---:|---:|---:|
| Build and static safety (including mirrored App.jsx) | 5 | 5 | 0 |
| Auth/API smoke, anonymous protection, invalid JWT | 5 | 5 | 0 |
| Real owner A/B access regression incl. products, sales, stock, purchases | 38 | 38 | 0 |
| Independent QA auth sessions, refresh rotation, logout | 7 | 7 | 0 |
| Concurrent idempotency: ten same-sale requests | 1 | 1 | 0 |
| Two tenants in independent PostgreSQL sessions | 1 | 1 | 0 |
| Replay after intentionally discarded application response + tax/discount | 3 | 3 | 0 |
| Playwright browser desktop/mobile login and navigation | 12 | 12 | 0 |
| **TOTAL** | **72** | **72** | **0** |

PostgreSQL transaction overlap observed at 3015 ms. Auth/browser tests run only against TEST Supabase project `msinksoilkluooxenecy`. The Playwright job sets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the **TEST** project, starts Vite locally and navigates the UI using the existing QA owner B credentials. Screenshots: GitHub run #46 artifact `nexalvo-browser-smoke` (artifact ID 11766832016, retained 14 days).

## Additional isolated SQL transaction checks executed interactively

All of these used the TEST project and `BEGIN ... ROLLBACK` so fixture modifications were not persisted:

- 9 stock/purchasing confirmations: adjust stock, transfer both balances, waste, manual receipt, create purchase draft, partial/full receipt, record supplier payment.
- 8 customer/task confirmations: create/edit/deactivate customer (including name, email, phone and notes); create/edit/complete/reopen/delete task.
- 6 cash register confirmations: open, add/drop cash, cash sale, link sale to register, reverse sale, close register with expected balance $107 and difference $0.
- 3 product/image URL confirmations: create with URL, update URL and price, deactivate.
- 4 employee timekeeping confirmations: clock in, start/end break and clock out.
- **30/30 checks passed**; their coverage is **not** equivalent to automated browser form/visual testing and they are **not** included in the 72 TAP total.

Earlier test batches included 93 permission/matrix assertions and 5 employee cost/salary masking checks, described separately in `qa/QA_PERMISSION_AUDIT_20261012.md`. Do not treat counts as percentage of product completeness.

## Priority register: status against 19 requested workstreams

P0:
1. OWNER/MANAGER/EMPLOYEE permissions: **partial** — real OWNER logins and simulated employee/manager SQL controls tested; real manager/employee authenticated browser flows still pending.
2. Sales/payment modes and register: **partial** — card, cash and refunds, discount/tax, register rollbacks tested; full UI/method permutations pending.
3. Inventory: **partial** — valid movements tested in rollback, invalid operations tested HTTP; full UI and costing/expiry pending.
4. Purchasing/suppliers: **partial** — draft, partial/full receipts and supplier payments tested in rollback; UI, reversals and edge cases pending.
5. Auth: **partial** — password login, refresh, logout and invalid JWT tested; invitation, recovery email, real expiry/revocation still pending.
6. Network recovery: **partial** — simulated lost *application* response after commit + idempotent replay tested; real transport cut, offline UI and ambiguous delivery pending.

P1:
7. Products and photos: **partial** — RPC image URL, price and deactivate; actual file upload, PDV display and UI edit pending.
8. Customers: **partial** — SQL create/edit/deactivate; actual UI edit, dedup and history pending.
9. Employees and timekeeping: **partial** — SQL clock in/break/out; UI flows and role workflows pending.
10. Tasks: **partial** — SQL create/edit/complete/reopen/delete; UI pending.
11. Expense/cashflow: **partial** — sales ledger and cash register checked; UI filters, reverse expense, all methods pending.
12. Reports: **pending comprehensive evidence** — navigation smoke only; financial arithmetic/COGS/export not certified.
13. Settings: **pending comprehensive evidence** — navigation and static compilation only.

P2:
14. Responsive UI: **partial** — real Chromium desktop/mobile login and navigation screenshots; visual review, modal clipping and accessibility pending.
15. Performance at volume: **pending** — no representative stress/capacity baseline.
16. Advanced concurrency: **partial** — sales and dual tenants proven; purchasing/stock mutation overlaps and location races pending.
17. Deploy and mirror consistency: **partial** — byte-identical frontend copies and build verified in QA; deploy/rollback approvals and environment segregation still pending.
18. Backup/restore/monitoring: **pending** — should use separate isolated restoration target and verified snapshots; do not risk live data.
19. Final UAT: **pending** — full profile journeys and human acceptance.

## Guardrails

Production Supabase `ebhlfghbdfqgrgmtzpti` and production Vercel deployment are strictly excluded. Never enable destructive load tests, password recovery email blasts, restore or delete data outside TEST without independent authorization and a restoration plan. The workflow automatically executes on future QA branch pushes or manual dispatch only.

**Conclusion:** The automated suites that exist are currently green. **100% product completion cannot be certified** until missing workflows and criteria above are validated.


## Continued execution (after run #46): GitHub Actions run #54

- [Execution #54](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38299455362), branch commit `5c014c03dba47e9dafc4a0fa152b83c3d9607b57`.
- **9/9 jobs successful; browser-smoke 22/22 TAP checks, 0 failures, 0 skips**. This includes all 12 operational sidebar sections, authenticated desktop/mobile access, accessible product Save button with scrolling, customer Create Customer disabled for empty name, and screenshots.
- New TEST-only performance-read job validated 25 read requests in five batches, max 5 simultaneous: p95 211 ms, mean 105 ms on its first measured run (#51). This is a small baseline, **not** a production-scale benchmark.
- Regression test improvements in browser included explicit X-button close of product and customer modals (Escape is not an app-supported close shortcut), plus asynchronous mobile profile wait. Previous failed runs #47/#52 were test harness problems and have been resolved and re-run successfully.
- Additional isolated SQL role tests on TEST: 5 real-role employee checks and 6 transaction-scoped manager checks passed.
- Backup/export access TEST probes: own company OWNER permitted; employee and foreign-company OWNER denied. **Full restore was NOT attempted.**
- Current validation remains partial on all 19 product workstreams; only tested cases are certified. UI form complete write/save flows, real MANAGER/EMPLOYEE logins, production-scale load, actual restore to isolated database, and final user acceptance remain outstanding.
- Production Supabase project `ebhlfghbdfqgrgmtzpti` remained untouched.

