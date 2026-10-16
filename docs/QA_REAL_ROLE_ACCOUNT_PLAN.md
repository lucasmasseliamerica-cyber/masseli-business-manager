# NEXALVO TEST real-role account plan

Scope: Supabase TEST `msinksoilkluooxenecy`, business QA A `d627563b-2ce4-491d-8cf6-141ef28d0f63`, OWNER A `f37e9907-47c4-48bf-94b7-9a6fa5de1f88`, and branch `automation/nexalvo-qa-actions`. No SQL, invitation, password action, migration or deployment was executed while preparing this plan.

## Evidence and reuse decision

The external read-only audit reported six MANAGER/EMPLOYEE profiles. One active EMPLOYEE profile, `QA EMAIL INVITE 20261005`, has no `employee_id`. Existing MANAGER profiles are inactive. `QA TEMP employee` has an employee link, but both profile and employee are inactive.

These rows are candidates for investigation, not automatically safe fixtures. Reusing the active EMPLOYEE would change an existing profile whose prior state and dependencies have not yet been exported. Reactivating the temporary or MANAGER rows would change historical records and could revive old permissions or relationships. Exact compensation cannot be promised until IDs, constraints and referencing rows are known. The default plan therefore creates two dedicated TEST Auth identities and two new application profiles/employees. Existing historical rows remain untouched.

`qa/sql/p0_01_real_roles_schema_readonly_TEST.sql` must be run first through an approved TEST catalog connection. It returns the QA A/OWNER binding; deployed columns/defaults; PK/unique/check/FK definitions; indexes; policies; table/column grants; a sanitized six-profile inventory joined to employee and Auth status; and the identity/permission/employee-facade function definitions. It omits Auth e-mail, phone, password, token and metadata fields. Function source output must remain restricted and be scanned for embedded secrets before sharing.

## Separation of Auth and application records

Supabase Auth identities and NEXALVO application records are separate lifecycle steps:

1. **Auth-only human action:** create or invite two dedicated TEST identities through the approved Supabase Auth admin path, one for MANAGER and one for EMPLOYEE. Accept both invitations and establish passwords outside chat/logs. Do not insert directly into `auth.users` with SQL.
2. Record the two Auth UUIDs. Confirm both identities are e-mail-confirmed, not deleted, independent, and able to log in. If an Auth trigger or admin path automatically creates `public.users`, stop: do not run the prepared application SQL until those rows are inspected and the plan is adapted.
3. **Application-record action under separate authorization:** replace the two sentinel UUIDs in `qa/sql/p0_01_real_roles_app_apply_TEST.sql`, review the diff, reconfirm project reference, then run the script once. It creates two fixed active employees and two profiles whose IDs equal the existing Auth UUIDs. The EMPLOYEE reports to the MANAGER. Both use empty permission overrides so deployed role defaults are exercised.
4. Configure the four secrets in GitHub Environment `nexalvo-test`, without exposing their values: `QA_ROLE_MANAGER_EMAIL`, `QA_ROLE_MANAGER_PASSWORD`, `QA_ROLE_EMPLOYEE_EMAIL`, `QA_ROLE_EMPLOYEE_PASSWORD`.
5. Manually dispatch `NEXALVO TEST - Real Role Preflight` from the QA branch. PASS is required before adding browser/write scenarios.

The application apply script checks the OWNER A tenant guard, distinct non-sentinel Auth UUIDs, two confirmed/non-deleted Auth rows, username/UUID collisions, exact employee/profile definitions and one audit row. It is idempotent for an exact prior application and refuses to adopt or overwrite a different profile.

## Compensation

`qa/sql/p0_01_real_roles_app_compensate_TEST.sql` removes only the two exact application profiles and their two tagged employee rows, in dependency order, and records a removal audit event. It never deletes, bans, disables or changes the two Auth identities. Any unexpected FK dependency causes the transaction to fail and roll back; never add `CASCADE`. Auth cleanup, if desired, is a separate human-authorized Auth action after application compensation and evidence retention.

## Required authorizations and human actions

1. Provide the sanitized output of the read-only discovery query, or run it through the approved integration. No password or token is needed in chat.
2. Approve and perform two TEST-only Auth invitations/creations and invitation acceptance. This is persistent Auth state and e-mail delivery.
3. After reviewing the discovered schema and the exact Auth UUID bindings, explicitly authorize the application apply SQL. It is a persistent TEST write.
4. Enter the four credentials directly into the protected GitHub Environment and manually dispatch the role workflow. Do not send values through chat.
5. Separately authorize compensation or Auth deactivation/deletion if cleanup is required.

Until steps 1–4 complete, MANAGER/EMPLOYEE remain **BLOCKED**, and mock/guard tests are preparation rather than real-role homologation.
