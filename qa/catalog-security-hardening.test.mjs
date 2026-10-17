import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scanSecrets } from './audit-final-security-catalog.mjs';

const evidence = JSON.parse(readFileSync(new URL('./evidence/final-homologation-security-sanitized-20261017.json', import.meta.url), 'utf8'));
const apply = readFileSync(new URL('../migrations/20261017_catalog_security_hardening_TEST.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../migrations/20261017_catalog_security_hardening_rollback_TEST.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('./sql/catalog_security_hardening_preflight_readonly_TEST.sql', import.meta.url), 'utf8');
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

test('real grants prove the employee salary bypass and the evidence keeps risk boundaries', () => {
  assert.equal(evidence.audit_facts.confirmed.authenticated_employee_table_select, true);
  assert.equal(evidence.audit_facts.confirmed.authenticated_hourly_rate_select, true);
  assert.deepEqual(evidence.audit_facts.confirmed.employees_policy_roles, ['public']);
  assert.equal(evidence.audit_facts.conditional.policies_assigned_to_public.length, 21);
  assert.equal(evidence.audit_facts.conditional.security_definer_search_path_public.length, 40);
  assert.equal(evidence.audit_facts.conditional.authenticated_can_create_in_public, false);
  assert.equal(evidence.audit_facts.conditional.anon_can_create_in_public, false);
  assert.deepEqual(evidence.audit_facts.conditional.referenced_private_schemas_not_exported, ['nexalvo_backup', 'nexalvo_platform']);
  assert.equal(evidence.audit_facts.effective_denials.anon_function_execute_count, 0);
  assert.equal(evidence.audit_facts.effective_denials.anon_table_grant_count, 0);
});

test('frontend reads employees through the secure facade and limits write representations', () => {
  for (const app of [rootApp, srcApp]) {
    assert.match(app, /selectRpc\("fn_read_employees_secure", "order=created_at\.desc"\)/);
    assert.match(app, /\{ missing: "deactivate", loadRows, writeSelect: "id" \}/);
    assert.match(app, /async selectRpc\(fnName, query = ""\)/);
    assert.match(app, /select=\$\{encodeURIComponent\(returnSelect\)\}/);
    assert.match(app, /missing === "deactivate"\)[\s\S]*?updateOne\(table, row\.id,[\s\S]*?null, writeSelect\)/);
  }
  assert.equal(rootApp, srcApp);
});

test('TEST-only hardening is guarded, least-privilege and exactly reversible', () => {
  assert.match(apply, /PREPARED, NOT EXECUTED/);
  assert.match(apply, /a9e17a9bd5284616fc2356555beb407fb823994e4d34b8ebcdc10784b7e2856f/);
  assert.match(apply, /1c13bdeb159e0d78db0a200055cdb36a/);
  assert.match(apply, /REVOKE SELECT ON TABLE public\.employees FROM authenticated/);
  assert.doesNotMatch(apply.match(/GRANT SELECT \([\s\S]*?\) ON TABLE public\.employees TO authenticated;/)?.[0] || '', /hourly_rate/);
  assert.match(apply, /e\.id = a\.employee_id/);
  assert.match(apply, /a\.role = 'MANAGER' AND e\.manager_id = a\.employee_id/);
  assert.match(apply, /id = auth\.uid\(\) OR public\.user_can\('manageUsers'\)/);
  assert.equal((apply.match(/ALTER POLICY .* TO authenticated;/g) || []).length, 19);
  assert.match(apply, /ALTER DEFAULT PRIVILEGES FOR ROLE postgres[\s\S]*REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated/);
  assert.match(apply, /CREATE TRIGGER inventory_items_validate_tenant_references/);
  assert.match(apply, /s\.id = NEW\.supplier_id AND s\.business_id = NEW\.business_id/);
  assert.match(apply, /trg_validate_inventory_item_tenant_references\(\)[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(rollback, /GRANT SELECT ON TABLE public\.employees TO authenticated/);
  assert.match(rollback, /CASE WHEN public\.user_can\('viewFinancials'\) THEN e\.hourly_rate ELSE NULL END/);
  assert.equal((rollback.match(/ALTER POLICY .* TO PUBLIC;/g) || []).length, 19);
  assert.match(rollback, /GRANT EXECUTE ON FUNCTIONS TO anon, authenticated/);
  assert.match(rollback, /DROP TRIGGER IF EXISTS inventory_items_validate_tenant_references ON public\.inventory_items/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.trg_validate_inventory_item_tenant_references\(\)/);
  for (const sql of [apply, rollback]) {
    assert.match(sql, /^BEGIN;$/m);
    assert.match(sql, /^COMMIT;$/m);
    assert.doesNotMatch(sql, /\b(?:TRUNCATE|CASCADE)\b/i);
  }
  assert.doesNotMatch(apply, /\bDROP\b/i);
});

test('post-apply and private-schema exports are read-only and cover the unresolved proof', () => {
  for (const sql of [preflight, privateExport, permissionExport]) {
    const executable = sql.replace(/^\s*--.*$/gm, '');
    assert.match(sql, /BEGIN TRANSACTION READ ONLY;/i);
    assert.match(sql, /\bROLLBACK;/i);
    assert.doesNotMatch(executable, /(?:^|;)\s*(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\b/im);
  }
  for (const schema of ['nexalvo_platform', 'nexalvo_backup']) assert.match(privateExport, new RegExp(schema));
  for (const marker of ['pg_get_functiondef', 'private_functions', 'private_relations', 'private_policies', 'private_table_grants', 'private_column_grants']) {
    assert.match(privateExport, new RegExp(marker));
  }
  assert.match(permissionExport, /FROM public\.role_default_permissions/);
  assert.match(permissionExport, /permission_key/);
});
