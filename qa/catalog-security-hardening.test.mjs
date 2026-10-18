import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { scanSecrets } from './audit-final-security-catalog.mjs';

const evidence = JSON.parse(readFileSync(new URL('./evidence/final-homologation-security-sanitized-20261017.json', import.meta.url), 'utf8'));
const realPreapply = JSON.parse(readFileSync(new URL('./evidence/catalog-preapply-real-20261018.json', import.meta.url), 'utf8'));
const reportedApply = JSON.parse(readFileSync(new URL('./evidence/catalog-hardening-apply-reported-20261018.json', import.meta.url), 'utf8'));
const apply = readFileSync(new URL('../migrations/20261017_catalog_security_hardening_TEST.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../migrations/20261017_catalog_security_hardening_rollback_TEST.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('./sql/catalog_security_hardening_preflight_readonly_TEST.sql', import.meta.url), 'utf8');
const preapply = readFileSync(new URL('./sql/catalog_security_hardening_preapply_readonly_TEST.sql', import.meta.url), 'utf8');
const driftCapture = readFileSync(new URL('./sql/catalog_security_hardening_function_drift_readonly_TEST.sql', import.meta.url), 'utf8');
const privateExport = readFileSync(new URL('./sql/final_homologation_private_security_definitions_readonly_TEST.sql', import.meta.url), 'utf8');
const permissionExport = readFileSync(new URL('./sql/final_homologation_permission_defaults_readonly_TEST.sql', import.meta.url), 'utf8');
const rootApp = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const srcApp = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

test('complete catalog evidence is sanitized, pinned and count-consistent', () => {
  assert.equal(evidence.target.project_ref, 'msinksoilkluooxenecy');
  assert.equal(evidence.source.sha256, 'a9e17a9bd5284616fc2356555beb407fb823994e4d34b8ebcdc10784b7e2856f');
  assert.equal(evidence.source.raw_versioned, false);
  assert.equal(evidence.source.secret_scan.passed, true);
  assert.deepEqual(evidence.source.secret_scan.findings, []);
  assert.equal(evidence.counts.public_tables, 31);
  assert.equal(evidence.counts.public_rls_tables, 31);
  assert.equal(evidence.functions.length, 58);
  assert.equal(evidence.policies.length, 53);
  assert.equal(evidence.grants.all_table_grants_count, 568);
  assert.equal(evidence.grants.all_column_grants_count, 3547);
  assert.equal(evidence.public_indexes.length, 114);
  assert.equal(evidence.public_constraints.length, 196);
  assert.equal(evidence.public_triggers.length, 5);
  assert.ok(evidence.functions.every((row) => !Object.hasOwn(row, 'definition') && /^[a-f0-9]{64}$/.test(row.definition_sha256)));
});

test('secret scanner fails closed without printing the matching value', () => {
  const result = scanSecrets({ nested: { token: 'sb_secret_MOCKVALUE123456789' } });
  assert.equal(result.passed, false);
  assert.equal(result.counts.supabase_secret, 1);
  assert.equal(Object.hasOwn(result.findings[0], 'value'), false);
  assert.match(result.findings[0].match_sha256_16, /^[a-f0-9]{16}$/);
});

test('real TEST drift is reconciled as return-type qualification only', () => {
  assert.equal(scanSecrets(realPreapply).passed, true);
  assert.equal(realPreapply.target.project_ref, 'msinksoilkluooxenecy');
  assert.equal(realPreapply.catalog_security_hardening_preapply.status, 'BLOCKED');
  assert.equal(realPreapply.catalog_security_hardening_preapply.passed, 7);
  assert.equal(realPreapply.catalog_security_hardening_preapply.failed, 3);
  assert.equal(realPreapply.source.raw_function_definitions_received, true);
  assert.equal(realPreapply.source.raw_function_definitions_versioned, false);
  assert.equal(realPreapply.source.raw_capture_sha256, '8ba0df6e79a39f850f7b4a37430a42fbba603fac6b08a9344a92f14a25bc6c1c');
  assert.equal(realPreapply.source.secret_scan_passed, true);
  const rows = realPreapply.catalog_security_hardening_preapply.function_fingerprints;
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.historical !== row.observed));
  assert.ok(rows.every((row) => row.historical_body === row.observed_body));
  assert.ok(rows.every((row) => row.classification === 'TEXT_ONLY_RETURN_TYPE_SCHEMA_QUALIFICATION'));
  assert.deepEqual(rows.map((row) => row.signature), [
    'public.fn_read_employees_secure()',
    'public.fn_read_sale_items_secure()',
    'public.fn_write_audit(text,text)',
  ]);
  assert.equal(realPreapply.classification.hardening_application,
    'READY_FOR_RECONCILED_PREFLIGHT_REVIEW');
  assert.equal(realPreapply.classification.historical_rollback,
    'READY_FOR_EXACT_REGENERATION_AND_REGRESSION');
  assert.deepEqual(realPreapply.isolated_postgresql_validation, {
    engine: 'postgres:17-alpine',
    supabase_accessed: false,
    current_definition_fingerprints_reproduced: true,
    target_body_fingerprints_reproduced: true,
    rollback_definition_fingerprints_reproduced: true,
    rollback_body_fingerprints_reproduced: true,
  });
});

