// Synthetic HTTP only: the real Edge handler is bundled locally; no sockets or credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const actor = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const business = '33333333-3333-4333-8333-333333333333';
const origin = 'https://qa.example.test';
const bundled = buildSync({ entryPoints: [fileURLToPath(new URL('../supabase/functions/manage-staff-user/index.ts', import.meta.url))], bundle: true, write: false, platform: 'neutral', format: 'iife', target: 'es2022' }).outputFiles[0].text;
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function laboratory({ profile, invitation = () => reply({ id: target }), role = 'OWNER', overrides = {} }) {
  let handler;
  const calls = [], state = { authRetained: true, profileCommitted: false, auditRows: 0 };
  const fetch = async (url, options = {}) => {
    const path = new URL(url).pathname, method = options.method || 'GET';
    calls.push({ path, method });
    if (path === '/auth/v1/user') return reply({ id: actor });
    if (path === '/rest/v1/users') return reply([{ id: actor, business_id: business, active: true, role, permission_overrides: overrides }]);
    if (path === '/auth/v1/invite') return invitation(state);
    if (path === '/rest/v1/rpc/fn_manage_staff_profile') return profile(state, JSON.parse(options.body));
    if (method === 'DELETE' && path === '/auth/v1/admin/users/' + target) { state.authRetained = false; return new Response(null, { status: 204 }); }
    throw new Error('UNEXPECTED_SYNTHETIC_HTTP');
  };
  const environment = { SUPABASE_URL: 'https://staff-lab.invalid', SUPABASE_ANON_KEY: 'synthetic-public', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', NEXALVO_ALLOWED_PROJECT_REF: 'staff-lab', STAFF_ADMIN_ALLOWED_ORIGINS: origin };
  vm.runInNewContext(bundled, { Deno: { env: { get: name => environment[name] }, serve: value => { handler = value; } }, fetch, Request, Response, Headers, URL, TextEncoder, console: { error() {} } });
  return { state, calls, async invoke(operation = 'invite') {
    const body = { operation, name: 'Synthetic Staff', username: 'synthetic', role: 'EMPLOYEE', employee_id: null, active: true, permission_overrides: {}, ...(operation === 'invite' ? { email: 'synthetic@example.test', redirect_to: origin } : { user_id: target }) };
    const response = await handler(new Request('https://staff-lab.invalid/functions/v1/manage-staff-user', { method: 'POST', headers: { Authorization: 'Bearer synthetic-session', Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  } };
}

test('gateway response after possible profile commit never deletes Auth or forwards again', async () => {
  const lab = laboratory({ profile(state) { state.profileCommitted = true; state.auditRows = 1; return new Response('gateway timeout', { status: 504 }); } });
  const result = await lab.invoke();
  assert.equal(lab.calls.filter(c => c.method === 'DELETE').length, 0, 'Auth must remain when the database may have committed');
  assert.equal(lab.state.authRetained, true);
  assert.equal(lab.state.profileCommitted, true);
  assert.equal(lab.state.auditRows, 1);
  assert.equal(lab.calls.filter(c => c.path.endsWith('/invite')).length, 1);
  assert.equal(lab.calls.filter(c => c.path.endsWith('/fn_manage_staff_profile')).length, 1);
  assert.equal(result.status, 503);
  assert.equal(result.body.reconciliation_required, true);
  assert.equal(result.body.retry_allowed, false);
});

for (const [name, profile] of [
  ['lost response', () => { throw new TypeError('synthetic transport loss'); }],
  ['timeout', () => { throw new DOMException('synthetic timeout', 'TimeoutError'); }],
  ['408', () => reply({ code: 'P0001', message: 'not proof', details: null, hint: null }, 408)],
  ['429', () => reply({ error: 'ambiguous' }, 429)],
  ['502 with rejection-shaped body', () => reply({ code: 'P0001', message: 'not proof', details: null, hint: null }, 502)],
  ['unknown rejection', () => reply({ code: 'UNKNOWN', message: 'ambiguous', details: null, hint: null }, 409)],
  ['truncated error', () => new Response('{"code":"P0001"', { status: 400 })],
  ['truncated success', () => new Response('{"id":', { status: 200 })],
  ['incomplete receipt', () => reply({ id: target })],
]) test(`profile ${name} retains Auth and requests reconciliation without retry`, async () => {
  const lab = laboratory({ profile }), result = await lab.invoke();
  assert.equal(result.status, 503);
  assert.equal(result.body.profile_outcome, 'uncertain');
  assert.equal(result.body.retry_allowed, false);
  assert.equal(lab.calls.filter(c => c.method === 'DELETE').length, 0);
  assert.equal(lab.calls.filter(c => c.path.endsWith('/fn_manage_staff_profile')).length, 1);
  assert.equal(lab.state.authRetained, true);
});

const rejection = () => reply({ code: 'P0001', message: 'SQL details must stay private', details: null, hint: null }, 400);
test('definitive profile rejection cannot prove a newly owned Auth identity', async () => {
  const lab = laboratory({ profile: rejection }), result = await lab.invoke();
  assert.equal(result.body.profile_outcome, 'rejected');
  assert.equal(result.body.code, 'STAFF_INVITE_PROFILE_REJECTED');
  assert.equal(result.body.reconciliation_required, true);
  assert.equal(result.body.retry_allowed, false);
  assert.doesNotMatch(JSON.stringify(result.body), /SQL details/);
  assert.equal(lab.state.authRetained, true);
  assert.equal(lab.calls.filter(c => c.method === 'DELETE').length, 0);
});

test('definitive update rejection is distinct from an uncertain invitation', async () => {
  const lab = laboratory({ profile: rejection }), result = await lab.invoke('update');
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'PROFILE_OPERATION_REJECTED');
  assert.equal(result.body.reconciliation_required, undefined);
  assert.equal(lab.calls.filter(c => c.path.endsWith('/invite')).length, 0);
});

for (const [name, invitation] of [
  ['lost Auth response', () => { throw new TypeError('synthetic Auth response lost'); }],
  ['gateway Auth response', () => new Response('timeout', { status: 504 })],
  ['invalid Auth identity', () => reply({ id: 'not-an-identity' })],
]) test(`${name} stops before profile and preserves identity`, async () => {
  const lab = laboratory({ profile: () => { throw new Error('must not forward'); }, invitation });
  const result = await lab.invoke();
  assert.equal(result.body.reconciliation_required, true);
  assert.equal(lab.calls.filter(c => c.path.endsWith('/fn_manage_staff_profile')).length, 0);
  assert.equal(lab.calls.filter(c => c.method === 'DELETE').length, 0);
});

function profileReceipt(command) {
  return { id: target, business_id: business, employee_id: command.p_employee_id,
    name: command.p_name, username: command.p_username, role: command.p_role,
    active: command.p_active, permission_overrides: command.p_permission_overrides };
}
test('receipt must match the submitted identity and tenant before confirming', async () => {
  for (const changed of [{ id: actor }, { business_id: actor }, { role: 'OWNER' }, { permission_overrides: { manageUsers: true } }]) {
    const lab = laboratory({ profile: (_state, command) => reply({ ...profileReceipt(command), ...changed }) });
    assert.equal((await lab.invoke()).body.reconciliation_required, true);
    assert.equal(lab.calls.filter(c => c.method === 'DELETE').length, 0);
  }
});
test('matching confirmed profile preserves the existing one-call success contract', async () => {
  const lab = laboratory({ profile: (_state, command) => reply(profileReceipt(command)) });
  const result = await lab.invoke();
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.user.id, target);
  assert.equal(lab.calls.length, 4);
});
test('permission denial occurs before invitation or privileged profile RPC', async () => {
  const lab = laboratory({ role: 'MANAGER', profile: () => { throw new Error('must not forward'); } });
  assert.equal((await lab.invoke()).status, 403);
  assert.equal(lab.calls.length, 2);
});
