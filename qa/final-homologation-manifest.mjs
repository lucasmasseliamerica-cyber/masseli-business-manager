import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TEST_PROJECT_REF = 'msinksoilkluooxenecy';
export const QA_BRANCH = 'automation/nexalvo-qa-actions';

export const knownTestEvidence = Object.freeze({
  source: 'complete read-only TEST security catalog received 2026-10-17 and CI 159 report',
  catalogDefinitionsSupplied: 'complete_raw_reviewed_sanitized_evidence_versioned',
  counts: {
    publicTablesWithRls: 31,
    publicPolicies: 53,
    publicFunctions: 58,
    tableGrantEntries: 568,
    securityDefinerFunctions: 48,
  },
  ci159: { jobsPassed: 12, checksPassed: 470, failures: 0, skipped: 0 },
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

export const auditArtifacts = Object.freeze([
  'qa/evidence/final-homologation-catalog-20261017.json',
  'qa/evidence/final-homologation-security-sanitized-20261017.json',
  'qa/audit-final-security-catalog.mjs',
  'qa/sql/final_homologation_security_definitions_readonly_TEST.sql',
  'qa/sql/final_homologation_private_security_definitions_readonly_TEST.sql',
  'qa/sql/final_homologation_permission_defaults_readonly_TEST.sql',
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

// PostgreSQL identity signatures used by the browser and server contracts. This catches renamed,
// removed or type-shifted parameters before PostgREST turns the drift into a runtime RPC failure.
export const functionSignatureContract = Object.freeze({
  current_business_id: '',
  fn_add_initial_stock: 'p_business_id uuid, p_name text, p_sku text, p_category text, p_unit text, p_min_qty numeric, p_max_qty numeric, p_supplier_id uuid, p_location_id uuid, p_expires_at timestamp with time zone, p_notes text, p_starting_qty numeric, p_starting_cost numeric',
  fn_adjust_inventory_count: 'p_business_id uuid, p_inventory_item_id uuid, p_location_id uuid, p_new_qty numeric, p_reason text, p_notes text',
  fn_advance_sale_fulfillment: 'p_sale_id uuid',
  fn_cancel_purchase_order: 'p_purchase_order_id uuid',
  fn_clock_in: 'p_business_id uuid, p_employee_id uuid, p_location_id uuid, p_notes text',
  fn_clock_out: 'p_employee_id uuid',
  fn_close_cash_register: 'p_register_id uuid, p_actual_cash numeric, p_difference_reason text, p_notes text',
  fn_commit_loyalty_for_sale: 'p_sale_id uuid, p_redeemed_reward_id uuid',
  fn_create_expense: 'p_business_id uuid, p_location_id uuid, p_expense_date date, p_category text, p_vendor text, p_amount numeric, p_payment_method text, p_recurring boolean, p_notes text',
  fn_create_purchase_order: 'p_business_id uuid, p_supplier_id uuid, p_location_id uuid, p_order_date date, p_expected_date date, p_status text, p_payment_method text, p_notes text, p_discount numeric, p_tax numeric, p_items jsonb',
  fn_create_sale: 'p_sale_id uuid, p_business_id uuid, p_location_id uuid, p_channel text, p_payment_method text, p_employee_id uuid, p_customer_id uuid, p_discount numeric, p_tax numeric, p_notes text, p_fulfillment_status text, p_items jsonb',
  fn_dismiss_alert: 'p_alert_id uuid',
  fn_end_break: 'p_employee_id uuid',
  fn_manual_loyalty_adjustment: 'p_business_id uuid, p_customer_id uuid, p_type text, p_points numeric, p_reason text',
  fn_manage_staff_profile: 'p_operation text, p_actor_user_id uuid, p_target_user_id uuid, p_business_id uuid, p_employee_id uuid, p_name text, p_username text, p_role text, p_permission_overrides jsonb, p_active boolean',
  fn_open_cash_register: 'p_business_id uuid, p_location_id uuid, p_opening_cash numeric, p_notes text',
  fn_pay_purchase_order: 'p_purchase_order_id uuid, p_amount numeric, p_payment_method text',
  fn_read_employees_secure: '',
  fn_read_inventory_stock_secure: '',
  fn_read_inventory_transactions_secure: '',
  fn_read_purchase_order_items_secure: '',
  fn_read_sale_items_secure: '',
  fn_receive_manual_stock: 'p_business_id uuid, p_inventory_item_id uuid, p_location_id uuid, p_qty numeric, p_notes text',
  fn_receive_purchase_order: 'p_purchase_order_id uuid, p_receive_lines jsonb',
  fn_reconcile_business_alerts: 'p_business_id uuid, p_candidates jsonb',
  fn_record_cash_movement: 'p_register_id uuid, p_movement_type text, p_amount numeric, p_reason text, p_notes text',
  fn_record_waste: 'p_business_id uuid, p_inventory_item_id uuid, p_location_id uuid, p_qty numeric, p_reason text, p_notes text',
  fn_reverse_expense: 'p_expense_id uuid',
  fn_reverse_loyalty_for_sale: 'p_sale_id uuid',
  fn_reverse_po_payment: 'p_payment_id uuid',
  fn_reverse_purchase_order: 'p_purchase_order_id uuid',
  fn_reverse_sale: 'p_sale_id uuid',
  fn_save_product: 'p_business_id uuid, p_product_id uuid, p_operation text, p_name text, p_sku text, p_category text, p_price numeric, p_active boolean, p_description text, p_image_url text, p_recipe jsonb',
  fn_save_task: 'p_business_id uuid, p_task_id uuid, p_operation text, p_title text, p_assigned_to uuid, p_due_date date, p_priority text, p_notes text',
  fn_start_break: 'p_employee_id uuid',
  fn_toggle_task_status: 'p_task_id uuid, p_status text',
  fn_transfer_inventory: 'p_business_id uuid, p_inventory_item_id uuid, p_from_location_id uuid, p_to_location_id uuid, p_qty numeric, p_notes text',
  fn_write_audit: 'p_action text, p_details text',
  user_can: 'p_permission_key text',
});

export const knownDeployedFingerprints = Object.freeze({
  fn_create_sale: 'aabbddc8a9c4a37a171b8a269e9c3139',
});

const preparedFunctionNames = new Set(['fn_manage_staff_profile']);

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
    id: 'catalog-security-hardening',
    status: 'prepared_unapplied',
    apply: 'migrations/20261017_catalog_security_hardening_TEST.sql',
    verify: 'qa/sql/catalog_security_hardening_preflight_readonly_TEST.sql',
    rollback: 'migrations/20261017_catalog_security_hardening_rollback_TEST.sql',
    dependsOn: ['baseline-schema', 'deployed-catalog-reviewed'],
    authorization: 'test_migration_required',
  },
  {
    id: 'cash-register-finite-guard',
    status: 'prepared_unapplied',
    apply: 'migrations/20261015_cash_register_finite_guard_TEST.sql',
    verify: 'qa/sql/p0_03_cash_register_finite_rollback_TEST.sql',
    rollback: null,
    rollbackStrategy: 'restore_reviewed_preapply_function_definition',
    dependsOn: ['baseline-schema', 'catalog-security-hardening'],
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
    dependsOn: ['baseline-schema', 'catalog-security-hardening'],
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
    dependsOn: ['baseline-schema', 'deployed-catalog-reviewed', 'catalog-security-hardening'],
    authorization: 'test_migration_deploy_and_invitation_required',
  },
  {
    id: 'product-image-storage',
    status: 'prepared_unapplied',
    apply: 'migrations/20261016_product_images_storage_TEST.sql',
    verify: 'qa/sql/product_images_storage_preflight_readonly_TEST.sql',
    rollback: 'migrations/20261016_product_images_storage_rollback_TEST.sql',
    dependsOn: ['baseline-schema', 'deployed-catalog-reviewed', 'catalog-security-hardening'],
    authorization: 'test_migration_and_fixture_write_required',
  },
  {
    id: 'platform-admin-control-plane',
    status: 'prepared_unapplied',
    apply: 'migrations/20261016_platform_admin_TEST.sql',
    verify: 'qa/sql/platform_admin_preflight_readonly_TEST.sql',
    rollback: 'migrations/20261016_platform_admin_rollback_TEST.sql',
    dependsOn: ['baseline-schema', 'deployed-catalog-reviewed', 'catalog-security-hardening'],
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
  const audits = auditArtifacts.map((path) => {
    const url = resolveRepo(path);
    if (!existsSync(url)) return { unit: 'deployed-catalog-review', kind: 'evidence', path, exists: false, sha256: null };
    return {
      unit: 'deployed-catalog-review', kind: 'evidence', path, exists: true,
      sha256: createHash('sha256').update(readFileSync(url)).digest('hex'),
    };
  });
  return [...sources, ...audits, ...deliveryArtifacts];
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

export function normalizeCatalogExport(value) {
  let candidate = value;
  if (Array.isArray(candidate)) {
    if (candidate.length !== 1) throw new Error('catalog export must contain exactly one result row');
    [candidate] = candidate;
  }
  if (candidate?.final_homologation_catalog) candidate = candidate.final_homologation_catalog;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('catalog export does not contain an object');
  }
  return candidate;
}

export function evaluateDeployedCatalog(input) {
  const catalog = normalizeCatalogExport(input);
  const functionRows = catalog.functions || [];
  const tables = new Map((catalog.tables || []).map((row) => [row.name, row]));
  const functionsByName = new Map();
  for (const row of functionRows) {
    if (!functionsByName.has(row.name)) functionsByName.set(row.name, []);
    functionsByName.get(row.name).push(row);
  }
  const missingTables = applicationContract.tables.filter((name) => !tables.has(name) || tables.get(name).exists === false);
  const missingFunctions = applicationContract.functions.filter((name) => !functionsByName.has(name));
  const plannedMissingFunctions = missingFunctions.filter((name) => preparedFunctionNames.has(name));
  const unexpectedMissingFunctions = missingFunctions.filter((name) => !preparedFunctionNames.has(name));
  const tablesWithoutRls = applicationContract.tables.filter((name) => tables.has(name)
    && tables.get(name).exists !== false && tables.get(name).rls !== true);
  const tablesReadableByAnon = (catalog.tables || [])
    .filter((row) => applicationContract.tables.includes(row.name)
      && row.exists !== false && row.anon_select === true)
    .map((row) => row.name).sort();
  const unexpectedAnonExecute = functionRows
    .filter((row) => row.anon_execute === true && applicationContract.functions.includes(row.name))
    .map((row) => row.name).sort();
  const missingDefinerSearchPath = functionRows
    .filter((row) => row.security_definer === true && !String(row.settings || '').includes('search_path'))
    .map((row) => row.name).sort();
  const definerSearchPathPublic = functionRows
    .filter((row) => row.security_definer === true
      && (row.settings || []).some((setting) => setting === 'search_path=public'))
    .map((row) => row.name).sort();
  const hardenedEmptySearchPath = functionRows
    .filter((row) => row.security_definer === true
      && (row.settings || []).some((setting) => setting === 'search_path=""'))
    .map((row) => row.name).sort();
  const signatureMismatches = [];
  const unexpectedOverloads = [];
  for (const [name, expected] of Object.entries(functionSignatureContract)) {
    const rows = functionsByName.get(name) || [];
    if (!rows.length) continue;
    if (!rows.some((row) => row.arguments === expected)) {
      signatureMismatches.push({ name, expected, observed: rows.map((row) => row.arguments).sort() });
    }
    if (rows.length > 1) unexpectedOverloads.push({ name, signatures: rows.map((row) => row.arguments).sort() });
  }
  const fingerprintMismatches = [];
  for (const [name, expected] of Object.entries(knownDeployedFingerprints)) {
    const rows = functionsByName.get(name) || [];
    if (rows.length && !rows.some((row) => row.fingerprint === expected)) {
      fingerprintMismatches.push({ name, expected, observed: rows.map((row) => row.fingerprint).sort() });
    }
  }
  const sensitivePolicies = catalog.sensitive_security?.policies || [];
  const sensitiveGrants = catalog.sensitive_security?.grants || [];
  const policyRows = catalog.all_policies || catalog.policies || sensitivePolicies;
  const tableGrantRows = catalog.all_table_grants || sensitiveGrants;
  const columnGrantRows = catalog.all_column_grants || [];
  const policiesAssignedToPublic = policyRows
    .filter((row) => Array.isArray(row.roles) && row.roles.includes('public'))
    .map((row) => `${row.tablename}.${row.policyname}`).sort();
  const anonSensitiveTableGrants = tableGrantRows
    .filter((row) => row.grantee === 'anon')
    .map((row) => `${row.table_name}:${row.privilege_type}`).sort();
  const authenticatedSalarySelect = columnGrantRows.some((row) => row.table_name === 'employees'
    && row.column_name === 'hourly_rate' && row.grantee === 'authenticated' && row.privilege_type === 'SELECT');
  const authenticatedSaleItemCostSelect = columnGrantRows.some((row) => row.table_name === 'sale_items'
    && row.column_name === 'unit_cost_snapshot' && row.grantee === 'authenticated' && row.privilege_type === 'SELECT');
  const legacyStaffProfile = functionRows.find((row) => row.name === 'fn_save_user_profile');
  const legacyStaffProfileAuthenticated = legacyStaffProfile?.authenticated_execute === true;
  const clientAuditWriter = functionRows.find((row) => row.name === 'fn_write_audit');
  const referencedPrivateSchemas = [...new Set(functionRows.flatMap((row) =>
    [...String(row.definition || '').matchAll(/\b(nexalvo_[a-z0-9_]+)\./gi)].map((match) => match[1].toLowerCase())))].sort();
  const publicFunctionDefaultAcls = (catalog.default_privileges || [])
    .filter((row) => row.schema_name === 'public' && row.object_type === 'f');
  const expectedCounts = knownTestEvidence.counts;
  const observedCounts = catalog.counts || {};
  const countMismatches = [
    ['public_rls_tables', expectedCounts.publicTablesWithRls],
    ['public_policies', expectedCounts.publicPolicies],
    ['public_functions', expectedCounts.publicFunctions],
    ['public_role_table_grant_entries', expectedCounts.tableGrantEntries],
    ['public_security_definer_functions', expectedCounts.securityDefinerFunctions],
  ].filter(([key, expected]) => Number.isFinite(Number(observedCounts[key])) && Number(observedCounts[key]) !== expected)
    .map(([key, expected]) => ({ key, expected, observed: Number(observedCounts[key]) }));
  const securityCoverage = {
    publicFunctions: Number(observedCounts.public_functions || 0),
    exportedFunctionMetadata: functionRows.length,
    functionDefinitions: functionRows.filter((row) => typeof row.definition === 'string' && row.definition.length > 0).length,
    publicPolicies: Number(observedCounts.public_policies || 0),
    exportedSensitivePolicies: sensitivePolicies.length,
    exportedPolicies: policyRows.length,
    tableGrantEntries: Number(observedCounts.public_role_table_grant_entries || 0),
    exportedSensitiveGrants: sensitiveGrants.length,
    exportedTableGrants: tableGrantRows.length,
    exportedColumnGrants: columnGrantRows.length,
  };
  const securityDefinitionsComplete = catalog.security_definitions_complete === true
    && securityCoverage.functionDefinitions === securityCoverage.publicFunctions
    && Array.isArray(catalog.all_policies) && catalog.all_policies.length === securityCoverage.publicPolicies
    && Array.isArray(catalog.all_table_grants) && catalog.all_table_grants.length === securityCoverage.tableGrantEntries;
  const projectConfirmed = catalog.project_ref_external_assertion === TEST_PROJECT_REF;
  const blockers = [];
  if (!projectConfirmed) blockers.push('TEST project reference was not externally asserted');
  if (missingTables.length) blockers.push(`missing application tables: ${missingTables.join(', ')}`);
  if (unexpectedMissingFunctions.length) blockers.push(`missing deployed application functions: ${unexpectedMissingFunctions.join(', ')}`);
  if (plannedMissingFunctions.length) blockers.push(`prepared application functions not deployed: ${plannedMissingFunctions.join(', ')}`);
  if (tablesWithoutRls.length) blockers.push(`application tables without RLS: ${tablesWithoutRls.join(', ')}`);
  if (tablesReadableByAnon.length) blockers.push(`application tables readable by anon: ${tablesReadableByAnon.join(', ')}`);
  if (unexpectedAnonExecute.length) blockers.push(`application RPCs executable by anon: ${unexpectedAnonExecute.join(', ')}`);
  if (signatureMismatches.length) blockers.push('deployed RPC signatures differ from the application contract');
  if (fingerprintMismatches.length) blockers.push('deployed function fingerprints differ from reviewed evidence');
  if (unexpectedOverloads.length) blockers.push('application RPC names have unexpected overloads');
  if (!securityDefinitionsComplete) blockers.push('full function definitions, policies and effective grants are not exported');
  // A SECURITY DEFINER/search_path=public entry and a policy assigned to PUBLIC remain review
  // findings until the function body, schema ACL and effective grants establish impact.
  return {
    status: blockers.length ? 'BLOCKED' : 'PASS',
    blockers,
    reviewFindings: {
      missingDefinerSearchPath,
      definerSearchPathPublic,
      hardenedEmptySearchPath,
      policiesAssignedToPublic,
      anonSensitiveTableGrants,
      authenticatedSalarySelect,
      authenticatedSaleItemCostSelect,
      legacyStaffProfileAuthenticated,
      clientAuditWriterAuthenticated: clientAuditWriter?.authenticated_execute === true,
      referencedPrivateSchemas,
      publicFunctionDefaultAcls,
      countMismatches,
    },
    securityCoverage,
    securityDefinitionsComplete,
    missingTables,
    missingFunctions,
    plannedMissingFunctions,
    unexpectedMissingFunctions,
    tablesWithoutRls,
    tablesReadableByAnon,
    unexpectedAnonExecute,
    signatureMismatches,
    fingerprintMismatches,
    unexpectedOverloads,
    migrationMarkers: catalog.migration_markers || {},
  };
}

function parseCatalog(path) {
  return normalizeCatalogExport(JSON.parse(readFileSync(path, 'utf8')));
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
