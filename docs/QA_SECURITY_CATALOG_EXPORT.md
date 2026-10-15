# Supabase TEST security catalog export

`qa/sql/security_catalog_export_readonly_TEST.sql` is the canonical read-only export for the deployed security review. It is versioned so the 31 tables, 53 policies, 50 functions and effective grants can be inspected from one reproducible artifact when the approved Supabase integration is available.

The query starts `BEGIN TRANSACTION READ ONLY`, sets a statement timeout and ends with `ROLLBACK`. It reads PostgreSQL catalogs only. It does not query business rows, call application RPCs or mutate the database. The external integration operator must independently confirm project reference `msinksoilkluooxenecy`; database SQL cannot prove which Supabase project endpoint selected it.

The output contains complete public function source. Before saving or committing an export:

1. Store the raw result in a restricted QA artifact location.
2. Scan function definitions for embedded credentials or private endpoints without printing matches into public logs.
3. If a secret is found, rotate it through the approved secret manager and redact the artifact before sharing.
4. Record catalog visibility limitations if the integration role cannot see an ACL, definition or owner.
5. Compare observed counts to the known baseline, then review every policy/grant/function rather than treating counts or linter alerts as vulnerabilities.

The query remains unexecuted in this cloud session because no approved catalog connection or Supabase connector is available here. No database credential is required in Git or chat.

The canonical export and four static regression checks were published in `45f67f2`; [CI #123](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38760647609) passed those checks before the authenticated preflight encountered the independent employee B fixture blocker. This proves the export guardrails, not the deployed catalog contents.
