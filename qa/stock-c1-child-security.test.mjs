import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { canonicalSecurityDigest, validateC1ChildSecurity, C1_CHILD_SECURITY_TABLES,
  C1_CHILD_SESSION_STATUS_CONTRACT } from './stock-c1-child-security.mjs';
import { STOCK_FINGERPRINTS, STOCK_PRECISION_TARGET_FINGERPRINT } from './stock-journey-core.mjs';
import { C1_AUDIT_CONTRACT } from './stock-c1-audit-contract.mjs';
import { STOCK_WASTE_READER_CONTRACT } from './stock-waste-reader-contract.mjs';

const now = Date.parse('2026-10-24T12:00:00Z');
const publicPath = new Set(['fn_adjust_inventory_count', 'fn_transfer_inventory', 'fn_record_waste', 'fn_record_inventory_movement']);
const readers = new Set(['fn_read_inventory_stock_secure', 'fn_read_inventory_transactions_secure',
  'fn_read_purchase_order_items_secure', 'fn_read_waste_transactions_secure']);
const tablePrivileges = ['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'];
const columnPrivileges = ['select', 'insert', 'update', 'references'];
const reviewedDefinitions = { ...STOCK_FINGERPRINTS, fn_record_inventory_movement: STOCK_PRECISION_TARGET_FINGERPRINT,
  fn_write_audit: 'a'.repeat(32), fn_read_waste_transactions_secure: 'b'.repeat(32), fn_session_access_status: 'e'.repeat(32) };
function syntheticCapture() {
  const c = { project_ref_expected: 'msinksoilkluooxenecy', connection_identity: 'VERIFY_EXTERNALLY', mode: 'READ_ONLY',
    captured_at: new Date(now).toISOString(), status: 'CAPTURED_REQUIRES_INDEPENDENT_REVIEW', execution_authorized: false,
    public_schema: { owner: 'pg_database_owner', anon_create: false, authenticated_create: false, anon_usage: true, authenticated_usage: true },
    api_roles: ['anon', 'authenticated'].map(name => ({ name, present: true, superuser: false, bypass_rls: false,
      create_role: false, create_db: false, inherit: true, member_of: [] })),
    functions: Object.entries(reviewedDefinitions).map(([name, fingerprint]) => ({ name, fingerprint, present: true,
      body_fingerprint: 'c'.repeat(32), body_sha256: 'd'.repeat(64), identity_arguments: '', return_type: 'SYNTHETIC_TYPE',
      owner: 'postgres', security_definer: true, anon_execute: false, authenticated_execute: name !== 'fn_record_inventory_movement',
      overloads: 1, argument_defaults: 0, is_strict: false, leakproof: false, returns_set: readers.has(name),
      language: readers.has(name) || ['current_business_id', 'fn_session_access_status'].includes(name) ? 'sql' : 'plpgsql',
      volatility: readers.has(name) || ['current_business_id', 'user_can', 'fn_session_access_status'].includes(name) ? 's' : 'v',
      settings_count: 1, other_settings_count: 0, settings: [publicPath.has(name) ? 'search_path=public' : 'search_path=""'] })),
    tables: C1_CHILD_SECURITY_TABLES.map(name => ({ name, present: true, owner: 'postgres', rls: true, force_rls: false,
      column_count: 1, ...Object.fromEntries(tablePrivileges.flatMap(p => [['anon_' + p, false], ['authenticated_' + p, p === 'select']])) })),
    columns: C1_CHILD_SECURITY_TABLES.map(table_name => ({ table_name, name: 'id', ordinal: 1, formatted_type: 'uuid', not_null: true,
      ...Object.fromEntries(columnPrivileges.flatMap(p => [['anon_' + p, false], ['authenticated_' + p, p === 'select']])) })),
    triggers: [], policies: [{ table_name: 'inventory_stock', name: 'SYNTHETIC_TENANT_READ', roles: ['authenticated'], command: 'SELECT',
      permissive: 'PERMISSIVE', qual: '(business_id = current_business_id())', with_check: null }] };
  for (const [name, contract] of [['fn_write_audit', C1_AUDIT_CONTRACT.expected], ['fn_read_waste_transactions_secure', STOCK_WASTE_READER_CONTRACT.expected]]) {
    Object.assign(c.functions.find(f => f.name === name), { body_fingerprint: contract.body_fingerprint,
      body_sha256: contract.body_sha256, identity_arguments: contract.identity_arguments,
      return_type: name === 'fn_write_audit' ? 'audit_logs' : 'SETOF waste_transactions' });
  }
  Object.assign(c.functions.find(f => f.name === 'fn_session_access_status'), {
    body_fingerprint: C1_CHILD_SESSION_STATUS_CONTRACT.body_fingerprint,
    body_sha256: C1_CHILD_SESSION_STATUS_CONTRACT.body_sha256, return_type: 'text' });
  c.counts = Object.fromEntries(['functions', 'tables', 'columns', 'policies', 'triggers'].map(key => [key, c[key].length]));
  return c;
}
function blocked(change, code) {
  const c = syntheticCapture(); change(c);
  // Even a newly recomputed matching digest must not bypass the structural security rules.
  assert.throws(() => validateC1ChildSecurity(c, canonicalSecurityDigest(c), now), error => {
    assert.equal(error.code, code); return true;
  });
}

