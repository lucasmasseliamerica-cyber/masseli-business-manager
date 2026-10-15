# NEXALVO QA — CI #126 attempt 2

Scope: branch `automation/nexalvo-qa-actions` and Supabase TEST `msinksoilkluooxenecy` only. Production, `main`, deployments, migrations and persistent purchase tests were not changed or executed.

## Trigger and fixture

The user reported that the dedicated active employee fixture was created and confirmed in TEST:

- employee `8bc7ab61-6c9e-4dd4-a19a-a504f57de002`;
- business B `3849b750-20f7-4929-8699-737a4e1983c8`;
- name `QA Preflight Employee B`;
- active `true`.

This is external execution evidence. No database write was performed by this cloud session. The prepared compensation remains available but was not executed.

## GitHub Actions evidence

[CI #126 attempt 2](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38762019506) executed functional commit `f436a760a0c4090abf5c47a7cbbf0d3003692cd3`. Documentation-only commit `0ef9c97` was the branch HEAD when the rerun was requested and does not change the workflow inputs.

The GitHub run page reports:

- authenticated preflight annotation: `PASS [OK] - read-only QA A/B checks completed`;
- QA aggregate annotation: **274/274 PASS; 0 FAIL; 0 SKIPPED**;
- all 12 jobs completed successfully: build/security, anonymous API smoke, authenticated preflight, authenticated concurrency, access regression, auth lifecycle, financial replay, network-after-commit, browser smoke, performance read, two-tenant concurrency and QA summary.

Because the preflight is sequential and fail-closed, PASS confirms both OWNER identities and active tenant bindings; product isolation; A supplier/item/location; secure stock; purchase A visibility with B denial; A/B `sale_items` facade/direct reads and cross-tenant denial; and A/B employee facade/direct reads and cross-tenant denial, including the new employee B fixture.

## Limits

This approval removes the OWNER A/B fixture/preflight blocker. It does not prove independent MANAGER/EMPLOYEE sessions, SMTP recovery/invitation, all deployed RLS/grants/function definitions, database migration safety or persistent P0.05 purchases. The seven tracked build/development advisories remain open; runtime dependencies remain at zero findings. Persistent purchase execution remains disabled.
