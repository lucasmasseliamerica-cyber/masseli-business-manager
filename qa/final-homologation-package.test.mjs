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
  QA_BRANCH,
  TEST_PROJECT_REF,
  validateLocalPackage,
} from './final-homologation-manifest.mjs';

const sql = readFileSync(new URL('./sql/final_homologation_catalog_readonly_TEST.sql', import.meta.url), 'utf8');
const executableSql = sql.replace(/^\s*--.*$/gm, '');
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
  assert.match(sql, /BEGIN TRANSACTION READ ONLY;/i);
  assert.match(sql, /SET LOCAL statement_timeout = '30s';/i);
  assert.match(sql, /\bROLLBACK;/i);
  assert.doesNotMatch(executableSql, /(?:^|;)\s*(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\b/im);
  for (const marker of [
    'relrowsecurity', 'pg_policies', 'has_table_privilege', 'has_function_privilege',
    'security_definer', 'purchase_idempotency_rpc', 'expense_idempotency_rpc',
    'platform_admin_rpc_count', 'product_image_policy_count',
  ]) assert.match(sql, new RegExp(marker, 'i'));
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
  assert.ok(byId.get('platform-admin-control-plane').unresolvedGate.includes('deployed_rls_and_rpc_catalog'));
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
    name, anon_execute: false, security_definer: true, settings: ['search_path='],
  }));
  assert.equal(evaluateDeployedCatalog({ project_ref_external_assertion: TEST_PROJECT_REF, tables, functions }).status, 'PASS');

  const unsafe = evaluateDeployedCatalog({
    project_ref_external_assertion: TEST_PROJECT_REF,
    tables: tables.map((row) => row.name === 'users' ? { ...row, exists: false } : row),
    functions: functions.map((row) => row.name === 'fn_create_sale' ? { ...row, anon_execute: true, settings: null } : row),
  });
  assert.equal(unsafe.status, 'BLOCKED');
  assert.ok(unsafe.missingTables.includes('users'));
  assert.ok(unsafe.unexpectedAnonExecute.includes('fn_create_sale'));
  assert.ok(unsafe.reviewFindings.unsafeDefinerSearchPath.includes('fn_create_sale'));
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
