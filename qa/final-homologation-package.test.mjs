import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  applicationContract,
  artifactInventory,
  baselineSources,
  deliveryUnits,
  evaluateDeployedCatalog,
  executionOrder,
  functionSignatureContract,
  knownDeployedFingerprints,
  normalizeCatalogExport,
  QA_BRANCH,
  TEST_PROJECT_REF,
  validateLocalPackage,
} from './final-homologation-manifest.mjs';

const sql = readFileSync(new URL('./sql/final_homologation_catalog_readonly_TEST.sql', import.meta.url), 'utf8');
const executableSql = sql.replace(/^\s*--.*$/gm, '');
const securityDefinitionsSql = readFileSync(new URL('./sql/final_homologation_security_definitions_readonly_TEST.sql', import.meta.url), 'utf8');
const executableSecurityDefinitionsSql = securityDefinitionsSql.replace(/^\s*--.*$/gm, '');
const runner = readFileSync(new URL('./Invoke-FinalHomologationPreflight.ps1', import.meta.url), 'utf8');

test('final package is pinned to the isolated QA branch and TEST project', () => {
  assert.equal(TEST_PROJECT_REF, 'msinksoilkluooxenecy');
  assert.equal(QA_BRANCH, 'automation/nexalvo-qa-actions');
  assert.match(sql, /project_ref_expected', 'msinksoilkluooxenecy'/);
  assert.match(sql, /project_ref_external_assertion', NULL/);
  assert.match(runner, /automation\/nexalvo-qa-actions/);
  assert.match(runner, /--assert-test-project/);
  const privilegedKeyName = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_');
  assert.doesNotMatch(runner, /QA_SUPABASE_ANON_KEY|QA_TWO_TENANT_[AB]_PASSWORD/i);
  assert.equal(runner.includes(privilegedKeyName), false);
});

test('catalog comparison is transactionally read-only and covers security and migration markers', () => {
  for (const [query, executable] of [[sql, executableSql], [securityDefinitionsSql, executableSecurityDefinitionsSql]]) {
    assert.match(query, /BEGIN TRANSACTION READ ONLY;/i);
    assert.match(query, /SET LOCAL statement_timeout = '(?:30|60)s';/i);
    assert.match(query, /\bROLLBACK;/i);
    assert.doesNotMatch(executable, /(?:^|;)\s*(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\b/im);
  }
  for (const marker of [
    'relrowsecurity', 'pg_policies', 'has_table_privilege', 'has_function_privilege',
    'security_definer', 'purchase_idempotency_rpc', 'expense_idempotency_rpc',
    'platform_admin_rpc_count', 'product_image_policy_count',
  ]) assert.match(sql, new RegExp(marker, 'i'));
  for (const marker of [
    'pg_get_functiondef', 'all_policies', 'all_table_grants', 'schema_security',
    'default_privileges', 'public_views', 'public_triggers', 'public_columns',
    'public_constraints', 'public_indexes', 'all_column_grants', 'storage_policies',
    'security_definitions_complete',
  ]) assert.match(securityDefinitionsSql, new RegExp(marker, 'i'));
  for (const table of ['task_activity', 'users', 'sales', 'inventory_items', 'inventory_stock', 'inventory_transactions', 'products']) {
    assert.match(sql, new RegExp(`'${table}'`));
  }
});

test('every prepared unit has an artifact, explicit authorization and dependency order', () => {
  const local = validateLocalPackage();
  assert.deepEqual(local.errors, []);
  assert.ok(local.artifacts.length >= deliveryUnits.length * 2);
  assert.ok(local.artifacts.every((artifact) => artifact.exists && /^[a-f0-9]{64}$/.test(artifact.sha256)));
  assert.equal(baselineSources.length, 8);
  const byId = new Map(deliveryUnits.map((unit) => [unit.id, unit]));
  assert.equal(byId.get('cash-sale-open-register-guard').status, 'deployed_test');
  for (const unit of deliveryUnits.filter((candidate) => candidate.status === 'prepared_unapplied')) {
    assert.match(unit.authorization, /required$/);
  }
  assert.deepEqual(byId.get('expense-request-idempotency').dependsOn, ['expense-cash-normalization']);
  assert.equal(byId.get('cash-register-finite-guard').rollbackStrategy, 'restore_reviewed_preapply_function_definition');
  assert.equal(byId.get('catalog-security-hardening').status, 'deployed_test');
  assert.ok(byId.get('platform-admin-control-plane').unresolvedGate.includes('independent_identity_preflight'));
  assert.equal(byId.get('platform-admin-control-plane').preflight, 'qa/sql/platform_admin_cutover_preflight_readonly_TEST.sql');
  assert.ok(executionOrder.indexOf('export-deployed-catalog-readonly') < executionOrder.indexOf('obtain-separate-test-migration-authorization'));
});

test('purchase idempotency compares the complete canonical payload and rollbacks preserve history', () => {
  const purchase = readFileSync(new URL('../migrations/20261012_purchase_order_idempotency_TEST.sql', import.meta.url), 'utf8');
  const purchaseRollback = readFileSync(new URL('../migrations/20261012_purchase_order_idempotency_rollback_TEST.sql', import.meta.url), 'utf8');
  const expenseRollback = readFileSync(new URL('../migrations/20261015_expense_idempotency_rollback_TEST.sql', import.meta.url), 'utf8');
  assert.match(purchase, /request_payload jsonb NOT NULL/);
  assert.match(purchase, /v_row\.request_payload IS DISTINCT FROM v_payload/);
  assert.doesNotMatch(purchase, /\bmd5\s*\(/i);
  assert.match(purchase, /^BEGIN;/m);
  assert.match(purchase, /^COMMIT;/m);
  for (const rollback of [purchaseRollback, expenseRollback]) {
    assert.match(rollback, /rollback refused: .* idempotency request history exists/i);
    assert.doesNotMatch(rollback, /\bCASCADE\b/i);
  }
});

test('catalog analyzer distinguishes missing proof, security blockers and review findings', () => {
  const tables = applicationContract.tables.map((name) => ({ name, rls: true }));
  const functions = applicationContract.functions.map((name) => ({
    name,
    arguments: functionSignatureContract[name],
    anon_execute: false,
    security_definer: true,
    settings: ['search_path='],
    definition: `CREATE FUNCTION public.${name}() RETURNS void LANGUAGE plpgsql AS 'BEGIN END'`,
    fingerprint: knownDeployedFingerprints[name] || 'fixture',
  }));
  const complete = {
    project_ref_external_assertion: TEST_PROJECT_REF,
    security_definitions_complete: true,
    counts: { public_functions: functions.length, public_policies: 0, public_role_table_grant_entries: 0 },
    tables,
    functions,
    all_policies: [],
    all_table_grants: [],
  };
  assert.equal(evaluateDeployedCatalog(complete).status, 'PASS');

  const unsafe = evaluateDeployedCatalog({
    ...complete,
    tables: tables.map((row) => row.name === 'users' ? { ...row, exists: false } : row),
    functions: functions.map((row) => row.name === 'fn_create_sale' ? { ...row, anon_execute: true, settings: null } : row),
  });
  assert.equal(unsafe.status, 'BLOCKED');
  assert.ok(unsafe.missingTables.includes('users'));
  assert.ok(unsafe.unexpectedAnonExecute.includes('fn_create_sale'));
  assert.ok(unsafe.reviewFindings.missingDefinerSearchPath.includes('fn_create_sale'));
});

test('real TEST metadata export is unwrapped and classified without overstating security coverage', () => {
  const path = new URL('./evidence/final-homologation-catalog-20261017.json', import.meta.url);
  const wrapped = JSON.parse(readFileSync(path, 'utf8'));
  const catalog = normalizeCatalogExport(wrapped);
  catalog.project_ref_external_assertion = TEST_PROJECT_REF;
  const result = evaluateDeployedCatalog(catalog);
  assert.equal(catalog.counts.public_tables, 31);
  assert.equal(catalog.counts.public_rls_tables, 31);
  assert.equal(catalog.counts.public_functions, 58);
  assert.equal(catalog.counts.public_security_definer_functions, 48);
  assert.equal(catalog.counts.public_role_table_grant_entries, 568);
  assert.deepEqual(result.missingTables, []);
  assert.deepEqual(result.unexpectedMissingFunctions, []);
  assert.deepEqual(result.plannedMissingFunctions, [
    'fn_manage_staff_profile', 'fn_platform_admin_execute',
    'fn_platform_admin_list_audit_logs', 'fn_platform_admin_list_businesses',
    'fn_session_access_status',
  ]);
  assert.deepEqual(result.signatureMismatches, []);
  assert.deepEqual(result.fingerprintMismatches, []);
  assert.deepEqual(result.reviewFindings.countMismatches, []);
  assert.equal(result.reviewFindings.definerSearchPathPublic.length, 33);
  assert.equal(result.reviewFindings.hardenedEmptySearchPath.length, 6);
  assert.equal(result.reviewFindings.policiesAssignedToPublic.length, 8);
  assert.deepEqual(result.reviewFindings.anonSensitiveTableGrants, []);
  assert.equal(result.securityDefinitionsComplete, false);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.some((message) => message.includes('full function definitions')));
  assert.equal(result.migrationMarkers.purchase_idempotency_rpc, false);
  assert.equal(result.migrationMarkers.expense_idempotency_rpc, false);
  assert.equal(result.migrationMarkers.product_image_bucket, false);
});

test('PowerShell entrypoint delegates only to local/catalog and existing read-only owner preflight', () => {
  assert.match(runner, /final-homologation-manifest\.mjs/);
  assert.match(runner, /Invoke-QaPreflight\.ps1/);
  assert.doesNotMatch(runner, /supabase\s+(db push|functions deploy)|psql|npm audit fix|p0-purchase-browser-persistent/i);
  const paths = artifactInventory().map((artifact) => artifact.path);
  assert.ok(paths.includes('migrations/20261017_manage_staff_user_TEST.sql'));
  assert.ok(paths.includes('supabase/functions/manage-staff-user/index.ts'));
  assert.ok(paths.includes('migrations/20261016_product_images_storage_TEST.sql'));
  assert.ok(paths.includes('migrations/20261016_platform_admin_rollback_TEST.sql'));
});