test('C1 child catalog requires independent expected digest and never treats capture as write authorization', () => {
  const c = syntheticCapture(), before = JSON.stringify(c), expected = canonicalSecurityDigest(c);
  for (const value of [undefined, null, '', 'SYNTHETIC_UNREVIEWED'])
    assert.throws(() => validateC1ChildSecurity(c, value, now), /C1_CHILD_SECURITY_INDEPENDENT_REVIEW_DIGEST_REQUIRED/);
  const proof = validateC1ChildSecurity(c, expected, now);
  assert.equal(proof.securityHash, expected); assert.equal(proof.reviewed_digest_matched, true);
  assert.equal(proof.structural_checks_passed, true); assert.equal(proof.execution_authorized, false);
  assert.equal(proof.semantic_safety_inferred_from_patterns, false); assert.deepEqual(proof.conditional_review_findings, []);
  assert.equal(JSON.stringify(c), before); assert.ok(Object.isFrozen(proof));
  assert.equal(validateC1ChildSecurity([{ stock_c1_child_security: c }], expected.toUpperCase(), now).securityHash, expected);
});
test('C1 canonical security digest is stable across capture time object keys and result order, not substantive drift', () => {
  const c = syntheticCapture(), expected = canonicalSecurityDigest(c);
  c.captured_at = new Date(now + 1000).toISOString(); c.security_sha256 = 'IGNORED_TRANSPORT_FIELD';
  for (const key of ['api_roles', 'functions', 'tables', 'columns', 'policies']) c[key].reverse();
  const reordered = Object.fromEntries(Object.entries(c).reverse());
  assert.equal(canonicalSecurityDigest(reordered), expected);
  c.policies[0].qual = '(SYNTHETIC_CHANGED_POLICY)';
  assert.notEqual(canonicalSecurityDigest(c), expected);
  assert.throws(() => validateC1ChildSecurity(c, expected, now), /C1_CHILD_SECURITY_REVIEWED_DIGEST_MISMATCH/);
});
for (const change of [c => { c.project_ref_expected = 'OTHER_PROJECT'; }, c => { c.mode = 'WRITE'; },
  c => { c.status = 'PASS'; }]) test('C1 child rejects wrong project mode or premature PASS even with matching digest', () => {
  blocked(change, 'C1_CHILD_SECURITY_TEST_CATALOG_REQUIRED');
});
test('C1 child rejects expired future missing or NULL capture time and invalid clocks', () => {
  for (const captured_at of [undefined, null, 'SYNTHETIC_INVALID', new Date(now - 86400001).toISOString(), new Date(now + 60001).toISOString()]) {
    const c = syntheticCapture(); c.captured_at = captured_at;
    assert.throws(() => validateC1ChildSecurity(c, 'a'.repeat(64), now), /C1_CHILD_SECURITY_EXPIRED/);
  }
  assert.throws(() => validateC1ChildSecurity(syntheticCapture(), 'a'.repeat(64), NaN), /C1_CHILD_SECURITY_REQUIRED/);
});
test('C1 child schema CREATE permissions and missing namespace attributes block without weakening the reviewed hash', () => {
  for (const key of ['anon_create', 'authenticated_create']) blocked(c => { c.public_schema[key] = true; }, 'C1_CHILD_SECURITY_SCHEMA_REJECTED');
  for (const key of ['anon_create', 'authenticated_create', 'anon_usage', 'authenticated_usage', 'owner'])
    blocked(c => { c.public_schema[key] = null; }, 'C1_CHILD_SECURITY_SCHEMA_REJECTED');
});
test('C1 child API roles must exist and cannot have bypass RLS superuser or role creation capability', () => {
  for (const key of ['bypass_rls', 'superuser', 'create_role', 'create_db'])
    blocked(c => { c.api_roles[0][key] = true; }, 'C1_CHILD_SECURITY_API_ROLE_REJECTED');
  blocked(c => { c.api_roles[1].present = false; }, 'C1_CHILD_SECURITY_API_ROLE_REJECTED');
  blocked(c => { c.api_roles[1].inherit = null; }, 'C1_CHILD_SECURITY_API_ROLE_REJECTED');
  blocked(c => { c.api_roles[1] = c.api_roles[0]; }, 'C1_CHILD_SECURITY_API_ROLE_REJECTED');
});
test('C1 child catalog rejects wrong or overloaded function identity before accepting a reviewed digest', () => {
  for (const [key, value] of [['owner', 'authenticated'], ['security_definer', false], ['anon_execute', true], ['overloads', 2],
    ['authenticated_execute', false], ['language', 'sql'], ['volatility', 's'], ['is_strict', true], ['returns_set', true],
    ['argument_defaults', 1], ['leakproof', true], ['present', false], ['settings_count', 2], ['other_settings_count', 1],
    ['settings', ['search_path=public,pg_temp']]]) blocked(c => { c.functions.find(f => f.name === 'fn_transfer_inventory')[key] = value; },
    'C1_CHILD_SECURITY_FUNCTION_REJECTED');
  blocked(c => { c.functions.find(f => f.name === 'fn_record_inventory_movement').authenticated_execute = true; }, 'C1_CHILD_SECURITY_FUNCTION_REJECTED');
  blocked(c => { c.functions.push(c.functions[0]); }, 'C1_CHILD_SECURITY_FUNCTION_REJECTED');
  blocked(c => { c.functions.splice(0, 1); }, 'C1_CHILD_SECURITY_FUNCTION_REJECTED');
});
test('C1 child function fingerprints cannot accept old precision old audit body or changed tenant helper', () => {
  blocked(c => { c.functions.find(f => f.name === 'fn_record_inventory_movement').fingerprint = STOCK_FINGERPRINTS.fn_record_inventory_movement; }, 'C1_CHILD_SECURITY_FUNCTION_DRIFT');
  for (const name of ['current_business_id', 'user_can', 'fn_transfer_inventory'])
    blocked(c => { c.functions.find(f => f.name === name).fingerprint = 'e'.repeat(32); }, 'C1_CHILD_SECURITY_FUNCTION_DRIFT');
  for (const name of ['fn_write_audit', 'fn_read_waste_transactions_secure']) for (const [key, value] of [
    ['body_fingerprint', 'f'.repeat(32)], ['body_sha256', 'f'.repeat(64)], ['identity_arguments', 'p_other text'],
    ['return_type', 'text']])
    blocked(c => { c.functions.find(f => f.name === name)[key] = value; }, 'C1_CHILD_SECURITY_FUNCTION_DRIFT');
});
test('C1 child audit and waste reader accept only their actual qualified or unqualified PostgreSQL return contracts', () => {
  const c = syntheticCapture();
  c.functions.find(f => f.name === 'fn_write_audit').return_type = 'public.audit_logs';
  c.functions.find(f => f.name === 'fn_read_waste_transactions_secure').return_type = 'SETOF public.waste_transactions';
  assert.doesNotThrow(() => validateC1ChildSecurity(c, canonicalSecurityDigest(c), now));
  for (const [name, return_type] of [['fn_write_audit', 'SETOF audit_logs'], ['fn_write_audit', 'other.audit_logs'],
    ['fn_read_waste_transactions_secure', 'waste_transactions'], ['fn_read_waste_transactions_secure', 'SETOF other.waste_transactions']])
    blocked(value => { value.functions.find(f => f.name === name).return_type = return_type; }, 'C1_CHILD_SECURITY_FUNCTION_DRIFT');
});
test('C1 browser session helper fingerprints are derived from the exact versioned read-only SELECT body', () => {
  const migration = readFileSync(new URL('../' + C1_CHILD_SESSION_STATUS_CONTRACT.source, import.meta.url), 'utf8');
  const match = migration.match(/CREATE OR REPLACE FUNCTION public\.fn_session_access_status\(\)[\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/);
  assert.ok(match);
  assert.equal(createHash('md5').update(match[1]).digest('hex'), C1_CHILD_SESSION_STATUS_CONTRACT.body_fingerprint);
  assert.equal(createHash('sha256').update(match[1]).digest('hex'), C1_CHILD_SESSION_STATUS_CONTRACT.body_sha256);
  assert.match(match[1], /SELECT CASE/); assert.match(match[1], /auth\.uid\(\)/);
  assert.match(match[1], /u\.active IS DISTINCT FROM true/);
  assert.match(match[1], /b\.platform_status = 'ACTIVE'/);
  assert.doesNotMatch(match[1], /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|PERFORM|EXECUTE)\b/);
});
test('C1 browser session helper cannot be missing changed overloaded write-capable or retyped despite a new review hash', () => {
  blocked(c => { c.functions = c.functions.filter(f => f.name !== 'fn_session_access_status'); c.counts.functions--; }, 'C1_CHILD_SECURITY_FUNCTION_REJECTED');
  for (const [key, value] of [['body_fingerprint', 'f'.repeat(32)], ['body_sha256', 'f'.repeat(64)],
    ['identity_arguments', 'p_details text'], ['return_type', 'boolean']]) blocked(c => {
    c.functions.find(f => f.name === 'fn_session_access_status')[key] = value;
  }, 'C1_CHILD_SECURITY_FUNCTION_DRIFT');
  for (const [key, value] of [['security_definer', false], ['owner', 'authenticated'], ['anon_execute', true],
    ['authenticated_execute', false], ['volatility', 'v'], ['language', 'plpgsql'], ['settings', ['search_path=public']],
    ['overloads', 2], ['argument_defaults', 1], ['is_strict', true], ['leakproof', true], ['returns_set', true]])
    blocked(c => { c.functions.find(f => f.name === 'fn_session_access_status')[key] = value; }, 'C1_CHILD_SECURITY_FUNCTION_REJECTED');
});
test('C1 child missing NULL function metadata cannot be accepted as a false ACL or correct signature', () => {
  for (const key of ['owner', 'security_definer', 'anon_execute', 'authenticated_execute', 'overloads', 'argument_defaults',
    'language', 'volatility', 'settings_count', 'other_settings_count', 'settings', 'identity_arguments', 'return_type'])
    blocked(c => { c.functions[0][key] = null; }, 'C1_CHILD_SECURITY_FUNCTION_REJECTED');
});
test('C1 child table and column effective anonymous privileges and owner/RLS drift remain blocked', () => {
  for (const key of tablePrivileges) blocked(c => { c.tables[0]['anon_' + key] = true; }, 'C1_CHILD_SECURITY_TABLE_REJECTED');
  for (const [key, value] of [['owner', 'authenticated'], ['rls', false], ['force_rls', null], ['column_count', 0], ['present', false]])
    blocked(c => { c.tables[0][key] = value; }, 'C1_CHILD_SECURITY_TABLE_REJECTED');
  for (const key of columnPrivileges) blocked(c => { c.columns[0]['anon_' + key] = true; }, 'C1_CHILD_SECURITY_COLUMN_REJECTED');
  blocked(c => { c.tables[1] = c.tables[0]; }, 'C1_CHILD_SECURITY_TABLE_REJECTED');
  blocked(c => { c.columns.pop(); }, 'C1_CHILD_SECURITY_COLUMN_REJECTED');
  blocked(c => { c.columns[1] = c.columns[0]; }, 'C1_CHILD_SECURITY_COLUMN_REJECTED');
  blocked(c => { c.columns[0].authenticated_select = null; }, 'C1_CHILD_SECURITY_COLUMN_REJECTED');
});
test('C1 child every captured policy requires a real explicit role expression and intact cardinality', () => {
  for (const [key, value] of [['roles', ['public']], ['roles', ['anon']], ['roles', []], ['roles', null],
    ['qual', null], ['command', 'SYNTHETIC_COMMAND'], ['permissive', null], ['name', ''], ['table_name', 'unreviewed_table']])
    blocked(c => { c.policies[0][key] = value; }, 'C1_CHILD_SECURITY_POLICY_REJECTED');
  blocked(c => { c.policies.push(c.policies[0]); }, 'C1_CHILD_SECURITY_POLICY_REJECTED');
  blocked(c => { c.policies[0].command = 'INSERT'; c.policies[0].with_check = null; }, 'C1_CHILD_SECURITY_POLICY_REJECTED');
  for (const key of ['functions', 'tables', 'columns', 'policies', 'triggers'])
    blocked(c => { c.counts[key]++; }, 'C1_CHILD_SECURITY_CAPTURE_INCOMPLETE');
  blocked(c => { c.execution_authorized = true; }, 'C1_CHILD_SECURITY_CAPTURE_MUST_NOT_AUTHORIZE');
});
test('C1 broad policy expressions cannot match a previously reviewed digest through regex or special-case allowlists', () => {
  const c = syntheticCapture(), expected = canonicalSecurityDigest(c);
  c.policies[0].qual = '(business_id = current_business_id()) OR true';
  assert.throws(() => validateC1ChildSecurity(c, expected, now), /C1_CHILD_SECURITY_REVIEWED_DIGEST_MISMATCH/);
  // An independent review can make a deliberate contextual decision; structure does not claim to prove tenant semantics.
  const proof = validateC1ChildSecurity(c, canonicalSecurityDigest(c), now);
  assert.equal(proof.semantic_safety_inferred_from_patterns, false); assert.equal(proof.execution_authorized, false);
});
test('C1 conditional TRUNCATE TRIGGER and role membership findings do not claim a proven exploit or modify privileges', () => {
  const c = syntheticCapture(); c.tables[0].authenticated_truncate = true; c.tables[0].authenticated_trigger = true;
  c.api_roles[1].member_of = ['SYNTHETIC_EXISTING_ROLE']; const expected = canonicalSecurityDigest(c), before = JSON.stringify(c);
  const proof = validateC1ChildSecurity(c, expected, now);
  assert.equal(proof.conditional_review_findings.length, 3); assert.equal(proof.execution_authorized, false);
  assert.ok(proof.conditional_review_findings.every(f => /REQUIRES_CONTEXT_REVIEW$/.test(f.code)));
  assert.equal(JSON.stringify(c), before);
});
test('C1 trigger definitions function identity owner code fingerprints and enabled state are bound to independent review', () => {
  const c = syntheticCapture(), expectedWithoutTrigger = canonicalSecurityDigest(c);
  const trigger = { table_name: 'inventory_items', name: 'SYNTHETIC_TRIGGER', enabled: 'O',
    definition: 'CREATE TRIGGER synthetic_guard BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.synthetic_guard()',
    function_schema: 'public', function_name: 'synthetic_guard', function_owner: 'postgres',
    function_security_definer: false, function_fingerprint: 'a'.repeat(32), function_body_sha256: 'b'.repeat(64) };
  c.triggers = [trigger]; c.counts.triggers = 1;
  assert.throws(() => validateC1ChildSecurity(c, expectedWithoutTrigger, now), /C1_CHILD_SECURITY_REVIEWED_DIGEST_MISMATCH/);
  const reviewed = canonicalSecurityDigest(c), proof = validateC1ChildSecurity(c, reviewed, now);
  assert.equal(proof.execution_authorized, false);
  assert.deepEqual(proof.conditional_review_findings, [{ code: 'TRIGGER_DEFINITION_REQUIRES_CONTEXT_REVIEW', table: 'inventory_items' }]);
  for (const [key, value] of [['enabled', 'D'], ['definition', trigger.definition + ' SYNTHETIC_CHANGE'],
    ['function_owner', 'authenticated'], ['function_schema', 'other'], ['function_security_definer', true],
    ['function_fingerprint', 'c'.repeat(32)], ['function_body_sha256', 'd'.repeat(64)]]) {
    const altered = structuredClone(c); altered.triggers[0][key] = value;
    assert.throws(() => validateC1ChildSecurity(altered, reviewed, now), /C1_CHILD_SECURITY_REVIEWED_DIGEST_MISMATCH/);
  }
});
test('C1 missing duplicated malformed or incomplete trigger catalog cannot pass even with a newly matching digest', () => {
  blocked(c => { delete c.triggers; }, 'C1_CHILD_SECURITY_TRIGGER_REJECTED');
  blocked(c => { c.triggers = [null]; c.counts.triggers = 1; }, 'C1_CHILD_SECURITY_TRIGGER_REJECTED');
  const trigger = { table_name: 'inventory_items', name: 'SYNTHETIC_TRIGGER', enabled: 'O', definition: 'SYNTHETIC_TRIGGER_DEFINITION',
    function_schema: 'public', function_name: 'synthetic_guard', function_owner: 'postgres', function_security_definer: false,
    function_fingerprint: 'a'.repeat(32), function_body_sha256: 'b'.repeat(64) };
  for (const [key, value] of [['table_name', 'unreviewed_table'], ['name', null], ['enabled', 'OTHER'], ['definition', null],
    ['function_schema', null], ['function_name', null], ['function_owner', null], ['function_security_definer', null],
    ['function_fingerprint', 'invalid'], ['function_body_sha256', 'invalid']]) blocked(c => {
    c.triggers = [{ ...trigger, [key]: value }]; c.counts.triggers = 1;
  }, 'C1_CHILD_SECURITY_TRIGGER_REJECTED');
  blocked(c => { c.triggers = [trigger, trigger]; c.counts.triggers = 2; }, 'C1_CHILD_SECURITY_TRIGGER_REJECTED');
  blocked(c => { c.triggers = [trigger]; }, 'C1_CHILD_SECURITY_CAPTURE_INCOMPLETE');
});
test('C1 unexpected errors private messages getters cyclic values and malformed captures never leak upstream text', () => {
  const bad = Object.defineProperty({}, 'project_ref_expected', { get() { throw Error('Bearer SYNTHETIC_PRIVATE person@example.invalid C:\\private'); } });
  for (const input of [bad, undefined, null, [], [syntheticCapture(), syntheticCapture()], 'SYNTHETIC_PRIVATE']) {
    assert.throws(() => validateC1ChildSecurity(input, 'a'.repeat(64), now), error => {
      assert.match(error.code, /^C1_CHILD_SECURITY_[A-Z_]+$/);
      assert.doesNotMatch(JSON.stringify({ code: error.code, message: error.message }), /Bearer|SYNTHETIC_PRIVATE|example\.invalid|C:\\private/); return true;
    });
  }
  const c = syntheticCapture(); c.self = c;
  assert.throws(() => canonicalSecurityDigest(c), /C1_CHILD_SECURITY_CANONICAL_INPUT_REQUIRED/);
});
test('C1 and purchase metadata SQL exports are single catalog SELECT statements with no execution or secret-producing definitions', () => {
  for (const name of ['stock_c1_child_security_readonly_TEST.sql', 'purchase_precision_contracts_readonly_TEST.sql']) {
    const sql = readFileSync(new URL('./sql/' + name, import.meta.url), 'utf8').replace(/--[^\n]*/g, '').trim();
    const tokens = sql.replace(/'(?:''|[^'])*'/g, "''");
    assert.match(sql, /^WITH\b/); assert.match(sql, /CURRENT_TIMESTAMP/); assert.equal((tokens.match(/;/g) || []).length, 1);
    assert.doesNotMatch(sql, /\b(?:CREATE|ALTER|DROP|INSERT|DELETE|TRUNCATE|GRANT|REVOKE|DO|CALL|EXECUTE|COPY)\s+(?:TABLE|FUNCTION|SCHEMA|ROLE|POLICY|INTO|public\.|\$)/i);
    assert.doesNotMatch(sql, /pg_get_functiondef\([^)]*\)\s+AS\s+definition|pg_get_expr\([^)]*adbin|p\.prosrc\s+AS\s+definition/i);
  }
});
