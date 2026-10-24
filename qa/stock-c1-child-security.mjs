// Catalog metadata only. No filesystem, Auth, SQL execution, environment or network.
// A digest must come from independent review; calculating this digest is not that review.
import { createHash } from 'node:crypto';
import { STOCK_FINGERPRINTS, STOCK_PRECISION_TARGET_FINGERPRINT, STOCK_TABLES, StockSignal } from './stock-journey-core.mjs';
import { C1_AUDIT_CONTRACT } from './stock-c1-audit-contract.mjs';
import { STOCK_WASTE_READER_CONTRACT } from './stock-waste-reader-contract.mjs';

export const C1_CHILD_SECURITY_TABLES = Object.freeze([...STOCK_TABLES, 'users', 'businesses', 'role_default_permissions']);
// The browser may issue this read-only POST helper outside the mutation budget.
// Pin the exact reviewed source and attributes; never infer read-only behavior from its name.
export const C1_CHILD_SESSION_STATUS_CONTRACT = Object.freeze({
  source: 'migrations/20261016_platform_admin_TEST.sql',
  signature: 'public.fn_session_access_status()',
  body_fingerprint: '76ef113c8bba3a485dea824f72fddc36',
  body_sha256: '113028f7873eed5445cf1e13274ac4a484256b7a65484d93e990625cb432b784',
});
const pathsInPublic = new Set(['fn_adjust_inventory_count', 'fn_transfer_inventory', 'fn_record_waste', 'fn_record_inventory_movement']);
const readers = new Set(['fn_read_inventory_stock_secure', 'fn_read_inventory_transactions_secure',
  'fn_read_purchase_order_items_secure', 'fn_read_waste_transactions_secure']);
const fingerprints = Object.freeze({ ...STOCK_FINGERPRINTS,
  fn_record_inventory_movement: STOCK_PRECISION_TARGET_FINGERPRINT });
const functionNames = Object.freeze([...Object.keys(fingerprints), 'fn_write_audit',
  'fn_read_waste_transactions_secure', 'fn_session_access_status']);
const tablePrivileges = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];
const columnPrivileges = ['select', 'insert', 'update', 'references'];
const bool = value => value === true || value === false;
const text = value => typeof value === 'string' && value.length > 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const rootOf = input => {
  const value = Array.isArray(input) && input.length === 1 ? input[0] : input;
  return value?.stock_c1_child_security || value;
};

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => {
    const left = JSON.stringify(a), right = JSON.stringify(b); return left < right ? -1 : left > right ? 1 : 0;
  });
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  throw new StockSignal('C1_CHILD_SECURITY_CANONICAL_INPUT_REQUIRED');
}

export function canonicalSecurityDigest(input) {
  try {
    const root = rootOf(input);
    if (!object(root)) throw Error('SHAPE');
    const payload = Object.fromEntries(Object.entries(root).filter(([key]) => !['captured_at', 'security_sha256'].includes(key)));
    return createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');
  } catch { throw new StockSignal('C1_CHILD_SECURITY_CANONICAL_INPUT_REQUIRED'); }
}

