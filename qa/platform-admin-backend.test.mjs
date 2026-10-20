import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { configurePlatformAdminTest, LOCAL_ORIGIN, TEST_PROJECT_REF } from '../scripts/configure-platform-admin-test.mjs';
import {
  allowedOrigin,
  parsePlatformAdminRequest,
  publicPlatformError,
  requirePlatformAdmin,
} from '../supabase/functions/_shared/platform-admin-core.mjs';

const validActor = '11111111-1111-4111-8111-111111111111';
const validBusiness = '22222222-2222-4222-8222-222222222222';
const validRequest = '33333333-3333-4333-8333-333333333333';
const edge = readFileSync(new URL('../supabase/functions/platform-admin/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/20261016_platform_admin_TEST.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('./sql/platform_admin_cutover_preflight_readonly_TEST.sql', import.meta.url), 'utf8');
const postflight = readFileSync(new URL('./sql/platform_admin_single_authority_preflight_readonly_TEST.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../migrations/20261016_platform_admin_rollback_TEST.sql', import.meta.url), 'utf8');
const claimTool = readFileSync(new URL('../scripts/prepare-superadmin-claim.mjs', import.meta.url), 'utf8');

function configurationHarness({ marker = false, origins = true, cors = true, missingService = false, configured = false } = {}) {
  const calls = [];
  const base = `https://${TEST_PROJECT_REF}.supabase.co`;
  const secretNames = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')];
  const fetchImpl = async (url, options) => {
    calls.push({ url, method: options.method || 'GET', body: options.body });
    if (url === `https://api.supabase.com/v1/projects/${TEST_PROJECT_REF}/secrets`) {
      if (options.method === 'POST') return new Response(null, { status: 201 });
      const names = [...(missingService ? secretNames.slice(0, 2) : secretNames),
        ...(marker ? ['NEXALVO_ALLOWED_PROJECT_REF'] : []),
        ...(origins ? ['PLATFORM_ADMIN_ALLOWED_ORIGINS'] : [])];
      return Response.json(names.map(name => ({ name, value: 'do-not-log-secret-value' })));
    }
    assert.equal(url, `${base}/functions/v1/platform-admin`);
    if (options.method === 'OPTIONS') {
      return new Response(null, { status: cors ? 204 : 403,
        headers: cors ? { 'access-control-allow-origin': LOCAL_ORIGIN } : {} });
    }
    assert.equal(options.body, JSON.stringify({ operation: 'list_businesses' }));
    return Response.json(configured ? { code: 'AUTH_INVALID' } : { code: 'PLATFORM_NOT_CONFIGURED' },
      { status: configured ? 401 : 503 });
  };
  return { calls, fetchImpl, env: { SUPABASE_ACCESS_TOKEN: 'test-management-token', VITE_SUPABASE_URL: base, VITE_SUPABASE_ANON_KEY: 'test-public-key' } };
}

test('TEST configuration requires management access and exact HTTPS project before networking', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error('must not connect'); };
  assert.equal((await configurePlatformAdminTest({ env: {}, fetchImpl })).reason, 'MANAGEMENT_ACCESS_UNAVAILABLE');
  for (const url of ['http://msinksoilkluooxenecy.supabase.co', 'https://msinksoilkluooxenecy.example.com', 'https://other.supabase.co', 'not-a-url']) {
    const result = await configurePlatformAdminTest({ env: { SUPABASE_ACCESS_TOKEN: 'test', SUPABASE_URL: url }, fetchImpl, apply: true });
    assert.equal(result.reason, 'TEST_URL_REQUIRED');
  }
  assert.equal(calls, 0);
});

test('configuration dry-run preserves existing CORS and emits neither secret values nor writes', async () => {
  const h = configurationHarness();
  const result = await configurePlatformAdminTest(h);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.planned_updates, ['NEXALVO_ALLOWED_PROJECT_REF']);
  assert.deepEqual(result.changed, []);
  assert.ok(h.calls.every(c => c.method !== 'POST'));
  assert.doesNotMatch(JSON.stringify(result), /do-not-log|test-management-token|test-public-key/);
});

test('authorized configuration adds only the missing project marker, preserving all origins', async () => {
  const h = configurationHarness({ configured: true });
  const result = await configurePlatformAdminTest({ ...h, apply: true });
  const writes = h.calls.filter(c => c.url.startsWith('https://api.supabase.com') && c.method === 'POST');
  assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0].body), [{ name: 'NEXALVO_ALLOWED_PROJECT_REF', value: TEST_PROJECT_REF }]);
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.changed, ['NEXALVO_ALLOWED_PROJECT_REF']);
  assert.equal(result.reason, 'CONFIGURED_AUTHENTICATED_VALIDATION_STILL_REQUIRED');
});

