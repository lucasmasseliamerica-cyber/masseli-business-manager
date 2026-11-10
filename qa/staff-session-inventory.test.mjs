import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyLocalStaffSession } from './staff-session-inventory.mjs';
const project = 'https://msinksoilkluooxenecy.supabase.co';
const now = 1794320000000;
const exp = now / 1000 + 3600;
const args = { project, origin: 'http://127.0.0.1:5173', now };
const claims = { iss: project + '/auth/v1', role: 'authenticated', aud: 'authenticated', exp, session_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' };
const identify = extra => identifyLocalStaffSession({ ...args, readSession: () => JSON.stringify({
  accessToken: 'fixture.' + Buffer.from(JSON.stringify({ ...claims, ...extra })).toString('base64url') + '.fixture',
  refreshToken: 'synthetic private value',
}) });
const manager = '96042557-c717-4750-9dd1-88b36958c6d1', employee = '0e03a482-5b3c-4225-baf7-4ae1ab7e9e58';
test('inventory identifies only the fixed M/E candidates without returning credentials or session IDs', () => {
  assert.deepEqual(identify({ sub: manager }), { code: 'LOCAL_SESSION_CANDIDATE', actor: 'MANAGER', expiresUtc: new Date(exp * 1000).toISOString() });
  assert.deepEqual(identify({ sub: employee }), { code: 'LOCAL_SESSION_CANDIDATE', actor: 'EMPLOYEE', expiresUtc: new Date(exp * 1000).toISOString() });
  assert.deepEqual(identify({ sub: 'another' }), { code: 'NOT_MANAGER_OR_EMPLOYEE' });
});
test('wrong origin, missing session, wrong project claims and expired token do not produce a candidate', () => {
  assert.deepEqual(identifyLocalStaffSession({ ...args, origin: 'http://localhost:5173', readSession: () => assert.fail('storage read') }), { code: 'TEST_BINDING_DENIED' });
  assert.deepEqual(identifyLocalStaffSession({ ...args, readSession: () => null }), { code: 'NO_STORED_SESSION' });
  assert.deepEqual(identify({ sub: manager, iss: 'https://other.test/auth/v1' }), { code: 'TEST_USER_TOKEN_DENIED' });
  assert.deepEqual(identify({ sub: manager, exp: now / 1000 + 30 }), { code: 'SESSION_EXPIRED_OR_TOO_SHORT', actor: 'MANAGER' });
});
