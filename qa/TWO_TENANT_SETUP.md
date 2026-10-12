# Two-tenant authenticated concurrency certification

**Status: implemented, not certified until executed with independent logins.**

Workflow job: `two-tenant-concurrency`.
File: `qa/concurrency-two-tenants.test.mjs`.
This test never targets production and performs authenticated writes only if `QA_TWO_TENANT_ENABLED=true` and every QA secret/fixture exists.

## Requirements (GitHub Environment: nexalvo-test)
Environment secrets: `QA_TWO_TENANT_A_EMAIL`, `QA_TWO_TENANT_A_PASSWORD`, `QA_TWO_TENANT_B_EMAIL`, `QA_TWO_TENANT_B_PASSWORD`. These must correspond to **two dedicated, already-authorized accounts** in the two fictitious TEST businesses. Do not commit credentials.

Environment variables:
- `QA_TWO_TENANT_A_BUSINESS_ID` and `QA_TWO_TENANT_B_BUSINESS_ID` (checked against the two specific TEST fixture companies)
- `QA_TWO_TENANT_A_LOCATION_ID`, `QA_TWO_TENANT_B_LOCATION_ID`
- `QA_TWO_TENANT_A_PRODUCT_ID`, `QA_TWO_TENANT_B_PRODUCT_ID` (active products; TEST fixture B currently requires creating one)
- `QA_TWO_TENANT_ENABLED=true` to opt in only after setup

Existing `QA_SUPABASE_URL` and `QA_SUPABASE_ANON_KEY` are reused.

Test sequence: log in both users independently; issue two simultaneous HTTP requests to create sales at $11.25 and $23.50; verify separate sale IDs, company IDs and amounts; verify both ledgers contain one exact entry each; verify neither company can read the other's sale/ledger; attempt compensating cancellation on both sales; archive TAP output.

**Evidence interpretation**: Positive HTTP request timing overlap proves concurrency at the network/request level, not necessarily overlap of PostgreSQL transaction execution. 100% transaction-overlap certification also requires independent database-session instrumentation, such as a TEST-only RPC returning backend PID and transaction timestamps. No such RPC has been installed by this workflow.

If TAP output shows `SKIP`, the test has **not passed**. The production project must remain off limits. The test uses existing fictitious TEST tenants and leaves cancelled QA audit history after compensating reversal.
