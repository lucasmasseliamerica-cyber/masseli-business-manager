# QA real-role read-only preflight

`qa/p0-role-preflight-readonly.TEST.mjs` is a standalone fail-closed check for independent TEST-only MANAGER and EMPLOYEE accounts in business A. It does not create users, send invitations, change passwords, mutate business rows or run persistent purchases. It is intentionally absent from standard CI until both accounts and fixtures exist.

Configure only through the GitHub `nexalvo-test` environment or transient process environment:

- existing `QA_SUPABASE_URL` and public `QA_SUPABASE_ANON_KEY`;
- `QA_ROLE_MANAGER_EMAIL` and `QA_ROLE_MANAGER_PASSWORD`;
- `QA_ROLE_EMPLOYEE_EMAIL` and `QA_ROLE_EMPLOYEE_PASSWORD`.

Never commit these bindings, place them in `.env`, print them, or send them through chat. The runner prints only safe stage classifications. Exit 0 is PASS, exit 1 is a demonstrated permission/isolation FAIL, and exit 2 is BLOCKED by configuration, login or fixture readiness.

The runner confirms distinct Auth identities, exact active profile roles in TEST business A, linked employee fixtures, `current_business_id`, positive own product/employee reads, product and employee cross-tenant denial, OWNER-only export denial, MANAGER positive financial visibility, EMPLOYEE denial of the same ledger row, and absence of another employee's hourly rate. It performs password login and read-only requests; `fn_export_business_data` is invoked only to require authorization denial and must not return a payload.

Before execution, provision the dedicated accounts by the approved invitation/admin process, confirm both are active and linked to distinct employees in business A, and store the secrets in the protected GitHub environment. Dispatch `.github/workflows/nexalvo-role-preflight.yml` only from `automation/nexalvo-qa-actions`. It is manual-only and runs this read-only preflight; standard push CI does not request the role secrets. A PASS does not prove browser controls, custom overrides, deactivation/revocation, write RPC authorization or all RLS policies. Those remain separate tests.

Published in `edead393df65e71f3da5582473bf45045ceaddea`. Local evidence: **86/86** static checks, build PASS and runtime audit zero. [CI #127](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38776559766) passed all 12 existing jobs with **281/281 PASS, 0 FAIL, 0 SKIPPED**. The seven role-preflight guard/mock tests ran in the static job; the live role runner did not execute and no role credentials were requested by CI.

Commit `ba4e7d47daa482dd232441d9001ed6e4fd36fa6b` added the manual-only workflow and its eighth guard. [CI #128](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38777105413) passed **282/282, 0 FAIL, 0 SKIPPED**, 12/12 standard jobs. The manual real-role workflow was not dispatched.