// The expected hash is deliberately mandatory. Never populate it automatically from input.
export function validateC1ChildSecurity(input, reviewedSecuritySha256, now = Date.now()) {
  let code = 'C1_CHILD_SECURITY_REQUIRED';
  const require = (condition, next) => { if (!condition) { code = next; throw Error('BLOCKED'); } };
  try {
    const c = rootOf(input);
    require(object(c) && Number.isFinite(now), code);
    require(c.project_ref_expected === 'msinksoilkluooxenecy' && c.mode === 'READ_ONLY'
      && c.status === 'CAPTURED_REQUIRES_INDEPENDENT_REVIEW', 'C1_CHILD_SECURITY_TEST_CATALOG_REQUIRED');
    const age = now - Date.parse(c.captured_at);
    require(Number.isFinite(age) && age >= -60000 && age <= 86400000, 'C1_CHILD_SECURITY_EXPIRED');
    require(typeof reviewedSecuritySha256 === 'string' && /^[a-f0-9]{64}$/i.test(reviewedSecuritySha256),
      'C1_CHILD_SECURITY_INDEPENDENT_REVIEW_DIGEST_REQUIRED');
    require(c.public_schema?.anon_create === false && c.public_schema?.authenticated_create === false
      && bool(c.public_schema?.anon_usage) && c.public_schema?.authenticated_usage === true
      && text(c.public_schema?.owner), 'C1_CHILD_SECURITY_SCHEMA_REJECTED');
    require(Array.isArray(c.api_roles) && c.api_roles.length === 2
      && ['anon', 'authenticated'].every(name => c.api_roles.filter(r => r.name === name).length === 1)
      && c.api_roles.every(r => r.present === true && r.superuser === false && r.bypass_rls === false
        && r.create_role === false && r.create_db === false && bool(r.inherit)
        && Array.isArray(r.member_of) && r.member_of.every(text)), 'C1_CHILD_SECURITY_API_ROLE_REJECTED');
    require(Array.isArray(c.functions) && c.functions.length === functionNames.length,
      'C1_CHILD_SECURITY_FUNCTION_REJECTED');
    for (const name of functionNames) {
      const rows = c.functions.filter(f => f.name === name), f = rows[0];
      require(rows.length === 1 && f.present === true && f.owner === 'postgres' && f.security_definer === true
        && f.anon_execute === false && f.authenticated_execute === (name !== 'fn_record_inventory_movement')
        && f.overloads === 1 && f.argument_defaults === 0 && f.is_strict === false && f.leakproof === false
        && f.returns_set === readers.has(name) && text(f.return_type) && typeof f.identity_arguments === 'string'
        && f.language === (readers.has(name) || ['current_business_id', 'fn_session_access_status'].includes(name) ? 'sql' : 'plpgsql')
        && f.volatility === (readers.has(name) || ['current_business_id', 'user_can', 'fn_session_access_status'].includes(name) ? 's' : 'v')
        && f.settings_count === 1 && f.other_settings_count === 0 && Array.isArray(f.settings)
        && f.settings.length === 1 && f.settings[0] === (pathsInPublic.has(name) ? 'search_path=public' : 'search_path=""')
        && /^[a-f0-9]{32}$/.test(f.fingerprint || '') && /^[a-f0-9]{32}$/.test(f.body_fingerprint || '')
        && /^[a-f0-9]{64}$/.test(f.body_sha256 || ''), 'C1_CHILD_SECURITY_FUNCTION_REJECTED');
      if (Object.hasOwn(fingerprints, name)) require(f.fingerprint === fingerprints[name], 'C1_CHILD_SECURITY_FUNCTION_DRIFT');
      if (name === 'fn_write_audit' || name === 'fn_read_waste_transactions_secure') {
        const expected = name === 'fn_write_audit' ? C1_AUDIT_CONTRACT.expected : STOCK_WASTE_READER_CONTRACT.expected;
        const returnsExpected = name === 'fn_write_audit'
          ? /^(?:public\.)?audit_logs$/.test(f.return_type)
          : /^SETOF (?:public\.)?waste_transactions$/.test(f.return_type);
        require(f.body_fingerprint === expected.body_fingerprint && f.body_sha256 === expected.body_sha256
          && f.identity_arguments === expected.identity_arguments && returnsExpected, 'C1_CHILD_SECURITY_FUNCTION_DRIFT');
      }
      if (name === 'fn_session_access_status') require(
        f.body_fingerprint === C1_CHILD_SESSION_STATUS_CONTRACT.body_fingerprint
          && f.body_sha256 === C1_CHILD_SESSION_STATUS_CONTRACT.body_sha256
          && f.identity_arguments === '' && f.return_type === 'text', 'C1_CHILD_SECURITY_FUNCTION_DRIFT');
    }
    require(Array.isArray(c.tables) && c.tables.length === C1_CHILD_SECURITY_TABLES.length
      && C1_CHILD_SECURITY_TABLES.every(name => c.tables.filter(t => t.name === name).length === 1),
      'C1_CHILD_SECURITY_TABLE_REJECTED');
    for (const t of c.tables) require(t.present === true && t.owner === 'postgres' && t.rls === true
      && bool(t.force_rls) && Number.isSafeInteger(t.column_count) && t.column_count > 0
      && tablePrivileges.every(priv => t['anon_' + priv] === false && bool(t['authenticated_' + priv])),
      'C1_CHILD_SECURITY_TABLE_REJECTED');
    require(Array.isArray(c.columns) && c.columns.length === c.tables.reduce((sum, t) => sum + t.column_count, 0),
      'C1_CHILD_SECURITY_COLUMN_REJECTED');
    const columnKeys = new Set(), columnOrdinals = new Set();
    for (const col of c.columns) {
      const key = col.table_name + '.' + col.name;
      require(C1_CHILD_SECURITY_TABLES.includes(col.table_name) && text(col.name) && text(col.formatted_type)
        && Number.isSafeInteger(col.ordinal) && col.ordinal > 0 && bool(col.not_null) && !columnKeys.has(key)
        && !columnOrdinals.has(col.table_name + '.' + col.ordinal)
        && columnPrivileges.every(priv => col['anon_' + priv] === false && bool(col['authenticated_' + priv])),
        'C1_CHILD_SECURITY_COLUMN_REJECTED');
      columnKeys.add(key);
      columnOrdinals.add(col.table_name + '.' + col.ordinal);
    }
    require(c.tables.every(t => c.columns.filter(col => col.table_name === t.name).length === t.column_count),
      'C1_CHILD_SECURITY_COLUMN_REJECTED');
    require(Array.isArray(c.policies), 'C1_CHILD_SECURITY_POLICY_REJECTED');
    const policyKeys = new Set();
    for (const p of c.policies) {
      const key = p.table_name + '.' + p.name;
      require(C1_CHILD_SECURITY_TABLES.includes(p.table_name) && text(p.name) && !policyKeys.has(key)
        && Array.isArray(p.roles) && p.roles.length > 0 && p.roles.every(text)
        && !p.roles.some(role => ['public', 'anon'].includes(role.toLowerCase()))
        && ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'ALL'].includes(p.command)
        && ['PERMISSIVE', 'RESTRICTIVE'].includes(p.permissive)
        && (p.qual === null || text(p.qual)) && (p.with_check === null || text(p.with_check)),
        'C1_CHILD_SECURITY_POLICY_REJECTED');
      // PostgreSQL may inherit USING as WITH CHECK. Missing INSERT checks cannot do so.
      require(p.command === 'INSERT' ? text(p.with_check) : text(p.qual), 'C1_CHILD_SECURITY_POLICY_REJECTED');
      policyKeys.add(key);
    }
    require(Array.isArray(c.triggers), 'C1_CHILD_SECURITY_TRIGGER_REJECTED');
    const triggerKeys = new Set();
    for (const t of c.triggers) {
      require(object(t), 'C1_CHILD_SECURITY_TRIGGER_REJECTED');
      const key = t.table_name + '.' + t.name;
      require(C1_CHILD_SECURITY_TABLES.includes(t.table_name) && text(t.name) && !triggerKeys.has(key)
        && ['O', 'D', 'R', 'A'].includes(t.enabled) && text(t.definition)
        && text(t.function_schema) && text(t.function_name) && text(t.function_owner)
        && bool(t.function_security_definer) && /^[a-f0-9]{32}$/.test(t.function_fingerprint || '')
        && /^[a-f0-9]{64}$/.test(t.function_body_sha256 || ''), 'C1_CHILD_SECURITY_TRIGGER_REJECTED');
      triggerKeys.add(key);
    }
    require(object(c.counts) && ['functions', 'tables', 'columns', 'policies', 'triggers'].every(key =>
      Number.isSafeInteger(c.counts[key]) && c.counts[key] === c[key].length),
      'C1_CHILD_SECURITY_CAPTURE_INCOMPLETE');
    require(c.execution_authorized === false, 'C1_CHILD_SECURITY_CAPTURE_MUST_NOT_AUTHORIZE');
    code = 'C1_CHILD_SECURITY_CANONICAL_INPUT_REQUIRED';
    const securityHash = canonicalSecurityDigest(c);
    require(securityHash === reviewedSecuritySha256.toLowerCase(), 'C1_CHILD_SECURITY_REVIEWED_DIGEST_MISMATCH');
    const findings = [];
    for (const t of c.tables) for (const priv of ['truncate', 'trigger']) if (t['authenticated_' + priv])
      findings.push({ code: 'AUTHENTICATED_' + priv.toUpperCase() + '_GRANT_REQUIRES_CONTEXT_REVIEW', table: t.name });
    for (const r of c.api_roles) if (r.member_of.length)
      findings.push({ code: 'API_ROLE_MEMBERSHIP_REQUIRES_CONTEXT_REVIEW', role: r.name });
    for (const t of c.triggers) findings.push({ code: 'TRIGGER_DEFINITION_REQUIRES_CONTEXT_REVIEW', table: t.table_name });
    return Object.freeze({ securityHash, reviewed_digest_matched: true, structural_checks_passed: true,
      semantic_safety_inferred_from_patterns: false, execution_authorized: false,
      conditional_review_findings: findings });
  } catch { throw new StockSignal(code); }
}
