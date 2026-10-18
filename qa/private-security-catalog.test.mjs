import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPrivateSecurityEvidence, normalizePrivateCatalogExport } from './audit-private-security-catalog.mjs';

const evidence = JSON.parse(readFileSync(
  new URL('./evidence/final-private-security-sanitized-20261018.json', import.meta.url), 'utf8',
));
const platformMigration = readFileSync(new URL('../migrations/20261016_platform_admin_TEST.sql', import.meta.url), 'utf8');
const platformPreflight = readFileSync(new URL('./sql/platform_admin_preflight_readonly_TEST.sql', import.meta.url), 'utf8');
const operatorPreflight = readFileSync(new URL('./sql/platform_admin_operator_alignment_readonly_TEST.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const staffCore = readFileSync(new URL('../supabase/functions/_shared/manage-staff-user-core.mjs', import.meta.url), 'utf8');

test('private catalog evidence is sanitized, pinned and count-consistent', () => {
  assert.equal(evidence.target.project_ref, 'msinksoilkluooxenecy');
  assert.equal(evidence.source.sha256, '8f9e02c2a067962f35be60e0c1fae288a2ff6bb8197f1e58ab99ea4af4b0cf03');
  assert.equal(evidence.source.raw_versioned, false);
  assert.deepEqual(evidence.source.secret_scan.findings, []);
  assert.equal(evidence.counts.schemas, 2);
  assert.equal(evidence.counts.functions, 7);
  assert.equal(evidence.counts.security_definer_functions, 6);
  assert.equal(evidence.counts.relations, 6);
  assert.equal(evidence.counts.policies, 4);
  assert.equal(evidence.grants.table_grants_count, 28);
  assert.equal(evidence.grants.column_grants_count, 84);
  assert.ok(evidence.functions.every((row) => !Object.hasOwn(row, 'definition') && /^[a-f0-9]{64}$/.test(row.definition_sha256)));
});

test('private catalog normalization rejects ambiguous or invalid envelopes', () => {
  assert.throws(() => normalizePrivateCatalogExport([]), /exactly one row/);
  assert.throws(() => normalizePrivateCatalogExport([{}, {}]), /exactly one row/);
  assert.throws(() => normalizePrivateCatalogExport(null), /invalid private catalog/);
  assert.deepEqual(normalizePrivateCatalogExport([{ final_private_security_catalog: { counts: {} } }]), { counts: {} });
});

test('private schemas deny direct API relation access and use fixed definer search paths', () => {
  const facts = evidence.audit_facts.confirmed;
  assert.equal(facts.anon_function_execute_count, 0);
  assert.equal(facts.anon_direct_relation_access_count, 0);
  assert.equal(facts.authenticated_direct_relation_access_count, 0);
  assert.deepEqual(facts.security_definer_without_empty_search_path, []);
  assert.deepEqual(facts.authenticated_execute_functions, [
    'nexalvo_backup.export_business_data',
    'nexalvo_platform.assign_first_owner',
    'nexalvo_platform.company_directory',
    'nexalvo_platform.has_access',
    'nexalvo_platform.provision_company',
  ]);
});

test('business export is OWNER and tenant scoped with explicit volume bounds', () => {
  const facts = evidence.audit_facts.confirmed;
  assert.equal(facts.export_owner_and_tenant_guard, true);
  assert.equal(facts.export_includes_sensitive_tenant_data, true);
  assert.deepEqual(facts.export_limits, { per_table_rows: 10000, total_rows: 50000, serialized_bytes: 20971520 });
  assert.equal(facts.exported_tables.length, 30);
  assert.ok(!facts.exported_tables.includes('role_default_permissions'));
  assert.equal(evidence.audit_facts.conditional.export_size_limit_is_checked_after_json_materialization, true);
});

test('public wrappers preserve private signatures and deny anonymous execution', () => {
  assert.equal(evidence.public_wrapper_comparison.length, 5);
  for (const row of evidence.public_wrapper_comparison) {
    assert.equal(row.private_present, true);
    assert.equal(row.public_present, true);
    assert.equal(row.arguments_match, true);
    assert.equal(row.public_security_definer, false);
    assert.equal(row.public_authenticated_execute, true);
    assert.equal(row.public_anon_execute, false);
  }
});

test('frontend and privileged staff service share the same 20 permission keys', () => {
  const appBlock = app.match(/const PERMISSIONS = \[([\s\S]*?)\n\];/)?.[1] || '';
  const serviceBlock = staffCore.match(/const PERMISSIONS = new Set\(\[([\s\S]*?)\]\);/)?.[1] || '';
  const appKeys = [...appBlock.matchAll(/key:\s*"([A-Za-z]+)"/g)].map((match) => match[1]).sort();
  const serviceKeys = [...serviceBlock.matchAll(/'([A-Za-z]+)'/g)].map((match) => match[1]).sort();
  assert.equal(appKeys.length, 20);
  assert.deepEqual(serviceKeys, appKeys);
});

test('prepared platform administration refuses an unreconciled legacy authority plane', () => {
  assert.equal(evidence.audit_facts.confirmed.platform_access_requires_operator_and_active_profile, true);
  assert.equal(evidence.audit_facts.confirmed.platform_access_checks_signed_superadmin_claim, false);
  assert.equal(evidence.audit_facts.conditional.deployed_platform_authority_differs_from_prepared_signed_claim_authority, true);
  assert.match(platformMigration, /legacy nexalvo_platform authority must be reconciled before installation/);
  assert.match(platformMigration, /to_regnamespace\('nexalvo_platform'\)/);
  assert.match(platformPreflight, /legacy_authority_reconciliation_required/);
  assert.match(operatorPreflight, /active_operator_without_signed_superadmin_claim/);
  assert.match(operatorPreflight, /signed_superadmin_without_active_operator/);
});

test('operator alignment preflight is aggregate-only and strictly read-only', () => {
  const executable = operatorPreflight.replace(/^\s*--.*$/gm, '');
  assert.match(operatorPreflight, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(operatorPreflight, /ROLLBACK;/);
  assert.doesNotMatch(operatorPreflight, /SELECT\s+(?:o|u|a)\.(?:id|email|raw_app_meta_data)/i);
  assert.doesNotMatch(executable, /(?:^|;)\s*(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\b/im);
});

test('private evidence builder fails closed for wrong project or secret-bearing input', () => {
  const minimal = { final_private_security_catalog: { project_ref_expected: 'wrong', functions: [] } };
  assert.throws(() => buildPrivateSecurityEvidence(minimal, {
    sourceBytes: Buffer.from('{}'), sourceName: 'x.json', publicEvidence: { functions: [] },
  }), /authorized TEST project/);
  const withSecret = { final_private_security_catalog: {
    project_ref_expected: 'msinksoilkluooxenecy', functions: [], marker: 'sb_secret_MOCKVALUE123456789',
  } };
  assert.throws(() => buildPrivateSecurityEvidence(withSecret, {
    sourceBytes: Buffer.from('{}'), sourceName: 'x.json', publicEvidence: { functions: [] },
  }), /secret\/PII scan failed/);
});
