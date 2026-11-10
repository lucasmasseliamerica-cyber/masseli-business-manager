import test from 'node:test';
import assert from 'node:assert/strict';
import { checkExistingOwner } from './staff-owner-session-readonly.mjs';

const projectUrl = 'https://msinksoilkluooxenecy.supabase.co';
const owner = 'f37e9907-47c4-48bf-94b7-9a6fa5de1f88';
const now = 1794320000000;
const expiry = now / 1000 + 3600;
const claims = {
  sub: owner, iss: projectUrl + '/auth/v1', role: 'authenticated', aud: 'authenticated',
  exp: expiry, session_id: '22222222-2222-4222-8222-222222222222',
};
const jwt = value => 'synthetic.' + Buffer.from(JSON.stringify(value)).toString('base64url') + '.signature';
const goodInput = {
  origin: 'http://127.0.0.1:5173', projectUrl, publicKey: 'sb_publishable_synthetic_fixture_000000',
  readStoredSession: () => JSON.stringify({ accessToken: jwt(claims), refreshToken: 'synthetic-refresh-do-not-use' }),
  now: () => now,
};
const noCall = () => assert.fail('should not request');

test('only the exact app origin, TEST and a public API key can read the stored session', async () => {
  for (const input of [
    { origin: 'http://localhost:5173' },
    { projectUrl: 'https://other-project.supabase.co' },
    { publicKey: jwt({ role: 'service_role', ref: 'msinksoilkluooxenecy' }) },
  ]) {
    assert.deepEqual(await checkExistingOwner({ ...goodInput, ...input, readStoredSession: noCall, request: noCall }), { code: 'TEST_BINDING_DENIED' });
  }
});

test('absent, wrong identity/project, or expiring session sends no request', async () => {
  assert.deepEqual(await checkExistingOwner({ ...goodInput, readStoredSession: () => null, request: noCall }), { code: 'NO_STORED_SESSION' });
  for (const [overrides, code] of [
    [{ sub: 'another-user' }, 'NOT_OWNER_A'],
    [{ iss: 'https://another-project.supabase.co/auth/v1' }, 'TEST_USER_TOKEN_DENIED'],
    [{ role: 'service_role' }, 'TEST_USER_TOKEN_DENIED'],
    [{ exp: now / 1000 + 30 }, 'SESSION_EXPIRED_OR_TOO_SHORT'],
    [{ session_id: [claims.session_id] }, 'SESSION_ID_UNAVAILABLE'],
  ]) {
    const receipt = await checkExistingOwner({
      ...goodInput, readStoredSession: () => JSON.stringify({ accessToken: jwt({ ...claims, ...overrides }) }), request: noCall,
    });
    assert.deepEqual(receipt, { code });
  }
});

test('the only request validates the existing access token; receipt contains no identity or credential', async () => {
  let calls = 0;
  const receipt = await checkExistingOwner({ ...goodInput, request: async (url, options) => {
    calls++;
    assert.equal(url, projectUrl + '/auth/v1/user');
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers.Authorization, 'Bearer ' + jwt(claims));
    assert.equal(options.headers.apikey, goodInput.publicKey);
    assert.ok(!Object.hasOwn(options, 'body'));
    return new Response(JSON.stringify({ id: owner, role: 'authenticated', email: 'fixture@example.test' }), { status: 200 });
  } });
  assert.equal(calls, 1);
  assert.deepEqual(receipt, { code: 'OWNER_A_SESSION_CONFIRMED', expiresUtc: new Date(expiry * 1000).toISOString() });
});

test('remote rejection omits the body and successful HTTP still needs the expected identity and margin', async () => {
  const rejected = await checkExistingOwner({ ...goodInput, request: async () => ({ status: 401, json: noCall }) });
  assert.deepEqual(rejected, { code: 'TEST_AUTH_REJECTED', http: 401 });
  const mismatched = await checkExistingOwner({ ...goodInput, request: async () => ({ status: 200, json: async () => ({ id: 'another-user', role: 'authenticated' }) }) });
  assert.deepEqual(mismatched, { code: 'TEST_AUTH_IDENTITY_MISMATCH' });
  let time = now;
  const expired = await checkExistingOwner({
    ...goodInput, now: () => time, request: async () => {
      time = expiry * 1000;
      return { status: 200, json: async () => ({ id: owner, role: 'authenticated' }) };
    },
  });
  assert.deepEqual(expired, { code: 'SESSION_EXPIRED_OR_TOO_SHORT' });
});
