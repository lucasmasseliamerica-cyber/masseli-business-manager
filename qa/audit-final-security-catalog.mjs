#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

export const TEST_PROJECT_REF = 'msinksoilkluooxenecy';
const EVIDENCE_VERSION = 1;

const SECRET_PATTERNS = Object.freeze({
  private_key: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
  jwt: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  supabase_secret: /\bsb_secret_[A-Za-z0-9_-]{8,}\b/gi,
  aws_access_key: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  credential_uri: /(?:postgres(?:ql)?|https?):\/\/[^\s:/]+:[^\s/@]+@/gi,
  assigned_secret_literal: /(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*(?::=|=>|=)\s*['"][^'"\r\n]{6,}['"]/gi,
  email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hashJson = (value) => sha256(JSON.stringify(value));

export function normalizeCatalogExport(value) {
  let candidate = value;
  if (Array.isArray(candidate)) {
    if (candidate.length !== 1) throw new Error('catalog export must contain exactly one row');
    [candidate] = candidate;
  }
  if (candidate?.final_homologation_catalog) candidate = candidate.final_homologation_catalog;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('invalid catalog export envelope');
  return candidate;
}

function walkStrings(value, visit, pointer = '$') {
  if (Array.isArray(value)) value.forEach((child, index) => walkStrings(child, visit, `${pointer}[${index}]`));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => walkStrings(child, visit, `${pointer}.${key}`));
  else if (typeof value === 'string') visit(value, pointer);
}

export function scanSecrets(value) {
  const findings = [];
  walkStrings(value, (text, pointer) => {
    for (const [kind, source] of Object.entries(SECRET_PATTERNS)) {
      const pattern = new RegExp(source.source, source.flags);
      for (const match of text.matchAll(pattern)) findings.push({
        kind,
        pointer_sha256_16: sha256(pointer).slice(0, 16),
        match_sha256_16: sha256(match[0]).slice(0, 16),
      });
    }
  });
  return {
    passed: findings.length === 0,
    counts: Object.fromEntries(Object.keys(SECRET_PATTERNS).map((kind) => [kind, findings.filter((item) => item.kind === kind).length])),
    findings,
  };
}

function sourceFiles(root) {
  const output = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.sql')) output.push(path);
    }
  };
  walk(root);
  return output.sort();
}

function normalizeBody(value) {
  return value.replace(/\r\n/g, '\n').replace(/^\s*--.*$/gm, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function extractBody(definition) {
  const match = definition.match(/\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\1/i);
  return match?.[2] || '';
}

export function compareVersionedFunctions(catalog, root) {
  const deployedByName = new Map();
  for (const row of catalog.functions || []) {
    if (!deployedByName.has(row.name)) deployedByName.set(row.name, []);
    deployedByName.get(row.name).push(row);
  }
  const candidates = [];
  const definitionPattern = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)[\s\S]*?\bAS\s+(\$[A-Za-z0-9_]*\$)([\s\S]*?)\3/gi;
  for (const path of sourceFiles(root)) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(definitionPattern)) {
      const rows = deployedByName.get(match[1]) || [];
      const bodyHash = sha256(normalizeBody(match[4]));
      candidates.push({
        name: match[1],
        path: relative(root, path).replaceAll('\\', '/'),
        source_body_sha256: bodyHash,
        deployed: rows.length > 0,
        normalized_body_match: rows.some((row) => sha256(normalizeBody(extractBody(row.definition || ''))) === bodyHash),
      });
    }
  }
  const covered = [...new Set(candidates.filter((row) => row.deployed).map((row) => row.name))].sort();
  const deployedNames = [...deployedByName.keys()].sort();
  return {
    deployed_function_count: deployedNames.length,
    deployed_with_versioned_definition_count: covered.length,
    deployed_with_versioned_definition: covered,
    deployed_without_versioned_definition: deployedNames.filter((name) => !covered.includes(name)),
    candidates,
  };
}

