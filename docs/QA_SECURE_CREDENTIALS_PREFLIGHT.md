# QA A/B credentials and read-only preflight

Only branch `automation/nexalvo-qa-actions` and TEST `msinksoilkluooxenecy`. No production credentials, administrative keys, password resets, migrations or persistent purchases. Preflight PASS is not authorization to run purchases.

## Synchronize Windows through GitHub

On LAPTOP-NLHRV0BA, in `C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED`, first run `git status --short` and preserve any local modifications. Never reset/clean them. Confirm the origin identifies this repository without displaying credential-bearing URLs. With a clean checkout:

```powershell
git switch automation/nexalvo-qa-actions
git pull --ff-only origin automation/nexalvo-qa-actions
git rev-parse HEAD
```

Confirm the published code commit `83bac13b201916a8504e44b827e369be437da3ce` from the delivery report is present in the history; HEAD may be a later documentation-only commit. Stop on conflicts/divergence; do not force push. This cloud session cannot operate Desktop Commander: no such tool is connected, even though the notebook is reported online. GitHub is the code synchronization point.

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

Missing bindings exit **2** (BLOCKED), not a passing skip. Failed checks exit **1**. PASS exits **0** and still does not enable business writes. Do not upload headers, browser storage, auth responses, terminal screenshots of secret configuration, or session dumps as evidence. Retain sanitized PASS/FAIL lines and exact code SHA only.

Checks: exact TEST URL and public key guard; independent OWNER A/B login; Auth identity and active OWNER profile/business; current_business_id; dedicated active supplier/item/location visible to A and inaccessible to B; secure stock read with quantity at least one; cross-company purchase reads in both directions. Authentication creates temporary sessions and may produce normal Supabase auth metadata; it is not a database rollback. Tokens stay in memory, are not saved or reused by the script, and no global sign-out is performed (which could revoke other QA sessions).

Permissions scope: confirms active OWNER role, helper execution and required read access. It does **not** prove grants or permission logic for mutating RPCs, MANAGER/EMPLOYEE, or all tables. Cross-company fixture checks compare a record first confirmed visible to its rightful owner; empty purchase results alone are not a full isolation proof. Session/refresh expiry, SMTP recovery and persistent transactions remain separate gates.

## Before any persistent P0.05 run

Require a fresh real recovery/login acceptance, preflight PASS on the exact synchronized SHA, controlled TEST window, explicit authorization identifying the staged runner/fixtures and historical records retained, compensation review and post-check of stock/financial net zero. Never enable the persistent test in default push CI. No purchases were performed to prepare this procedure.
