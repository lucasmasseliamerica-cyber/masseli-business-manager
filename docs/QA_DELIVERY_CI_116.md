# QA delivery — CI #116

## Published source and verified execution

Code commit: [`83bac13b201916a8504e44b827e369be437da3ce`](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/commit/83bac13b201916a8504e44b827e369be437da3ce), branch `automation/nexalvo-qa-actions`.

Push triggered [GitHub Actions #116](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38674528976), on that exact source SHA. Final public run page: **Success**, duration 1m48s, ten artifacts. Each of the ten job entries has an explicit completed-successfully indicator:

| Job | Conclusion |
|---|---|
| build-and-security | Success |
| test-api-smoke | Success |
| authenticated-concurrency | Success |
| access-regression | Success |
| auth-lifecycle | Success |
| replay-financial | Success |
| network-after-commit | Success |
| browser-smoke | Success |
| performance-read | Success |
| two-tenant-concurrency | Success |

The changed build job runs 37 local-confirmed static/core-auth/recovery/compensation/preflight-guard checks, rejects nonzero skips, builds the frontend and syntax-checks the opt-in purchase runner. The changed browser job runs the existing suite plus three new mocked recovery cases and rejects skips. Both jobs passed remotely. **Remote per-case TAP totals were not recounted:** REST API returned Forbidden, job pages require sign-in and unauthenticated step-log requests returned 404. Do not infer a new global TAP count from the previous 197-test baseline.

Current-instance evidence before publication: `/workspace/nexalvo-audit/continuation/publish-static.tap` records 37 tests, 37 pass, 0 fail/skip; the previous focused recovery browser run records 3/3 pass. Syntax checks and git diff --check passed. Build and behavior details remain in the incident report. The 16 staged source/document files were checked for env filenames, JWT/token/private-key patterns: zero findings. No `.env` or actual credentials included. This scan is a useful check, not a guarantee of arbitrary secret detection.

## Delivered changes

- Unknown business roles deny permission rather than inherit EMPLOYEE defaults/overrides.
- Session restoration uses the shared concurrent-refresh gate.
- Recovery errors preserve Supabase's standard message; real SMTP recovery remains unhomologated.
- Persistent purchase test's failed-path cleanup now asserts reversed payments and zero net ledger per payment; only guard regressions executed, not persistent P0.05.
- Unit/browser regression files wired into CI, with new preflight fail-closed guard tests.
- `qa/p0-preflight-readonly.TEST.mjs` and `qa/Invoke-QaPreflight.ps1`, with [secure configuration/synchronization procedure](./QA_SECURE_CREDENTIALS_PREFLIGHT.md).

## Preflight status and credential setup

The standalone preflight is prepared but **not enabled automatically in CI**. Local invocation returned exit 2 because QA A/B bindings are absent; it performed no network login or business writes. The four guard tests verify missing bindings, credential-bearing wrong URL, privileged key and mismatched JWT claims fail before network without printing binding values. Successful live preflight still requires secure configuration.

Existing CI authenticated jobs passed using GitHub environment bindings; that does not inject credentials into Linux or Windows interactive sessions. On Windows, synchronize through GitHub, preserve local changes and use the hidden-prompt launcher, not .env files or literal credential assignments. The reported online LAPTOP-NLHRV0BA is not connected to a Desktop Commander tool in this session; no remote notebook operation was performed. PowerShell runtime validation remains pending Windows execution.

Preflight verifies A/B identity, active OWNER/business, secure read permission, non-vacuous supplier/item/location fixture isolation and required stock, plus bidirectional purchase-read denial. It does not validate all mutating grants, replace MANAGER/EMPLOYEE testing, certify recovery or authorize persistent purchases. Login may create normal auth metadata/sessions; no purchase writes are made. Tokens remain in memory.

## Current gates

**Persistent P0.05 remains OFF**, excluded from default push CI. No standalone purchase lifecycle was run. Before any controlled run require real recovery/login acceptance, synchronized code, live preflight PASS, explicit isolated-run authorization, reviewed compensation and post-checks for stock restoration/net-zero finance. Audit/history rows remain intentionally.

The push invoked the already-configured existing TEST CI, whose authorized regression jobs include isolated TEST operations with compensating activity. This is distinct from executing the separately gated persistent purchase-browser journey. No production/main modification, deploy, secret changes, password reset or migration was performed.

The earlier incident/blocker reports contain historical statements that edits were uncommitted/unpushed; **this delivery supersedes those publication/CI statements**. Recovery, roles, full security-catalog inspection, dependencies and product acceptance gates remain open. Documentation-only follow-up commits do not change the source tested by #116 and do not trigger another workflow under current path filters.

## Independent GitHub connector log recount (2026-10-14)

A later independent review successfully fetched all 10 job log bodies from GitHub Actions #116 and counted their TAP summaries directly. **231/231 tests passed, 0 failed, 0 skipped across 10/10 successful jobs**: build-and-security 37; test-api-smoke 5; network-after-commit 6; auth-lifecycle 12; performance-read 3; access-regression 109; two-tenant-concurrency 1; authenticated-concurrency 1; browser-smoke 50; replay-financial 7. These are observed log totals for CI #116 at source SHA `83bac13b201916a8504e44b827e369be437da3ce`, superseding the earlier note that remote TAP totals could not be recounted. Persistent purchase E2E and live QA A/B standalone preflight were **not** exercised by this result. No write to production or TEST was performed during recount.