test('an existing origin allowlist is never overwritten when a safe merge is unavailable', async () => {
  const h = configurationHarness({ cors: false });
  const result = await configurePlatformAdminTest({ ...h, apply: true });
  assert.equal(result.reason, 'EXISTING_ORIGINS_REQUIRE_SAFE_MERGE');
  assert.ok(h.calls.every(c => c.method !== 'POST'));
});

test('a new origin list is prepared only when the list is entirely absent', async () => {
  const h = configurationHarness({ cors: false, origins: false });
  const result = await configurePlatformAdminTest(h);
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.planned_updates, ['PLATFORM_ADMIN_ALLOWED_ORIGINS', 'NEXALVO_ALLOWED_PROJECT_REF']);
  assert.ok(h.calls.every(c => c.method !== 'POST'));
});

test('successful secret update never substitutes for verifying the resulting origin', async () => {
  const h = configurationHarness({ cors: false, origins: false, configured: true });
  const result = await configurePlatformAdminTest({ ...h, apply: true });
  assert.equal(result.reason, 'ORIGIN_STILL_UNVERIFIED');
  assert.equal(result.status, 'BLOCKED');
  assert.equal(h.calls.filter(c => c.method === 'OPTIONS').length, 2);
});

test('configuration refuses writes if any service variable is missing', async () => {
  const h = configurationHarness({ missingService: true });
  const result = await configurePlatformAdminTest({ ...h, apply: true });
  assert.equal(result.reason, 'REQUIRED_SERVICE_VARIABLE_MISSING');
  assert.ok(h.calls.every(c => c.method !== 'POST'));
});

test('an existing marker with a failing configuration probe remains blocked without overwrite', async () => {
  const h = configurationHarness({ marker: true });
  const result = await configurePlatformAdminTest({ ...h, apply: true });
  assert.equal(result.reason, 'PLATFORM_CONFIGURATION_STILL_INCOMPLETE');
  assert.deepEqual(result.changed, []);
  assert.ok(!h.calls.some(c => c.url.startsWith('https://api.supabase.com') && c.method === 'POST'));
});

