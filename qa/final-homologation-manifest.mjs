import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TEST_PROJECT_REF = 'msinksoilkluooxenecy';
export const QA_BRANCH = 'automation/nexalvo-qa-actions';

export const knownTestEvidence = Object.freeze({
  source: 'previous approved Supabase integration results and CI 157 report',
  catalogDefinitionsSupplied: false,
  counts: {
    publicTablesWithRls: 31,
    publicPolicies: 53,
    publicFunctions: 50,
    tableGrantEntries: 391,
    securityDefinerAlerts: 35,
  },
  ci157: { jobsPassed: 12, checksPassed: 456, failures: 0, skipped: 0 },
});

export const baselineSources = Object.freeze([
  '08_supabase_data_phase1.sql',
  '09_supabase_data_phase2.sql',
  '10_supabase_data_phase3.sql',
  '11_supabase_data_phase4.sql',
  '12_phase4_cash_safety_hotfix.sql',
  '13_phase4_cash_live_balance_hotfix.sql',
  '14_supabase_data_phase5_loyalty.sql',
  'supabase/migrations/20261007160955_nexalvo_recipe_tenant_reference_guard.sql',
]);

export const applicationContract = Object.freeze({
  tables: [
    'audit_logs', 'business_alerts', 'business_settings_lists', 'businesses',
    'cash_flow', 'cash_registers', 'customers', 'employees', 'expenses',
    'inventory_items', 'locations', 'loyalty_rewards', 'loyalty_transactions',
    'product_recipes', 'products', 'purchase_order_payments', 'purchase_orders',
    'sale_items', 'sales', 'shift_breaks', 'shifts', 'suppliers', 'task_activity',
    'tasks', 'users',
  ],
  functions: [
    'current_business_id', 'fn_add_initial_stock', 'fn_adjust_inventory_count',
    'fn_advance_sale_fulfillment', 'fn_cancel_purchase_order', 'fn_clock_in',
    'fn_clock_out', 'fn_close_cash_register', 'fn_commit_loyalty_for_sale',
    'fn_create_expense', 'fn_create_purchase_order', 'fn_create_sale',
    'fn_dismiss_alert', 'fn_end_break', 'fn_manual_loyalty_adjustment',
    'fn_manage_staff_profile',
    'fn_open_cash_register', 'fn_pay_purchase_order', 'fn_read_employees_secure',
    'fn_read_inventory_stock_secure', 'fn_read_inventory_transactions_secure',
    'fn_read_purchase_order_items_secure', 'fn_read_sale_items_secure',
    'fn_receive_manual_stock', 'fn_receive_purchase_order',
    'fn_reconcile_business_alerts', 'fn_record_cash_movement', 'fn_record_waste',
    'fn_reverse_expense', 'fn_reverse_loyalty_for_sale', 'fn_reverse_po_payment',
    'fn_reverse_purchase_order', 'fn_reverse_sale', 'fn_save_product',
    'fn_save_task', 'fn_start_break', 'fn_toggle_task_status',
    'fn_transfer_inventory', 'fn_write_audit', 'user_can',
  ],
  edgeFunctions: ['manage-staff-user', 'platform-admin'],
  privateStorageBuckets: ['nexalvo-product-images'],
});

