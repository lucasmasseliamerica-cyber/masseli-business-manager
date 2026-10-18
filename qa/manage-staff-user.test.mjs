import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canManageStaff,
  parseStaffRequest,
  publicStaffError,
  StaffRequestError,
} from '../supabase/functions/_shared/manage-staff-user-core.mjs';

const actor = '11111111-1111-4111-8111-111111111111';
const business = '22222222-2222-4222-8222-222222222222';
const employee = '33333333-3333-4333-8333-333333333333';
const edge = readFileSync(new URL('../supabase/functions/manage-staff-user/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/20261017_manage_staff_user_TEST.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../migrations/20261017_manage_staff_user_rollback_TEST.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('./sql/manage_staff_user_preflight_readonly_TEST.sql', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const rootApp = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../src/i18n.jsx', import.meta.url), 'utf8');

test('staff request parser accepts exact invite/update contracts and rejects privilege-shaped extras', () => {
  const invite = parseStaffRequest({
    operation: 'invite', email: ' Staff@Example.test ', name: ' Staff ', username: 'staff',
    role: 'employee', employee_id: employee, active: true,
    permission_overrides: { manageSales: true }, redirect_to: 'https://qa.example.test/',
  });
  assert.equal(invite.email, 'staff@example.test');
  assert.equal(invite.role, 'EMPLOYEE');
  assert.equal(invite.redirectOrigin, 'https://qa.example.test');
  const update = parseStaffRequest({
    operation: 'update', user_id: actor, name: 'Manager', username: 'manager', role: 'MANAGER',
    employee_id: null, active: false, permission_overrides: { manageUsers: true },
  });
  assert.equal(update.userId, actor);
  for (const invalid of [
    { ...invite, operation: 'invite', redirect_to: 'https://qa.example.test/?token=secret' },
    { operation: 'update', user_id: actor, name: 'x', username: 'x', role: 'SUPERADMIN', active: true, permission_overrides: {} },
    { operation: 'update', user_id: actor, name: 'x', username: 'x', role: 'OWNER', active: true, permission_overrides: { manageUsers: false } },
    { operation: 'update', user_id: actor, name: 'x', username: 'x', role: 'EMPLOYEE', active: true, permission_overrides: { unknown: true } },
  ]) assert.throws(() => parseStaffRequest(invalid), StaffRequestError);
});

test('staff authorization accepts active owners or explicit manageUsers and fails closed otherwise', () => {
  assert.equal(canManageStaff({ id: actor, business_id: business, role: 'OWNER', active: true, permission_overrides: {} }), true);
  assert.equal(canManageStaff({ id: actor, business_id: business, role: 'MANAGER', active: true, permission_overrides: { manageUsers: true } }), true);
  assert.equal(canManageStaff({ id: actor, business_id: business, role: 'MANAGER', active: false, permission_overrides: { manageUsers: true } }), false);
  assert.equal(canManageStaff({ id: actor, business_id: business, role: 'MANAGER', active: true, permission_overrides: {} }), false);
  assert.equal(canManageStaff({ id: actor, business_id: business, role: 'UNKNOWN', active: true, permission_overrides: { manageUsers: true } }), false);
  assert.equal(canManageStaff({ id: 'bad', business_id: business, role: 'OWNER', active: true, permission_overrides: {} }), false);
});