const grantMatrix = (rows) => {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.table_name}\0${row.grantee}`;
    if (!map.has(key)) map.set(key, { table_name: row.table_name, grantee: row.grantee, privileges: [] });
    map.get(key).privileges.push(row.privilege_type);
  }
  return [...map.values()].map((row) => ({ ...row, privileges: [...new Set(row.privileges)].sort() }))
    .sort((a, b) => `${a.table_name}:${a.grantee}`.localeCompare(`${b.table_name}:${b.grantee}`));
};

const columnGrantMatrix = (rows, sensitiveTables) => {
  const map = new Map();
  for (const row of rows.filter((candidate) => sensitiveTables.has(candidate.table_name))) {
    const key = `${row.table_name}\0${row.grantee}\0${row.privilege_type}`;
    if (!map.has(key)) map.set(key, { table_name: row.table_name, grantee: row.grantee, privilege: row.privilege_type, columns: [] });
    map.get(key).columns.push(row.column_name);
  }
  return [...map.values()].map((row) => ({ ...row, columns: [...new Set(row.columns)].sort() }))
    .sort((a, b) => `${a.table_name}:${a.grantee}:${a.privilege}`.localeCompare(`${b.table_name}:${b.grantee}:${b.privilege}`));
};

function functionEvidence(row) {
  const definition = row.definition || '';
  const externalSchemas = [...new Set([...definition.matchAll(/\b(nexalvo_[a-z0-9_]+)\./gi)].map((match) => match[1].toLowerCase()))].sort();
  return {
    ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'definition')),
    definition_sha256: sha256(definition),
    definition_length: definition.length,
    security_signals: {
      auth_uid: /auth\.uid\s*\(/i.test(definition),
      current_business_id: /current_business_id\s*\(/i.test(definition),
      user_can: /user_can\s*\(/i.test(definition),
      dynamic_execute: /\bEXECUTE\s+(?:format\s*\(|[^;]*\|\|)/i.test(definition),
      set_role: /\bSET\s+(?:LOCAL\s+)?ROLE\b/i.test(definition),
      external_schemas: externalSchemas,
    },
  };
}

export function buildSanitizedEvidence(input, { sourceBytes, root }) {
  const catalog = normalizeCatalogExport(input);
  if (catalog.project_ref_expected !== TEST_PROJECT_REF) throw new Error('catalog is not pinned to the authorized TEST project');
  const secretScan = scanSecrets(input);
  if (!secretScan.passed) throw new Error(`secret/PII scan failed with ${secretScan.findings.length} finding(s)`);
  const sensitiveTables = new Set(['employees', 'users', 'sales', 'cash_flow', 'cash_registers', 'expenses', 'inventory_stock', 'inventory_transactions', 'purchase_orders', 'purchase_order_items', 'purchase_order_payments', 'sale_items', 'task_activity', 'waste_transactions']);
  const policies = catalog.all_policies || [];
  const tableGrants = catalog.all_table_grants || [];
  const columnGrants = catalog.all_column_grants || [];
  const functionRows = catalog.functions || [];
  const employeesPolicy = policies.find((row) => row.tablename === 'employees' && row.policyname === 'employees_select');
  const usersPolicy = policies.find((row) => row.tablename === 'users' && row.policyname === 'users_select');
  const employeeTableSelect = tableGrants.some((row) => row.table_name === 'employees' && row.grantee === 'authenticated' && row.privilege_type === 'SELECT');
  const employeeSalarySelect = columnGrants.some((row) => row.table_name === 'employees' && row.column_name === 'hourly_rate' && row.grantee === 'authenticated' && row.privilege_type === 'SELECT');
  const saleItemCostSelect = columnGrants.some((row) => row.table_name === 'sale_items' && row.column_name === 'unit_cost_snapshot' && row.grantee === 'authenticated' && row.privilege_type === 'SELECT');
  const saleItemsPolicy = policies.find((row) => row.tablename === 'sale_items' && row.policyname === 'sale_items_select');
  const legacyStaffProfile = functionRows.find((row) => row.name === 'fn_save_user_profile');
  const legacyStaffDefinition = legacyStaffProfile?.definition || '';
  const legacyStaffPrivilegeEscalation = legacyStaffProfile?.authenticated_execute === true
    && /user_can\s*\(\s*'manageUsers'/i.test(legacyStaffDefinition)
    && /permission_overrides\s*=\s*case/i.test(legacyStaffDefinition)
    && !/only an owner can change roles or permission overrides/i.test(legacyStaffDefinition);
  const publicSchema = (catalog.schema_security || []).find((row) => row.schema_name === 'public');
  const definerPublic = functionRows.filter((row) => row.security_definer && (row.settings || []).includes('search_path=public'));
  const publicPolicies = policies.filter((row) => (row.roles || []).includes('public'));
  const defaultPublicFunctionAcl = (catalog.default_privileges || []).filter((row) => row.schema_name === 'public' && row.object_type === 'f');
  const privateRefs = [...new Set(functionRows.flatMap((row) => functionEvidence(row).security_signals.external_schemas))].sort();
  const comparison = compareVersionedFunctions(catalog, root);
  return {
    evidence_version: EVIDENCE_VERSION,
    target: { project_ref: TEST_PROJECT_REF, branch: 'automation/nexalvo-qa-actions' },
    source: {
      basename: basename('final_homologation_security_definitions_readonly_TEST.json'),
      sha256: sha256(sourceBytes),
      bytes: sourceBytes.length,
      raw_versioned: false,
      secret_scan: secretScan,
    },
    counts: catalog.counts,
    exported_array_counts: Object.fromEntries(Object.entries(catalog).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])),
    security_definitions_complete_at_source: catalog.security_definitions_complete === true,
    migration_markers: catalog.migration_markers || {},
    tables: catalog.tables || [],
    functions: functionRows.map(functionEvidence),
    policies,
    grants: {
      all_table_grants_sha256: hashJson(tableGrants),
      all_table_grants_count: tableGrants.length,
      table_matrix: grantMatrix(tableGrants),
      all_column_grants_sha256: hashJson(columnGrants),
      all_column_grants_count: columnGrants.length,
      sensitive_column_matrix: columnGrantMatrix(columnGrants, sensitiveTables),
    },
    schema_security: catalog.schema_security || [],
    default_privileges: catalog.default_privileges || [],
    public_columns: catalog.public_columns || [],
    public_constraints: (catalog.public_constraints || []).map((row) => ({ ...row, definition_sha256: sha256(row.definition || '') })),
    public_indexes: (catalog.public_indexes || []).map((row) => ({ table_name: row.table_name, index_name: row.index_name, definition_sha256: sha256(row.definition || '') })),
    public_triggers: (catalog.public_triggers || []).map((row) => ({ ...row, definition_sha256: sha256(row.definition || '') })),
    public_views: catalog.public_views || [],
    storage_policies: catalog.storage_policies || [],
    versioned_function_comparison: comparison,
    audit_facts: {
      confirmed: {
        authenticated_employee_table_select: employeeTableSelect,
        authenticated_hourly_rate_select: employeeSalarySelect,
        authenticated_sale_item_cost_select: saleItemCostSelect,
        employees_policy_roles: employeesPolicy?.roles || [],
        employees_policy_qual_sha256: sha256(employeesPolicy?.qual || ''),
        users_policy_roles: usersPolicy?.roles || [],
        users_policy_qual_sha256: sha256(usersPolicy?.qual || ''),
        sale_items_policy_roles: saleItemsPolicy?.roles || [],
        sale_items_policy_qual_sha256: sha256(saleItemsPolicy?.qual || ''),
        legacy_staff_profile_authenticated_execute: legacyStaffProfile?.authenticated_execute === true,
        legacy_staff_profile_non_owner_override_escalation: legacyStaffPrivilegeEscalation,
        legacy_staff_profile_fingerprint: legacyStaffProfile?.fingerprint || null,
      },
      conditional: {
        policies_assigned_to_public: publicPolicies.map((row) => `${row.tablename}.${row.policyname}`).sort(),
        security_definer_search_path_public: definerPublic.map((row) => `${row.name}(${row.arguments})`).sort(),
        authenticated_can_create_in_public: publicSchema?.authenticated_create === true,
        anon_can_create_in_public: publicSchema?.anon_create === true,
        public_default_function_acls: defaultPublicFunctionAcl,
        referenced_private_schemas_not_exported: privateRefs,
      },
      effective_denials: {
        anon_function_execute_count: functionRows.filter((row) => row.anon_execute).length,
        anon_table_grant_count: tableGrants.filter((row) => row.grantee === 'anon').length,
      },
    },
  };
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function main() {
  const inputPath = option('--input');
  const outputPath = option('--output');
  if (!inputPath || !outputPath) throw new Error('usage: node qa/audit-final-security-catalog.mjs --input <raw.json> --output <sanitized.json>');
  const sourceBytes = readFileSync(resolve(inputPath));
  const input = JSON.parse(sourceBytes.toString('utf8'));
  const root = resolve(new URL('../', import.meta.url).pathname);
  const evidence = buildSanitizedEvidence(input, { sourceBytes, root });
  writeFileSync(resolve(outputPath), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({
    status: 'PASS',
    output: outputPath,
    source_sha256: evidence.source.sha256,
    secret_findings: evidence.source.secret_scan.findings.length,
    functions: evidence.functions.length,
    policies: evidence.policies.length,
    table_grants: evidence.grants.all_table_grants_count,
    column_grants: evidence.grants.all_column_grants_count,
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) main();
