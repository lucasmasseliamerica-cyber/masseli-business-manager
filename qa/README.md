# NEXALVO TEST QA

This branch is an isolated CI starter. No deployment, no production credentials, no write-capable API tests.

## GitHub configuration
Create an environment named `nexalvo-test` in Settings > Environments.
Set environment variable `QA_SUPABASE_URL` to `https://msinksoilkluooxenecy.supabase.co`.
Set environment secret `QA_SUPABASE_ANON_KEY` to the TEST project's publishable/anon key only.
Never set a service_role key or PROD credentials here.

## Execution
Actions > NEXALVO TEST - QA > Run workflow. Runs daily at 10:20 UTC and on pushes to this QA branch.
Build and static security assertions run without credentials. API smoke verifies the exact TEST project hostname before any request.
Concurrency, authenticated role checks and full regressions are **not implemented yet**; add isolated fixtures, QA users, and cleanup safeguards before enabling write tests.
Do not merge to main or add production deployments without review.