test('management errors never expose raw responses or exception details', async () => {
  const h = configurationHarness();
  const denied = await configurePlatformAdminTest({ ...h, fetchImpl: async () => new Response('secret response', { status: 403 }) });
  assert.equal(denied.reason, 'MANAGEMENT_ACCESS_REJECTED');
  const network = await configurePlatformAdminTest({ ...h, fetchImpl: async () => { throw new Error('secret transport detail'); } });
  assert.equal(network.reason, 'CONFIGURATION_ACCESS_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify([denied, network]), /secret response|secret transport/);
});

test('runtime RPC diagnosis tolerates missing functions and is strictly read-only', () => {
  const sql = readFileSync(new URL('./sql/platform_admin_runtime_preflight_readonly_TEST.sql', import.meta.url), 'utf8');
  assert.match(sql, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(sql, /LEFT JOIN pg_catalog\.pg_proc/);
  assert.match(sql, /pg_catalog\.to_regprocedure/);
  assert.match(sql, /NOT authenticated_executable AND NOT anon_executable AND NOT public_executable/);
  assert.match(sql, /ROLLBACK;/);
  assert.doesNotMatch(sql, /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/im);
});

test('server authorization accepts only the signed app_metadata SUPERADMIN claim', () => {
  assert.equal(requirePlatformAdmin({ id: validActor, app_metadata: { nexalvo_platform_role: 'SUPERADMIN' } }), validActor);
  assert.throws(() => requirePlatformAdmin({ id: validActor, user_metadata: { nexalvo_platform_role: 'SUPERADMIN' } }), (error) => error.status === 403);
  assert.throws(() => requirePlatformAdmin({ id: validActor, app_metadata: { nexalvo_platform_role: 'OWNER' } }), (error) => error.status === 403);
  assert.throws(() => requirePlatformAdmin({ id: validActor, role: 'MANAGER' }), (error) => error.status === 403);
  assert.throws(() => requirePlatformAdmin({ id: validActor, role: 'EMPLOYEE' }), (error) => error.status === 403);
  assert.throws(() => requirePlatformAdmin({ id: validActor, legacy_operator: true }), (error) => error.status === 403);
  assert.throws(() => requirePlatformAdmin({ id: 'not-a-uuid', app_metadata: { nexalvo_platform_role: 'SUPERADMIN' } }), (error) => error.status === 401);
});

test('CORS uses an exact allowlist and never reflects an unknown origin', () => {
  assert.equal(allowedOrigin('https://qa.example.com', 'https://qa.example.com, https://admin.example.com'), 'https://qa.example.com');
  assert.equal(allowedOrigin('https://qa.example.com.evil.test', 'https://qa.example.com'), null);
  assert.equal(allowedOrigin('https://QA.example.com', 'https://qa.example.com'), null);
  assert.equal(allowedOrigin(null, 'https://qa.example.com'), null);
});

test('request parser enforces operation, identifiers, status and an exact payload contract', () => {
  assert.deepEqual(parsePlatformAdminRequest({ operation: 'list_businesses' }), { operation: 'list_businesses' });
  assert.deepEqual(parsePlatformAdminRequest({ operation: 'list_audit_logs' }), { operation: 'list_audit_logs' });
  assert.deepEqual(parsePlatformAdminRequest({ operation: 'revoke_license', request_id: validRequest, business_id: validBusiness }), {
    operation: 'revoke_license', requestId: validRequest, businessId: validBusiness, status: null,
  });
  assert.deepEqual(parsePlatformAdminRequest({ operation: 'update_business_status', request_id: validRequest, business_id: validBusiness, status: 'SUSPENDED' }), {
    operation: 'update_business_status', requestId: validRequest, businessId: validBusiness, status: 'SUSPENDED',
  });
  for (const bad of [
    null,
    { operation: 'delete_business', request_id: validRequest, business_id: validBusiness },
    { operation: 'list_businesses', business_id: validBusiness },
    { operation: 'grant_lifetime_license', request_id: 'bad', business_id: validBusiness },
    { operation: 'grant_lifetime_license', request_id: validRequest, business_id: validBusiness, status: 'ACTIVE' },
    { operation: 'update_business_status', request_id: validRequest, business_id: validBusiness, status: 'DELETED' },
  ]) assert.throws(() => parsePlatformAdminRequest(bad));
});

test('unexpected server failures are sanitized before reaching the browser', () => {
  const internal = publicPlatformError(new Error('database password and internal SQL'));
  assert.equal(internal.status, 500);
  assert.equal(internal.body.code, 'PLATFORM_SERVICE_ERROR');
  assert.doesNotMatch(JSON.stringify(internal), /password|internal SQL/);
});

test('Edge boundary verifies the live Auth user before any privileged RPC', () => {
  const serviceKeyName = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_');
  assert.match(edge, /\/auth\/v1\/user/);
  assert.match(edge, /requirePlatformAdmin\(user\)/);
  assert.match(edge, /NEXALVO_ALLOWED_PROJECT_REF/);
  assert.match(edge, /actualProjectRef !== expectedProjectRef/);
  assert.ok(edge.includes(serviceKeyName));
  assert.match(edge, /fn_platform_admin_list_businesses/);
  assert.match(edge, /fn_platform_admin_list_audit_logs/);
  assert.match(edge, /fn_platform_admin_execute/);
  assert.match(edge, /fn_platform_admin_list_businesses", \{\s*p_actor_user_id: authUser\.id/);
  assert.match(edge, /fn_platform_admin_list_audit_logs", \{\s*p_actor_user_id: authUser\.id/);
  assert.doesNotMatch(edge, /Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*/);
  assert.doesNotMatch(edge, /console\.(log|debug)\(/);
});

test('prepared SQL keeps state private and mutations atomic, audited and replay-safe', () => {
  assert.match(migration, /PREPARED ONLY: do not apply/);
  assert.match(migration, /CREATE SCHEMA nexalvo_private/);
  assert.match(migration, /REVOKE ALL ON SCHEMA nexalvo_private FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration, /SET search_path TO ''/g);
  assert.match(migration, /is_signed_superadmin\(p_actor_user_id\)/g);
  assert.match(migration, /ON CONFLICT \(request_id\) DO NOTHING/);
  assert.match(migration, /platform request id reused with different payload/);
  assert.match(migration, /FROM nexalvo_private\.platform_admin_requests[\s\S]*FOR UPDATE/);
  assert.match(migration, /FROM public\.businesses[\s\S]*FOR UPDATE/);
  assert.match(migration, /INSERT INTO nexalvo_private\.platform_admin_audit_logs/);
  assert.match(migration, /WHEN 'grant_lifetime_license'/);
  assert.match(migration, /WHEN 'revoke_license'/);
  assert.match(migration, /WHEN 'update_business_status'/);
  assert.match(migration, /v_changed boolean := false/);
  assert.match(migration, /changed boolean NOT NULL/);
  assert.match(migration, /WHEN 'revoke_license' THEN\s+IF v_business\.license_type IS DISTINCT FROM 'NONE' THEN/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.fn_platform_admin_execute[\s\S]* TO service_role/);
  assert.doesNotMatch(migration, /\b(DROP|TRUNCATE)\b/i);
});

test('atomic cutover has exact read-only baselines and retires the legacy authority at commit', () => {
  assert.match(preflight, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(preflight, /SET LOCAL statement_timeout = '30s';/);
  assert.match(preflight, /ROLLBACK;/);
  assert.match(preflight, /PASS_READY_FOR_ATOMIC_CUTOVER/);
  assert.match(preflight, /legacy_endpoint_definitions_exact/);
  assert.match(preflight, /claim_matches_active_legacy_operator/);
  assert.match(preflight, /cb88feae5114dab5ff53ad35319544d4/);
  assert.match(preflight, /75c32789a68a73e29a8a82d33e3aad27/);
  assert.doesNotMatch(preflight, /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/im);

  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /INSERT INTO nexalvo_private\.platform_authority_cutover/);
  assert.match(migration, /UPDATE nexalvo_platform\.operators SET active = false WHERE active/);
  assert.match(migration, /REVOKE USAGE ON SCHEMA nexalvo_platform/);
  assert.match(migration, /cutover postflight failed: legacy endpoint remains executable/);
  assert.ok(migration.indexOf('CREATE OR REPLACE FUNCTION public.fn_platform_admin_execute') < migration.indexOf('UPDATE nexalvo_platform.operators SET active = false'));
  assert.ok(migration.indexOf('UPDATE nexalvo_platform.operators SET active = false') < migration.lastIndexOf('COMMIT;'));
});

test('new SQL enforces tenant suspension, server-only commercial fields and recovery access', () => {
  assert.match(migration, /b\.platform_status = 'ACTIVE'/g);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.fn_session_access_status\(\)/);
  assert.match(migration, /BUSINESS_SUSPENDED/);
  assert.match(migration, /REVOKE UPDATE ON TABLE public\.businesses FROM authenticated/);
  assert.match(migration, /GRANT UPDATE \([\s\S]*updated_at[\s\S]*\) ON TABLE public\.businesses TO authenticated/);
  assert.match(migration, /cannot suspend its own tenant/);
  assert.match(migration, /REVOKE ALL ON FUNCTION nexalvo_backup\.export_business_data\(uuid\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(migration, /current_business_id\(\) IS DISTINCT FROM p_business_id/);
});

test('postflight proves one authority and remains strictly read only', () => {
  assert.match(postflight, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(postflight, /PASS_SINGLE_SIGNED_AUTHORITY/);
  assert.match(postflight, /legacy_operators_disabled/);
  assert.match(postflight, /platform_rpcs_service_role_only/);
  assert.match(postflight, /tenant_and_permission_suspension_gates/);
  assert.match(postflight, /direct_private_backup_export_denied/);
  assert.match(postflight, /ROLLBACK;/);
  assert.doesNotMatch(postflight, /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/im);
});

test('rollback is fail-closed, audit preserving and cannot recreate dual authority', () => {
  assert.match(rollback, /PREPARED ONLY: do not run/);
  assert.match(rollback, /rollback refused: remove signed SUPERADMIN claims first/);
  assert.match(rollback, /rollback refused: platform request or audit history exists/);
  assert.match(rollback, /rollback refused: commercial platform state has changed/);
  assert.match(rollback, /legacy_operator_ids/);
  assert.match(rollback, /UPDATE nexalvo_platform\.operators AS o SET active = true/);
  assert.doesNotMatch(rollback, /\bCASCADE\b/i);
});

test('claim transition helper defaults to dry-run, preserves metadata and is TEST locked', () => {
  assert.match(claimTool, /const apply = process\.argv\.includes\('--apply'\)/);
  assert.match(claimTool, /NEXALVO_CLAIM_CHANGE_AUTHORIZED !== 'TEST_ONLY_EXPLICIT'/);
  assert.match(claimTool, /msinksoilkluooxenecy/);
  assert.match(claimTool, /const nextMetadata = \{ \.\.\.currentMetadata \}/);
  const loggedObjects = [...claimTool.matchAll(/console\.log\(JSON\.stringify\(\{([\s\S]*?)\}\)\);/g)];
  assert.equal(loggedObjects.length, 2);
  for (const [, body] of loggedObjects) assert.doesNotMatch(body, /\b(userId|email|app_metadata)\b/);
});
