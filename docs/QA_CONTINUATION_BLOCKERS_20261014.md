# NEXALVO QA — automated continuation and current blockers

Scope: `automation/nexalvo-qa-actions`, TEST `msinksoilkluooxenecy`; production and main unchanged. This report adds to the recovery/P0.05 incident report and permanent checklist; it does not replace historical evidence.

## Baseline rechecked

Remote QA remains `fc118770d0f409a8e74d621e71b31e2961fef74e`. Actions listing still starts with #115 (`38587584235`), scheduled dispatcher #114, then QA #113. No new CI acceptance for current uncommitted edits. Current checklist, handoff and recovery gates were reviewed before selecting tests. Local previous changes preserved.

Only VITE_SUPABASE_URL/key bindings are present; no QA OWNER A/B or independent manager/employee credentials. No Supabase catalog connector/export is available. Windows directory `C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED` is not mounted: `/mnt/c` absent, no remote-device tool available. Authorization to use that folder does not make the computer reachable from this Linux workspace.

## New gap addressed

The previously confirmed unknown-role and concurrent-refresh fixes had been archived/stashed before updating to current upstream; current source still used EMPLOYEE fallback for unrecognized roles and direct refresh outside the shared gate. Integrated the already-proven small corrections into both current frontend copies, preserving new upstream recovery/purchase functionality. Restored `qa/auth-core-regression.test.mjs` from the verified archive and added it to the current workflow. No new mock claim of business acceptance.

This is a specific integration/regression gap, not a repeat of already-green authenticated business journeys. The current combined suite now exercises interaction of restored authentication fixes with the new recovery diagnostics and purchase compensation guards.

## Executed evidence

| Check | Outcome | Evidence |
|---|---|---|
| Current static + auth-core + recovery + compensation tests | 33 executed, 33 pass, 0 fail/skip | `/workspace/nexalvo-audit/continuation/local.tap` |
| Build | Pass, chunk warning remains | `/workspace/nexalvo-audit/continuation/build.log` |
| Persistent purchase runner syntax | Pass | node --check qa/p0-purchase-browser-persistent.TEST.mjs |
| npm audit | Exit 1: 7 entries, 5 high / 2 moderate | `/workspace/nexalvo-audit/continuation/audit.json` |
| npm audit --omit=dev | Exit 0: 0 entries | `/workspace/nexalvo-audit/continuation/audit-runtime.json` |
| npm audit fix --dry-run | No dependency version updates offered; seven entries remain | `/workspace/nexalvo-audit/continuation/audit-fix-dry-run.json` |
| git diff --check | Pass | Current checkout |

The dry-run also proposed removal of the extraneous local Playwright symlink used by QA, not a vulnerability fix; no such removal/update was applied. Existing seven entries remain in Tailwind's development-tool chain (braces, chokidar, micromatch, fast-glob, postcss-selector-parser, postcss-nested, tailwindcss). Earlier alternatives/compatibility investigation remains valid; no --force, dependency override or lockfile change was made. Advisory counts are not independent verified exploits.

## Blocked steps and minimal prerequisites

- **P0.02 real recovery:** actual error cause still unknown. Field `message` omission fixed locally; need fresh real TEST attempt through a running, correctly configured frontend, followed by real login. Only sanitized HTTP status/code/message should enter evidence. No password reset or email was initiated here.
- **P0.05 real persistent lifecycle:** blocked until secure QA A bindings, real identity/fixture/isolation preflight, explicit isolated-run authorization and opt-in. Existing staged runner remains OFF. Immutable audit/history rows remain after compensation by design; stock and finance invariants must be verified on both success and failure. No persistent writes performed.
- **P0.01 independent roles and employees/sale_items grants:** anonymous tests cannot validate corrected authenticated privileges. Requires independent real TEST role accounts; not marked approved from mock/SQL history.
- **RLS/grants/definers:** complete catalog export remains absent. Counts provided by integration are not reviewed definitions. Existing read-only export query is available; no attempt to bypass grants or use admin key in frontend.
- **Windows runner:** mount/provide the isolated QA workspace through a supported execution environment, or configure this cloud machine with secure TEST bindings. No access to the local Windows computer was established.
- **CI:** current edits remain uncommitted/unpushed and are not covered by #115. No remote status was fabricated.

Only proven local subchecks are recorded as green; the application is not 100% homologated. No new product completion percentage is inferred. Credentials must be configured securely, never supplied in chat or versioned files. Remaining safe work in the current stated priorities depends on these external prerequisites; no ordinary-test confirmation was requested.

## Consolidated acceptance metrics and next executable gate

Rechecked after the complete execution request: local and remote QA HEAD both remain `fc118770d0f409a8e74d621e71b31e2961fef74e`. QA A/B email/password bindings and persistent opt-in remain absent. No ordinary tests were repeated because code/results have not changed since the 33-case acceptance above.

- **Current local suite acceptance: 33/33 = 100% of those executed cases**, zero fail/skip; not product completeness.
- **Complete macro homologation: 0/10 = 0% formally signed off**: M0 remains partial, M1–M9 open. This metric measures full macro acceptance, not the amount of software implemented; many subchecks are already approved.
- **Overall implementation/commercial readiness percentage: undetermined**, because remaining flows, role sessions, security-catalog review, recovery, persistent transactions, backup/restore and human UAT do not have complete evidence. Do not substitute the test pass rate or checkbox count for this metric.

No new commit or remote CI run. Latest observed QA run remains #115 on the unmodified remote HEAD; it does not certify local edits. Next automated activity is the isolated authenticated preflight (identity, fixture ownership and cross-tenant denial), after secure QA A/B bindings become available. Real recovery acceptance precedes persistent purchase execution. Persistent authorization/opt-in is a separate prerequisite and was not inferred from the broad request. Catalog-only security review can proceed independently as soon as the prepared TEST export is supplied.
