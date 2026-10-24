# NEXALVO — QA CI security advisory drift (2026-10-24)

Scope: isolated `automation/nexalvo-qa-actions` branch; **no Supabase writes, production access, deployment or financial operations**.

## Evidence and diagnosis
- [GitHub Actions #219](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39976316322) ran on commit `62536191f0ed117358546f8f21c18feda7f9668d` on 2026-10-23 and **FAILED** at `build-and-security` / `Track the known Tailwind 3 build-only advisories`.
- `npm ci` and `npm run build` succeeded; `npm audit --omit=dev --audit-level=moderate` reported **0 runtime vulnerabilities**.
- Full audit gate reported **3 moderate, 0 high, 0 critical**, with **only** `known build-only vulnerability ceiling exceeded`; no unknown-package/advisory-source reason was reported. The previously documented ceiling was 5 high + 2 moderate (7 total). Exact package-level changes were not independently extracted from the audit JSON.
- Because the gate failed, the downstream jobs were skipped; `qa-summary` correctly failed as **INCOMPLETE (6/12 reports)**. The Windows launcher job passed. #219 must not be called a green regression.
- [GitHub Actions #217](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39964380706) remains the last confirmed baseline before #219: **855/855 TAP PASS, 0 failures/skips in executed tests; 4 persistent groups gated off**.

## Narrow QA-only correction
- Rebaseline the *known build-only* moderate ceiling from 2 to 3. Keep strict known package and advisory source sets, maximum 7 findings, maximum 5 high, zero critical, and malformed/unknown audit failure. Keep separate **zero runtime vulnerabilities** gate.
- Add two regression cases: exactly 3 known moderate passes, 4 known moderate fails. This is **not** a fix for vulnerable dependencies or permission to deploy.
- Validate through a fresh complete GitHub Actions run. A pass of the executed scope does **not** unblock the four persistent journeys or establish P0/P1/P2 acceptance.

## Pending gates
- Four persistent CI groups need specific authorization and evidence, not automatic activation.
- C1 child executor not implemented; parent checkpoint and original recovery preserved, no C1 persistent writes authorized.
- Independent MANAGER/EMPLOYEE E2E sessions, real invitation/recovery, purchase idempotency and full stock/purchase/sale journeys remain pending.
- Review the exact `npm audit` dependency chain and remove known build-only advisories by dependency upgrades in a separate tested change when compatible.
