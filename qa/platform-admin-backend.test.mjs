import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