// `status` is evidence, not intent. Only one database migration below has documented proof of
// installation in TEST. A prepared artifact must never be promoted to `deployed_test` merely
// because its source or static regression passes.
export const deliveryUnits = Object.freeze([
  {
    id: 'cash-sale-open-register-guard',
    status: 'deployed_test',
    apply: 'migrations/20261013_cash_register_required_for_cash_sales_TEST.sql',
    verify: 'qa/sql/p0_03_cash_register_guard_rollback_TEST.sql',
    rollback: null,
    dependsOn: ['baseline-schema'],
    deployedFingerprint: 'aabbddc8a9c4a37a171b8a269e9c3139',
    authorization: 'already_applied_test_evidence',
  },
  {
    id: 'cash-register-finite-guard',
    status: 'prepared_unapplied',
    apply: 'migrations/20261015_cash_register_finite_guard_TEST.sql',
    verify: 'qa/sql/p0_03_cash_register_finite_rollback_TEST.sql',
    rollback: null,
    rollbackStrategy: 'restore_reviewed_preapply_function_definition',
    dependsOn: ['baseline-schema'],
    authorization: 'test_migration_required',
  },
  {
    id: 'expense-cash-normalization',
    status: 'prepared_unapplied',
    apply: 'migrations/20261015_expense_cash_normalization_TEST.sql',
    verify: 'qa/sql/p0_03_expense_cash_normalization_rollback_TEST.sql',
    rollback: null,
    rollbackStrategy: 'restore_reviewed_preapply_function_definition',
    dependsOn: ['cash-register-finite-guard'],
    authorization: 'test_migration_required',
  },
  {
    id: 'expense-request-idempotency',
    status: 'prepared_unapplied',
    apply: 'migrations/20261015_expense_idempotency_TEST.sql',
    verify: 'qa/sql/p0_03_expense_idempotency_rollback_TEST.sql',
    rollback: 'migrations/20261015_expense_idempotency_rollback_TEST.sql',
    dependsOn: ['expense-cash-normalization'],
    authorization: 'test_migration_required',
    featureFlag: 'VITE_EXPENSE_IDEMPOTENCY_ENABLED',
  },
  {
    id: 'purchase-request-idempotency',
    status: 'prepared_unapplied',
    apply: 'migrations/20261012_purchase_order_idempotency_TEST.sql',
    verify: 'qa/sql/p0_05_purchase_lifecycle_rollback_TEST.sql',
    rollback: 'migrations/20261012_purchase_order_idempotency_rollback_TEST.sql',
    dependsOn: ['baseline-schema'],
    authorization: 'test_migration_required',
    featureFlag: 'VITE_PURCHASE_IDEMPOTENCY_ENABLED',
  },
  {
    id: 'staff-user-service',
    status: 'prepared_unapplied',
    apply: 'migrations/20261017_manage_staff_user_TEST.sql',
    verify: 'qa/sql/manage_staff_user_preflight_readonly_TEST.sql',
    rollback: 'migrations/20261017_manage_staff_user_rollback_TEST.sql',
    edge: 'supabase/functions/manage-staff-user/index.ts',
    dependsOn: ['baseline-schema', 'deployed-catalog-reviewed'],
    authorization: 'test_migration_deploy_and_invitation_required',
  },
  {
    id: 'product-image-storage',
    status: 'prepared_unapplied',
    apply: 'migrations/20261016_product_images_storage_TEST.sql',
    verify: 'qa/sql/product_images_storage_preflight_readonly_TEST.sql',
    rollback: 'migrations/20261016_product_images_storage_rollback_TEST.sql',
    dependsOn: ['baseline-schema', 'deployed-catalog-reviewed'],
    authorization: 'test_migration_and_fixture_write_required',
  },
  {
    id: 'platform-admin-control-plane',
    status: 'prepared_unapplied',
    apply: 'migrations/20261016_platform_admin_TEST.sql',
    verify: 'qa/sql/platform_admin_preflight_readonly_TEST.sql',
    rollback: 'migrations/20261016_platform_admin_rollback_TEST.sql',
    dependsOn: ['baseline-schema', 'deployed-catalog-reviewed'],
    authorization: 'test_migration_deploy_and_superadmin_required',
    unresolvedGate: 'global_suspension_enforcement_requires_deployed_rls_and_rpc_catalog',
  },
]);

export const executionOrder = Object.freeze([
  'run-local-regressions',
  'export-deployed-catalog-readonly',
  'review-rls-grants-security-definer-and-collisions',
  'obtain-separate-test-migration-authorization',
  'apply-one-delivery-unit',
  'run-unit-readonly-preflight-and-rollback-transaction-proof',
  'run-standard-qa-ci-with-feature-flag-off',
  'enable-one-test-feature-flag',
  'run-authorized-isolated-real-flow-and-compensation',
  'record-zero-active-residue-and-audit-history',
]);

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const resolveRepo = (relativePath) => new URL(relativePath, pathToFileURL(ROOT));

export function artifactInventory() {
  const deliveryArtifacts = deliveryUnits.flatMap((unit) => ['apply', 'verify', 'rollback', 'edge']
    .filter((kind) => unit[kind])
    .map((kind) => {
      const path = unit[kind];
      const url = resolveRepo(path);
      if (!existsSync(url)) return { unit: unit.id, kind, path, exists: false, sha256: null };
      const body = readFileSync(url);
      return {
        unit: unit.id,
        kind,
        path,
        exists: true,
        sha256: createHash('sha256').update(body).digest('hex'),
      };
    }));
  const sources = baselineSources.map((path) => {
    const url = resolveRepo(path);
    if (!existsSync(url)) return { unit: 'baseline-schema', kind: 'source', path, exists: false, sha256: null };
    return {
      unit: 'baseline-schema', kind: 'source', path, exists: true,
      sha256: createHash('sha256').update(readFileSync(url)).digest('hex'),
    };
  });
  return [...sources, ...deliveryArtifacts];
}