test('real grants prove the sensitive facade bypasses and the evidence keeps risk boundaries', () => {
  assert.equal(evidence.audit_facts.confirmed.authenticated_employee_table_select, true);
  assert.equal(evidence.audit_facts.confirmed.authenticated_hourly_rate_select, true);
  assert.equal(evidence.audit_facts.confirmed.authenticated_sale_item_cost_select, true);
  assert.equal(evidence.audit_facts.confirmed.legacy_staff_profile_authenticated_execute, true);
  assert.equal(evidence.audit_facts.confirmed.legacy_staff_profile_non_owner_override_escalation, true);
  assert.equal(evidence.audit_facts.confirmed.legacy_staff_profile_fingerprint, '4e02f0128a171ec8a6e65de291f115e7');
  assert.equal(evidence.audit_facts.confirmed.client_audit_authenticated_execute, true);
  assert.equal(evidence.audit_facts.confirmed.client_audit_unmarked_action, true);
  assert.equal(evidence.audit_facts.confirmed.client_audit_fingerprint, '4ab39d24cd80134b7ca7812c8a38dd7d');
  assert.deepEqual(evidence.audit_facts.confirmed.employees_policy_roles, ['public']);
  assert.equal(evidence.audit_facts.conditional.policies_assigned_to_public.length, 21);
  assert.equal(evidence.audit_facts.conditional.security_definer_search_path_public.length, 40);
  assert.equal(evidence.audit_facts.conditional.authenticated_can_create_in_public, false);
  assert.equal(evidence.audit_facts.conditional.anon_can_create_in_public, false);
  assert.deepEqual(evidence.audit_facts.conditional.referenced_private_schemas_not_exported, ['nexalvo_backup', 'nexalvo_platform']);
  assert.equal(evidence.audit_facts.effective_denials.anon_function_execute_count, 0);
  assert.equal(evidence.audit_facts.effective_denials.anon_table_grant_count, 0);
});

test('reported TEST apply evidence keeps the official postflight blocked until corrected rerun', () => {
  assert.equal(scanSecrets(reportedApply).passed, true);
  assert.equal(reportedApply.target.project_ref, 'msinksoilkluooxenecy');
  assert.equal(reportedApply.migration, '20261017_catalog_security_hardening_TEST.sql');
  assert.equal(reportedApply.apply.reported_success, true);
  assert.equal(reportedApply.apply.scope, 'TEST_ONLY');
  assert.equal(reportedApply.independent_readonly_verification.status, 'PASS');
  assert.ok(Object.values(reportedApply.independent_readonly_verification.checks).every(Boolean));
  assert.equal(reportedApply.official_postflight.status, 'BLOCKED_SQL_SYNTAX');
  assert.equal(reportedApply.official_postflight.sqlstate, '42601');
  assert.equal(reportedApply.official_postflight.rerun_required, true);
  assert.equal(reportedApply.rollback.executed, false);
  assert.equal(reportedApply.migration_reapplied, false);
});

