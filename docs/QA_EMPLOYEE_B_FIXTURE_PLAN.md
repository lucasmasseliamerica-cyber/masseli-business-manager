# QA employee B fixture plan

This plan addressed `BLOCKED [FIXTURE_EMPLOYEE_B]` from CI #118 attempt 2 and CIs #121–#126. The user reported the exact fixture created and confirmed in TEST. CI #126 attempt 2 then passed the complete preflight and all downstream jobs. Do not rerun the apply script while the exact active fixture remains valid; retain the compensation procedure for an explicitly authorized cleanup window.

## Prepared artifacts

- `qa/sql/p0_01_employee_b_fixture_apply_TEST.sql`: persistent, idempotent fixture creation with exact TEST tenant/OWNER guards, audit entry, positive OWNER B facade/direct reads and negative OWNER A cross-tenant reads.
- `qa/sql/p0_01_employee_b_fixture_compensate_TEST.sql`: exact-ID/tag compensation without `CASCADE` or a broad delete, followed by a removal audit entry and absence check.

Both scripts are manual and intentionally absent from GitHub Actions. They contain no passwords, tokens or private keys.

## Authorized execution sequence

1. In the Supabase dashboard, independently confirm the selected project reference is exactly `msinksoilkluooxenecy`. SQL cannot prove the external project reference by itself.
2. Obtain explicit authorization for this single persistent TEST fixture and its audit records.
3. Review that the fixed employee UUID is unused and that business/OWNER guard identities still match the dedicated QA tenant B.
4. Run the apply script as one transaction. Any failed guard, RLS/grant check or audit insert rolls it back.
5. Rerun the existing QA workflow once. Do not enable P0.05 persistent purchases.
6. Retain the fixture while it supports repeatable read-only CI. If removal is required, first confirm no test/business record references it, then run only the compensation script. A foreign-key failure must be investigated; never add `CASCADE`.

The apply script is a database write. The user reported that it was explicitly authorized and the exact fixture was created in TEST; CI #126 attempt 2 confirmed the expected visibility and isolation. The fixture is not a MANAGER/EMPLOYEE login account and does not replace the independent real-role tests still required by the main checklist.
