# NEXALVO QA automation — CI #124

Scope: branch `automation/nexalvo-qa-actions` and Supabase TEST `msinksoilkluooxenecy` only. Production, `main`, deployments, migrations, fixtures and persistent purchases were not changed or executed.

## Published units

- `189610f`: guarded employee B fixture apply/compensation plan. The SQL is manual, persistent and remains unexecuted.
- `45f67f2`: canonical read-only security catalog export. It remains unexecuted because this session has no approved catalog connection.
- `9600deadb3be8c1710753d61d41acb2127432226`: dependency audit regression gate.

## Verified results

Local validation for `9600dea` passed **78/78 static tests**, zero failures and zero skips. The Vite build passed with 1,578 transformed modules; the existing bundle-size warning remains. `npm audit --omit=dev --audit-level=moderate` reported zero runtime findings. The full audit reported the same seven build/development findings: five high and two moderate.

[GitHub Actions #124](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38761093906) ran the published SHA. `build-and-security` passed with 78 TAP tests and the new runtime/full-audit policy; `test-api-smoke` passed with 5 TAP tests. Therefore **83/83 TAP tests produced before the authenticated gate passed**, with zero failures and zero skips in those two producers.

The authenticated preflight returned `BLOCKED [FIXTURE_EMPLOYEE_B]`, as in CI #118 attempt 2 and CIs #121–#123. Eight downstream authenticated jobs were skipped by the gate. `qa-summary` failed closed with `INCOMPLETE - expected 10 TAP reports, found 2`. The overall workflow is not approved and the skipped jobs are not counted as passing.

## Dependency policy

The workflow now fails if runtime dependencies have a moderate-or-higher advisory, if a new vulnerable package or advisory appears in the full audit, if any critical finding appears, or if the known ceiling of seven findings is exceeded. A clean future report also passes. This tracks the existing Tailwind 3 toolchain findings without claiming they are fixed. It does not use `npm audit fix --force` and does not change the lockfile.

## Remaining gates

1. The employee B fixture plan requires explicit authorization for one persistent TEST write before the preflight can continue through employee B, `sale_items` B, stock and purchase isolation.
2. The catalog export requires execution through an approved read-only Supabase TEST integration; the raw function-source output must be kept restricted and scanned for embedded secrets before sharing.
3. P0.03 migrations, rollback/concurrency proofs and feature enablement require separate TEST authorization.
4. Real recovery e-mail, MANAGER/EMPLOYEE accounts and persistent P0.05 purchases require the documented human/configuration gates. P0.05 remains disabled in standard CI.
