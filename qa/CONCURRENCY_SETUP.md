# Authenticated concurrency QA (isolated TEST only)

Status: **implemented, not yet certified**. This is not a PASS until a GitHub Actions run shows the authenticated-concurrency test executed (not skipped) with all assertions passing.

## Safeguards
- Host allowlist: `msinksoilkluooxenecy.supabase.co` only. Production is never a test target.
- Runs with a normal, least-privilege QA login, never a service role key.
- Explicit opt-in: `QA_CONCURRENCY_ENABLED=true`.
- Dedicated test business must have a name starting with `NEXALVO_QA_` and must not be either of the existing fixture businesses.
- The test sends 10 independent HTTP requests concurrently using the same generated sale ID.
- It verifies exactly one sale, one item, and one associated financial entry.
- A compensating reversal is attempted in a `finally` block if a sale was created. Audit rows remain in TEST (they are not deleted). Do not run in an active business.

## Configure GitHub environment `nexalvo-test`
Environment variables (not secrets):
- `QA_CONCURRENCY_ENABLED` = `true` **only after** isolated fixture validation
- `QA_CONCURRENCY_BUSINESS_ID` = dedicated NEXALVO_QA_ business UUID
- `QA_CONCURRENCY_LOCATION_ID` = test location UUID within that business
- `QA_CONCURRENCY_PRODUCT_ID` = active QA product UUID without inventory recipe, to avoid affecting stock

Environment secrets:
- `QA_CONCURRENCY_EMAIL` = dedicated QA user's email (authorized to manage and reverse sales in the isolated business)
- `QA_CONCURRENCY_PASSWORD` = QA user's password; never commit it or paste it in logs

`QA_SUPABASE_URL` and `QA_SUPABASE_ANON_KEY` already serve the existing API suite.

## Certification criteria
1. Confirm job did not report SKIP.
2. Verify 10 concurrent POST operations all returned HTTP 200 with the same sale ID.
3. Verify exactly one sale, one item and one cash-flow record before cancellation.
4. Verify the compensating cancellation succeeds and there are no uncompensated side effects.
5. Repeat multiple times and inspect artifacts to rule out timing-dependent failures.
6. Independently test race conditions around last-unit inventory, double supplier payments and double reversals. Those are **not included** in the sale idempotency check yet.

If the new job is skipped, that indicates the dedicated QA credentials or fixtures are not enabled; do **not** interpret a green overall workflow as certification.
