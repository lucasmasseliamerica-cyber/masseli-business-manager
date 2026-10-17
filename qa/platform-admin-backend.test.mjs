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
const preflight = readFileSync(new URL('./sql/platform_admin_preflight_readonly_TEST.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../migrations/20261016_platform_admin_rollback_TEST.sql', import.meta.url), 'utf8');

test('server authorization accepts only the signed app_metadata SUPERADMIN claim', () => {
  assert.equal(requirePlatformAdmin({ id: validActor, app_metadata: { nexalvo_platform_role: 'SUPERADMIN' } }), validActor);
  assert.throws(() => requirePlatformAdmin({ id: validActor, user_metadata: { nexalvo_platform_role: 'SUPERADMIN' } }), (error) => error.status === 403);
  assert.throws(() => requirePlatformAdmin({ id: validActor, app_metadata: { nexalvo_platform_role: 'OWNER' } }), (error) => error.status === 403);
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
  assert.doesNotMatch(edge, /Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*/);
  assert.doesNotMatch(edge, /console\.(log|debug)\(/);
});

test('prepared SQL keeps state private and mutations atomic, audited and replay-safe', () => {
  assert.match(migration, /PREPARED ONLY: do not apply/);
  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS nexalvo_private/);
  assert.match(migration, /REVOKE ALL ON SCHEMA nexalvo_private FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration, /SET search_path = ''/g);
  assert.match(migration, /ON CONFLICT \(request_id\) DO NOTHING/);
  assert.match(migration, /platform request id reused with different payload/);
  assert.match(migration, /FROM nexalvo_private\.platform_admin_requests[\s\S]*FOR UPDATE/);
  assert.match(migration, /FROM public\.businesses[\s\S]*FOR UPDATE/);
  assert.match(migration, /INSERT INTO nexalvo_private\.platform_admin_audit_logs/);
  assert.match(migration, /WHEN 'grant_lifetime_license'/);
  assert.match(migration, /WHEN 'revoke_license'/);
  assert.match(migration, /WHEN 'update_business_status'/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.fn_platform_admin_execute[\s\S]* TO service_role/);
  assert.doesNotMatch(migration, /\b(DROP|TRUNCATE)\b/i);
});

test('deployment has a read-only collision preflight and an audit-preserving rollback', () => {
  assert.match(preflight, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(preflight, /SET LOCAL statement_timeout = '30s';/);
  assert.match(preflight, /ROLLBACK;/);
  assert.match(preflight, /information_schema\.columns/);
  assert.match(preflight, /pg_get_function_identity_arguments/);
  assert.match(preflight, /role_table_grants/);
  assert.doesNotMatch(preflight, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i);
  assert.match(rollback, /PREPARED ONLY: do not run/);
  assert.match(rollback, /rollback refused: platform administration audit history exists/);
  assert.match(rollback, /rollback refused: platform administration request history exists/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.fn_platform_admin_execute/);
  assert.doesNotMatch(rollback, /\bCASCADE\b/i);
});