test('frontend reads employees through the secure facade and limits write representations', () => {
  for (const app of [rootApp, srcApp]) {
    assert.match(app, /selectRpc\("fn_read_employees_secure", "order=created_at\.desc"\)/);
    assert.match(app, /\{ missing: "deactivate", loadRows, writeSelect: "id", expectedForUpdate \}/);
    assert.match(app, /async selectRpc\(fnName, query = ""\)/);
    assert.match(app, /select=\$\{encodeURIComponent\(returnSelect\)\}/);
    assert.match(app, /missing === "deactivate"\)[\s\S]*?updateOne\(table, row\.id,[\s\S]*?expected, writeSelect\)/);
    assert.match(app, /updatedAt: r\.updated_at \|\| null/);
    const declaration = app.match(/function employeeWriteExpectation\(old\) \{[\s\S]*?\n\}/)?.[0];
    assert.ok(declaration);
    const expectation = Function(`${declaration}; return employeeWriteExpectation;`)();
    assert.deepEqual(expectation({ updatedAt: '2026-10-17T12:34:56.000Z', hourlyRate: 25 }),
      { updated_at: '2026-10-17T12:34:56.000Z' });
    assert.throws(() => expectation({ hourlyRate: 25 }), /row version is unavailable/);
    assert.doesNotMatch(declaration, /hourly_rate|hourlyRate/);
    assert.match(app, /useCallback\(employeeWriteExpectation, \[\]\)/);
    assert.match(app, /selectRpc\("fn_read_sale_items_secure", `select=\*&sale_id=in\.\(\$\{ids\.join\(","\)\}\)`\)/);
    assert.doesNotMatch(app, /supabaseRest\.select\("sale_items", `select=\*/);
  }
  assert.equal(rootApp, srcApp);
});

test('TEST-only hardening and exact rollback use the reconciled function baseline', () => {
  assert.match(apply, /PREPARED, NOT EXECUTED/);
  assert.match(apply, /a9e17a9bd5284616fc2356555beb407fb823994e4d34b8ebcdc10784b7e2856f/);
  assert.match(apply, /6a004cb40f967cc39f4c3bd20fec817e/);
  assert.match(apply, /b9c489bf2a75339768bcc19ba174821c/);
  assert.match(apply, /2d1742df2500389b93028511b1cb17e5/);
  assert.match(apply, /540c5e0821623ebaac46e8d33ed947a7/);
  assert.match(apply, /def30868edefbc15696aff8955f90296/);
  assert.match(apply, /4cf28670a1afda97f728954c6b58ff60/);
  assert.match(apply, /reviewed function owner or execute ACL drifted/);
  assert.match(apply, /^SET LOCAL search_path = pg_catalog;$/m);
  assert.match(apply, /'Client: ' \|\| v_action/);
  assert.match(apply, /pg_catalog\.length\(COALESCE\(p_details, ''\)\) > 2000/);
  assert.match(apply, /REVOKE SELECT ON TABLE public\.employees FROM authenticated/);
  assert.doesNotMatch(apply.match(/GRANT SELECT \([\s\S]*?\) ON TABLE public\.employees TO authenticated;/)?.[0] || '', /hourly_rate/);
  assert.match(apply.match(/GRANT SELECT \([\s\S]*?\) ON TABLE public\.employees TO authenticated;/)?.[0] || '', /updated_at/);
  assert.match(apply, /REVOKE SELECT ON TABLE public\.sale_items FROM authenticated/);
  const safeSaleItemGrant = [...apply.matchAll(/GRANT SELECT \(([\s\S]*?)\) ON TABLE public\.([a-z_]+) TO authenticated;/g)]
    .find((match) => match[2] === 'sale_items')?.[1] || '';
  assert.match(safeSaleItemGrant, /unit_price/);
  assert.doesNotMatch(safeSaleItemGrant, /unit_cost_snapshot/);
  assert.match(apply, /e\.id = a\.employee_id/);
  assert.match(apply, /a\.role = 'MANAGER' AND e\.manager_id = a\.employee_id/);
  assert.match(apply, /id = auth\.uid\(\) OR public\.user_can\('manageUsers'\)/);
  assert.equal((apply.match(/ALTER POLICY .* TO authenticated;/g) || []).length, 19);
  assert.match(apply, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres[\s\S]*REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated/);
  assert.match(apply, /CREATE TRIGGER inventory_items_validate_tenant_references/);
  assert.match(apply, /s\.id = NEW\.supplier_id AND s\.business_id = NEW\.business_id/);
  assert.match(apply, /trg_validate_inventory_item_tenant_references\(\)[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(rollback, /GRANT SELECT ON TABLE public\.employees TO authenticated/);
  assert.match(rollback, /GRANT SELECT ON TABLE public\.sale_items TO authenticated/);
  assert.match(rollback, /btrim\(p_action\),coalesce\(p_details,''\)/);
  assert.doesNotMatch(rollback.match(/CREATE OR REPLACE FUNCTION public\.fn_write_audit[\s\S]*?\$function\$;/)?.[0] || '', /Client:/);
  assert.match(rollback, /CASE WHEN public\.user_can\('viewFinancials'\) THEN e\.hourly_rate ELSE NULL END/);
  assert.equal((rollback.match(/ALTER POLICY .* TO PUBLIC;/g) || []).length, 19);
  assert.match(rollback, /GRANT EXECUTE ON FUNCTIONS TO anon, authenticated/);
  assert.match(rollback, /DROP TRIGGER IF EXISTS inventory_items_validate_tenant_references ON public\.inventory_items/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.trg_validate_inventory_item_tenant_references\(\)/);
  assert.match(rollback, /rollback_preflight/);
  assert.match(rollback, /rollback_postflight/);
  assert.match(rollback, /2c26a316e5cfc46dcfa187c550eb7108/);
  assert.match(rollback, /75c32789a68a73e29a8a82d33e3aad27/);
  assert.match(rollback, /rollback postflight failed: reconciled function baseline was not restored/);
  for (const sql of [apply, rollback]) {
    assert.match(sql, /^BEGIN;$/m);
    assert.match(sql, /^COMMIT;$/m);
    assert.doesNotMatch(sql, /\b(?:TRUNCATE|CASCADE)\b/i);
  }
  assert.doesNotMatch(apply, /\bDROP\b/i);

  const normalizeBody = (value) => value.replace(/\r\n/g, '\n').replace(/^\s*--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const rollbackBodyHash = (name) => {
    const pattern = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS\\s+(\\$[A-Za-z0-9_]*\\$)([\\s\\S]*?)\\1`, 'i');
    const body = rollback.match(pattern)?.[2];
    assert.ok(body, `rollback definition missing for ${name}`);
    return createHash('sha256').update(normalizeBody(body)).digest('hex');
  };
  assert.equal(rollbackBodyHash('fn_read_employees_secure'), 'c4cac0a6f8182b34f3069d3a5907435f228aee8e6d8465b5465ea2d4f430932c');
  assert.equal(rollbackBodyHash('fn_write_audit'), 'df886665496ca338aacd153ea277d4a3567dd25330abc93b52c5feeb3fa0c315');
  const exactRollbackBodyMd5 = (name) => {
    const pattern = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?AS\\s+(\\$[A-Za-z0-9_]*\\$)([\\s\\S]*?)\\1`, 'i');
    return createHash('md5').update(rollback.match(pattern)?.[2] || '').digest('hex');
  };
  assert.equal(exactRollbackBodyMd5('fn_read_employees_secure'), '540c5e0821623ebaac46e8d33ed947a7');
  assert.equal(exactRollbackBodyMd5('fn_write_audit'), '4cf28670a1afda97f728954c6b58ff60');
});

test('post-apply, drift and private-schema exports are read-only and cover the unresolved proof', () => {
  for (const sql of [preapply, preflight, driftCapture, privateExport, permissionExport]) {
    const executable = sql.replace(/^\s*--.*$/gm, '');
    assert.match(sql, /BEGIN TRANSACTION READ ONLY;/i);
    assert.match(sql, /\bROLLBACK;/i);
    assert.doesNotMatch(executable, /(?:^|;)\s*(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\b/im);
  }
  assert.match(preflight, /has_column_privilege\('authenticated', 'public\.employees', 'updated_at', 'SELECT'\)/);
  assert.match(preflight, /has_column_privilege\('authenticated', 'public\.sale_items', 'unit_cost_snapshot', 'SELECT'\)/);
  assert.match(preflight, /client_audit_entries_have_explicit_provenance/);
  assert.match(preflight, /employee_facade_exact_target_body/);
  assert.match(preflight, /sale_item_facade_preserved_body/);
  assert.match(preflight, /client_audit_exact_target_body/);
  assert.match(preflight, /hardened_function_attributes/);
  assert.match(preflight, /hardened_function_execute_acl/);
  assert.match(preapply, /business_export_private_fingerprint/);
  assert.match(preapply, /cabc5e9d96a6242ae42ade1d140b087e/);
  assert.match(preapply, /exact_reviewed_public_policy_set/);
  assert.match(preapply, /checks\(name, passed, expected, observed\)/);
  assert.match(preapply, /jsonb_strip_nulls/);
  assert.equal((preapply.match(/FROM fingerprints AS f/g) || []).length, 8);
  for (const [historical, reported] of [
    ['1c13bdeb159e0d78db0a200055cdb36a', '6a004cb40f967cc39f4c3bd20fec817e'],
    ['161e5147cd4eae4ca6e9a4c074af7cb6', 'b9c489bf2a75339768bcc19ba174821c'],
    ['4ab39d24cd80134b7ca7812c8a38dd7d', '2d1742df2500389b93028511b1cb17e5'],
  ]) {
    assert.match(driftCapture, new RegExp(historical));
    assert.match(driftCapture, new RegExp(reported));
    assert.match(apply, new RegExp(reported));
  }
  for (const bodyFingerprint of [
    '540c5e0821623ebaac46e8d33ed947a7',
    'def30868edefbc15696aff8955f90296',
    '4cf28670a1afda97f728954c6b58ff60',
  ]) assert.match(preapply, new RegExp(bodyFingerprint));
  assert.match(preapply, /reviewed_function_attributes/);
  assert.match(preapply, /reviewed_function_owner_and_execute_acl/);
  assert.match(driftCapture, /pg_get_functiondef\(p\.oid\) AS definition/);
  assert.match(driftCapture, /CAPTURED_REPORTED_DRIFT/);
  assert.match(driftCapture, /Treat the result as an unversioned review artifact/);
  assert.doesNotMatch(preflight, /\bpg_catalog\.position\s*\(/i);
  assert.equal((preflight.match(/pg_catalog\.strpos\(/g) || []).length, 4);
  for (const needle of [
    "'Client: '",
    "'2000 characters'",
    "'e.manager_id = a.employee_id'",
    "'e.id = a.employee_id'",
  ]) assert.match(preflight, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const schema of ['nexalvo_platform', 'nexalvo_backup']) assert.match(privateExport, new RegExp(schema));
  for (const marker of [
    'pg_get_functiondef', 'private_functions', 'private_relations', 'private_policies',
    'private_table_grants', 'private_column_grants', 'private_usage_grants', 'private_columns',
    'private_constraints', 'private_indexes', 'private_default_privileges',
  ]) {
    assert.match(privateExport, new RegExp(marker));
  }
  assert.match(privateExport, /SELECT n\.oid, n\.nspname, n\.nspowner, n\.nspacl\s+FROM pg_catalog\.pg_namespace AS n/);
  assert.match(privateExport, /pg_catalog\.pg_get_userbyid\(s\.nspowner\) AS owner/);
  assert.match(privateExport, /s\.nspacl::text AS acl/);
  assert.match(privateExport, /CASE WHEN c\.relkind = 'S'[\s\S]*pg_catalog\.has_sequence_privilege\('anon', c\.oid, 'USAGE'\)/);
  assert.match(privateExport, /CASE WHEN c\.relkind = 'S'[\s\S]*pg_catalog\.has_sequence_privilege\('service_role', c\.oid, 'UPDATE'\)/);
  assert.match(permissionExport, /FROM public\.role_default_permissions/);
  assert.match(permissionExport, /permission_key/);
});
