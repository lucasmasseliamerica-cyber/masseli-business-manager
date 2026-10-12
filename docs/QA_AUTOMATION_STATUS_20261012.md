# NEXALVO TEST automated QA — 2026-10-12

## CI evidence

- Workflow: NEXALVO TEST - QA, GitHub run #38: https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38290870164
- Branch: automation/nexalvo-qa-actions; commit 6ca8285491d648b1b33d43c4157baf0f68ceea35
- **Five jobs all succeeded**: build-and-security, test-api-smoke, authenticated-concurrency, two-tenant-concurrency, access-regression.
- Static security 3/3. API/anonymous/JWT 5/5. Authenticated sale idempotency 1/1. Two-company PostgreSQL concurrency 1/1. Access regression 38/38 (37 nested assertions and 1 parent assertion), 0 failures, 0 skips.
- **48 test-runner assertions succeeded** by TAP counts (3+5+1+1+38); note the access suite has 37 individual scenarios under its parent test. The 38 count includes its parent assertion.
- Two-tenant PostgreSQL overlap measured 2,984 milliseconds; request overlap also required. Both QA sales reversed.
- No production DB writes.

## Additional manual transaction-scoped SQL verification

- Previously 93 role/default/custom/RLS checks documented in `qa/QA_PERMISSION_AUDIT_20261012.md`.
- Additional 5 masked-field read checks passed: employee stock cost masking, employee pay rate masking, purchase unit cost masking, owner stock visibility, owner employee visibility.
- Employee privileged-operation probes were rejected for adjustment, transfer, purchasing, and user administration. Waste recording has a different default gate (`manageInventory`) and requires valid inventory input; an invalid item rejected at item lookup, not a role denial.
- All mutable manual probes inside transaction rollback.

## CI test suite `qa/access-regression.test.mjs`

- Real independently authenticated TEST owners A and B.
- Checks own fixtures visible, foreign-tenant products/sales/cashflow hidden.
- Exercises 6 secure read RPCs in both businesses.
- Rejects incorrect company sale and expense writes, negative quantity/discount, duplicate/empty items, invalid location/product/status, invalid adjustment/transfer/waste, invalid purchase orders, invalid user data.
- No successful mutation is attempted by this suite. Existing authenticated concurrency jobs conduct reversable fictitious writes.

## Not yet covered

- Full form interactions and visual regression in browser; customer edits, suppliers, employee shifts/breaks/tasks, inventory adjustments and transfers with successful UI operations.
- Dedicated manager/employee credential-based end-to-end HTTP tests, although role functions were checked in rollback via simulated JWT.
- Failed-network compensation, session expiry/refresh lifecycle, and broad supplier/expense reversal/purchase receipts.
- Warnings/dependencies across Vercel production: production intentionally untouched.

Automated suites execute on future pushes to branch automation/nexalvo-qa-actions or manual workflow dispatch. GitHub Actions artifacts retained 14 days. Do not claim 100% product QA coverage from the current success.