export function validateLocalPackage() {
  const errors = [];
  const ids = new Set(deliveryUnits.map((unit) => unit.id));
  for (const artifact of artifactInventory()) {
    if (!artifact.exists) errors.push(`missing artifact: ${artifact.path}`);
  }
  for (const unit of deliveryUnits) {
    for (const dependency of unit.dependsOn) {
      if (!ids.has(dependency) && !['baseline-schema', 'deployed-catalog-reviewed'].includes(dependency)) {
        errors.push(`${unit.id}: unknown dependency ${dependency}`);
      }
    }
    if (unit.status === 'prepared_unapplied') {
      const sql = readFileSync(resolveRepo(unit.apply), 'utf8');
      if (!/TEST(?:-only| only| ONLY)|Supabase TEST/i.test(sql)) errors.push(`${unit.id}: TEST-only marker missing`);
      if (!/PREPARED|not apply|NOT EXECUTED/i.test(sql)) errors.push(`${unit.id}: unapplied marker missing`);
    }
  }
  const workflow = readFileSync(resolveRepo('.github/workflows/nexalvo-test.yml'), 'utf8');
  for (const unit of deliveryUnits.filter((candidate) => candidate.status === 'prepared_unapplied')) {
    if (workflow.includes(`psql`) && workflow.includes(unit.apply)) errors.push(`${unit.id}: migration wired into default CI`);
  }
  return { ok: errors.length === 0, errors, artifacts: artifactInventory() };
}

export function evaluateDeployedCatalog(catalog) {
  const tables = new Map((catalog?.tables || []).map((row) => [row.name, row]));
  const functions = new Map((catalog?.functions || []).map((row) => [row.name, row]));
  const missingTables = applicationContract.tables.filter((name) => !tables.has(name) || tables.get(name).exists === false);
  const missingFunctions = applicationContract.functions.filter((name) => !functions.has(name));
  const tablesWithoutRls = applicationContract.tables.filter((name) => tables.has(name)
    && tables.get(name).exists !== false && tables.get(name).rls !== true);
  const unexpectedAnonExecute = (catalog?.functions || [])
    .filter((row) => row.anon_execute === true && applicationContract.functions.includes(row.name))
    .map((row) => row.name).sort();
  const unsafeDefinerSearchPath = (catalog?.functions || [])
    .filter((row) => row.security_definer === true && !String(row.settings || '').includes('search_path'))
    .map((row) => row.name).sort();
  const expectedCounts = knownTestEvidence.counts;
  const observedCounts = catalog?.counts || {};
  const countMismatches = [
    ['public_rls_tables', expectedCounts.publicTablesWithRls],
    ['public_policies', expectedCounts.publicPolicies],
    ['public_functions', expectedCounts.publicFunctions],
  ].filter(([key, expected]) => Number.isFinite(Number(observedCounts[key])) && Number(observedCounts[key]) !== expected)
    .map(([key, expected]) => ({ key, expected, observed: Number(observedCounts[key]) }));
  const projectConfirmed = catalog?.project_ref_external_assertion === TEST_PROJECT_REF;
  const blockers = [];
  if (!projectConfirmed) blockers.push('TEST project reference was not externally asserted');
  if (missingTables.length) blockers.push(`missing application tables: ${missingTables.join(', ')}`);
  if (missingFunctions.length) blockers.push(`missing application functions: ${missingFunctions.join(', ')}`);
  if (tablesWithoutRls.length) blockers.push(`application tables without RLS: ${tablesWithoutRls.join(', ')}`);
  if (unexpectedAnonExecute.length) blockers.push(`application RPCs executable by anon: ${unexpectedAnonExecute.join(', ')}`);
  // A SECURITY DEFINER/search_path entry is a review finding until its body and effective grants
  // prove exploitability. It is deliberately reported separately from blockers/vulnerabilities.
  return {
    status: blockers.length ? 'BLOCKED' : 'PASS',
    blockers,
    reviewFindings: { unsafeDefinerSearchPath, countMismatches },
    missingTables,
    missingFunctions,
    tablesWithoutRls,
    unexpectedAnonExecute,
  };
}

function parseCatalog(path) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function main() {
  const local = validateLocalPackage();
  const catalogFlag = process.argv.indexOf('--catalog');
  const assertionFlag = process.argv.includes('--assert-test-project');
  const catalogPayload = catalogFlag >= 0 && process.argv[catalogFlag + 1]
    ? parseCatalog(process.argv[catalogFlag + 1])
    : null;
  if (catalogPayload && assertionFlag) catalogPayload.project_ref_external_assertion = TEST_PROJECT_REF;
  const catalog = catalogPayload
    ? evaluateDeployedCatalog(catalogPayload)
    : { status: 'BLOCKED', blockers: ['deployed TEST catalog export not supplied'] };
  const report = {
    target: { projectRef: TEST_PROJECT_REF, branch: QA_BRANCH },
    knownTestEvidence,
    baselineSources: baselineSources.map((path) => ({ path, status: 'source_snapshot_deployment_not_inferred' })),
    local: { status: local.ok ? 'PASS' : 'FAIL', errors: local.errors, artifacts: local.artifacts },
    deployedCatalog: catalog,
    deliveryUnits,
    executionOrder,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!local.ok) process.exitCode = 1;
  else if (catalogFlag >= 0 && catalog.status !== 'PASS') process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
