# QA A/B credentials and read-only preflight

Only branch `automation/nexalvo-qa-actions` and TEST `msinksoilkluooxenecy`. No production credentials, administrative keys, password resets, migrations or persistent purchases. Preflight PASS is not authorization to run purchases.

## Synchronize Windows through GitHub

On LAPTOP-NLHRV0BA, in `C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED`, first run `git status --short` and preserve any local modifications. Never reset/clean them. Confirm the origin identifies this repository without displaying credential-bearing URLs. With a clean checkout:

```powershell
git switch automation/nexalvo-qa-actions
git pull --ff-only origin automation/nexalvo-qa-actions
git rev-parse HEAD
```

Confirm the current code commit recorded in [the 2026-10-15 delivery](./QA_DELIVERY_CASH_PREFLIGHT_20261015.md) is present in the history. The launcher also requires the validated ancestor `83bac13b201916a8504e44b827e369be437da3ce`; HEAD may include later documentation-only commits. Stop on conflicts/divergence; do not force push. This cloud session cannot operate Desktop Commander because no such tool is connected here, even though the notebook is reported online. GitHub is the code synchronization point.

## Configure without credential files

Preferred CI: GitHub repository Settings → Environments → `nexalvo-test`. Reuse existing QA bindings; do not replace working credentials or reset user passwords merely to configure this machine.

- Variable `QA_SUPABASE_URL`: `https://msinksoilkluooxenecy.supabase.co`.
- Secrets `QA_SUPABASE_ANON_KEY`, `QA_TWO_TENANT_A_EMAIL`, `QA_TWO_TENANT_A_PASSWORD`, `QA_TWO_TENANT_B_EMAIL`, `QA_TWO_TENANT_B_PASSWORD`.
- `QA_TWO_TENANT_ENABLED=true` only after both dedicated OWNER accounts are configured. This enables existing authenticated CI jobs; it does not enable the standalone persistent P0.05 browser test.
- Never set `QA_P005_PERSISTENT_E2E_ENABLED` during preflight. Keep purchase-idempotency flag off.

GitHub environment secrets are not automatically available to an interactive Windows terminal. Do not export/download them. For local preflight, enter the same dedicated credentials from your approved password manager using the hidden prompt:

```powershell
.\qa\Invoke-QaPreflight.ps1
```

The launcher uses hidden Read-Host prompts, transient process environment only, restores previous bindings in finally, and does not write .env or credential files. Disable shell transcription/debug tracing/screensharing before entry; do not paste assignments with literal passwords into command history. Child processes necessarily receive plaintext credentials in memory, as with any password login. Close the isolated terminal after use. No API body or token is printed by the runner. Do not run as an administrator just to bypass an execution policy; use the organization's approved script policy.

PowerShell launcher was prepared but cannot be executed on this Linux machine; treat it as pending Windows validation. Do not mark account setup complete on the basis of this document.

## Execute and interpret preflight

With bindings securely injected on Linux or Windows:

```text
node qa/p0-preflight-readonly.TEST.mjs
```

The runner has one classified result: exit **0** is `PASS`; exit **1** is `FAIL` after the TEST endpoint proves a tenant-context, permission or isolation defect; exit **2** is `BLOCKED` for configuration, identity binding, DNS/network, rejected QA credentials, unavailable service or missing fixture. These are not passing skips. Messages contain only safe category/stage names and optional HTTP status, never values or response bodies. Do not upload headers, browser storage, auth responses, terminal screenshots of secret configuration, or session dumps as evidence. Retain the sanitized classification and exact code SHA only.

Checks: exact TEST URL/port and anon/publishable-key guard; independent OWNER A/B login; Auth identity and active OWNER profile/business; `current_business_id`; positive products A/B visible to their owner and hidden from the other; supplier/item/location A visible to A and hidden from B; secure stock A with quantity at least one; a real purchase A visible to A and the exact ID hidden from B; and, for both A and B, positive secure-facade rows followed by direct authenticated SELECT and cross-company denial on `employees` and `sale_items`. Authentication creates temporary sessions and may produce normal Supabase auth metadata; it is not a database rollback. Tokens stay in memory, are deleted from the runner objects, are not saved or reused, and no global sign-out is performed.

Permissions scope: the positive direct reads detect a missing authenticated SELECT/RLS path for `employees` and `sale_items`; the exact ACL membership still requires the read-only catalog export. Product and direct-table isolation are tested in both directions. Purchase isolation is A→B only and does not prove B→A. The preflight does **not** prove mutating RPCs, MANAGER/EMPLOYEE, all tables, session/refresh expiry, SMTP recovery or persistent transactions.

The QA workflow runs this script in a dedicated `authenticated-preflight` job after anonymous API smoke and before every authenticated job. Its sanitized log is retained as an artifact and the GitHub step summary records `PASS`, `FAIL` or `BLOCKED`. A non-PASS result blocks downstream authenticated jobs. Local Windows execution through `Invoke-QaPreflight.ps1` additionally requires the exact QA branch, a clean worktree and the validated ancestor; it never resets or cleans local changes and restores prior process variables and native-command preference in `finally`.

Observed result on 2026-10-15: [CI #118](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38752124497), SHA `0130df45852708b15ec128d3b3156551817f1197`, returned `BLOCKED [AUTH_REJECTED_A]`. This proves only that TEST rejected OWNER A authentication at the first login stage. It does not establish whether the e-mail binding, password, account state or a credential rotation is the cause, and it does not evaluate OWNER B or any later fixture/isolation check. Confirm the dedicated OWNER A account and refresh only its GitHub environment bindings through the approved secret manager; never place the values in Git, logs, screenshots or chat.

## Before any persistent P0.05 run

Require a fresh real recovery/login acceptance, preflight PASS on the exact synchronized SHA, controlled TEST window, explicit authorization identifying the staged runner/fixtures and historical records retained, compensation review and post-check of stock/financial net zero. Never enable the persistent test in default push CI. No purchases were performed to prepare this procedure.