test('team UI mirrors server privilege boundaries for self, roles and overrides', () => {
  assert.equal(app, rootApp);
  assert.match(app, /const ownerControlsSecurity = currentUser\?\.role === "OWNER"/);
  assert.match(app, /const protectedSelf = !!user && user\.id === currentUser\?\.id && !ownerControlsSecurity/);
  assert.match(app, /const safePermissions = role === "OWNER" \? \{\} : ownerControlsSecurity \? permissions : \(user\?\.permissions \|\| \{\}\)/);
  assert.match(app, /disabled=\{!ownerControlsSecurity\} checked=\{permState\(p\.key\)\}/);
  assert.match(app, /disabled=\{submitting \|\| protectedSelf\}/);
  for (const key of [
    'Only an Owner can change your login from Team & Permissions.',
    'Only an Owner can change roles or permission overrides.',
  ]) assert.match(i18n, new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:`));
});

test('public staff errors are sanitized', () => {
  assert.deepEqual(publicStaffError(new StaffRequestError('Denied.', 403, 'DENIED')), {
    status: 403, body: { ok: false, error: 'Denied.', code: 'DENIED' },
  });
  const result = publicStaffError(new Error('database password and SQL details'));
  assert.equal(result.status, 500);
  assert.doesNotMatch(JSON.stringify(result), /password|SQL details/);
});

test('Edge boundary verifies Auth and tenant permission before service RPC and compensates failed invite', () => {
  const privilegedKeyName = ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_');
  assert.ok(edge.includes(privilegedKeyName));
  assert.match(edge, /NEXALVO_ALLOWED_PROJECT_REF/);
  assert.match(edge, /STAFF_ADMIN_ALLOWED_ORIGINS/);
  assert.match(edge, /\/auth\/v1\/user/);
  assert.match(edge, /canManageStaff\(profile\)/);
  assert.match(edge, /fn_manage_staff_profile/);
  assert.match(edge, /function publicProfile\(row/);
  assert.match(edge, /user: publicProfile\(result\)/g);
  assert.match(edge, /\/auth\/v1\/invite/);
  assert.match(edge, /deleteInvitedIdentity/);
  assert.match(edge, /STAFF_COMPENSATION_REQUIRED/);
  assert.match(edge, /STAFF_PROFILE_COMMIT_UNCERTAIN/);
  assert.match(edge, /profileError\.safeToCompensate !== true/);
  assert.ok(edge.indexOf('profileError.safeToCompensate !== true') < edge.indexOf('deleteInvitedIdentity(config, invitedId)'));
  assert.doesNotMatch(edge, /Access-Control-Allow-Origin['"]?\s*[:,]\s*['"]\*/);
  assert.doesNotMatch(edge, /console\.(log|debug)\(/);
});

test('profile RPC is service-only, tenant-scoped, owner-safe and audits atomically', () => {
  assert.match(migration, /PREPARED ONLY: do not apply/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /SET search_path = ''/);
  const permission = migration.indexOf("permission denied: manageUsers required");
  const insert = migration.indexOf('INSERT INTO public.users');
  const update = migration.indexOf('UPDATE public.users SET');
  assert.ok(permission > 0 && insert > permission && update > permission);
  assert.match(migration, /business_id = p_business_id/g);
  assert.match(migration, /only an owner can invite another owner/);
  assert.match(migration, /only an owner can grant permission overrides/);
  assert.match(migration, /only an owner can manage owner profiles/);
  assert.match(migration, /non-owner staff managers cannot change their own profile/);
  assert.match(migration, /only an owner can change roles or permission overrides/);
  assert.match(migration, /at least one active owner must remain/);
  assert.match(migration, /employee is already linked to an active login/);
  assert.match(migration, /INSERT INTO public\.audit_logs/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.fn_manage_staff_profile[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.fn_manage_staff_profile[\s\S]*TO service_role/);
  assert.match(migration, /4e02f0128a171ec8a6e65de291f115e7/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.fn_save_user_profile[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.fn_save_user_profile[\s\S]*TO service_role/);
});

test('staff deployment has read-only discovery and data-preserving rollback', () => {
  assert.match(preflight, /BEGIN TRANSACTION READ ONLY/);
  assert.match(preflight, /fn_manage_staff_profile/);
  assert.match(preflight, /fn_save_user_profile/);
  assert.match(preflight, /authenticated_execute/);
  assert.match(preflight, /service_role_privileges/);
  assert.match(preflight, /pg_get_constraintdef/);
  assert.doesNotMatch(preflight.replace(/^\s*--.*$/gm, ''), /(?:^|;)\s*(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|GRANT|REVOKE)\b/im);
  assert.match(rollback, /User profiles, Auth identities and audit history are retained/);
  assert.match(rollback, /GRANT EXECUTE ON FUNCTION public\.fn_save_user_profile[\s\S]*TO authenticated, service_role/);
  assert.doesNotMatch(rollback, /DROP TABLE|DELETE FROM|CASCADE/i);
});
