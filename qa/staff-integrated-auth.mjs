import assert from 'node:assert/strict';
import https from 'node:https';

export const PROJECT = 'msinksoilkluooxenecy';
export const ORIGIN = `https://${PROJECT}.supabase.co`;
export const ACTORS = Object.freeze({
  OWNER_A: 'f37e9907-47c4-48bf-94b7-9a6fa5de1f88',
  MANAGER: '96042557-c717-4750-9dd1-88b36958c6d1',
  EMPLOYEE: '0e03a482-5b3c-4225-baf7-4ae1ab7e9e58',
});
const knownCodes = new Set([
  'bad_json', 'bad_jwt', 'captcha_failed', 'conflict', 'email_address_invalid',
  'email_not_confirmed', 'email_provider_disabled', 'hook_timeout', 'hook_timeout_after_retry',
  'insufficient_aal', 'invalid_credentials', 'no_authorization', 'over_request_rate_limit',
  'provider_disabled', 'request_timeout', 'session_expired', 'session_not_found',
  'unexpected_failure', 'user_banned', 'user_not_found', 'validation_failed', 'weak_password',
]);
const uncertainCodes = new Set(['request_timeout', 'hook_timeout', 'hook_timeout_after_retry', 'unexpected_failure']);

function jwt(token) {
  assert(typeof token === 'string' && token.length <= 8192 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token), 'JWT_FORMAT');
  const [header, body] = token.split('.');
  assert(!token.split('.').some(part => part.length % 4 === 1), 'JWT_ENCODING');
  const algorithm = JSON.parse(Buffer.from(header, 'base64url')).alg;
  assert(typeof algorithm === 'string' && algorithm && algorithm.toLowerCase() !== 'none', 'JWT_ALGORITHM');
  const claims = JSON.parse(Buffer.from(body, 'base64url'));
  assert(claims && typeof claims === 'object' && !Array.isArray(claims), 'JWT_CLAIMS');
  return claims;
}

export function publicKeyForTest(key) {
  if (typeof key === 'string' && /^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) return key;
  const claims = jwt(key);
  assert(claims.role === 'anon' && claims.ref === PROJECT && claims.exp * 1000 > Date.now(), 'PUBLIC_KEY_SCOPE');
  return key;
}

function adminHeaders(key) {
  if (/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key)) return { apikey: key };
  const claims = jwt(key);
  assert(claims.role === 'service_role' && claims.ref === PROJECT && claims.exp * 1000 > Date.now() + 600_000, 'ADMIN_KEY_SCOPE');
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function checkToken(token, actor, end) {
  const claims = jwt(token);
  assert(claims.sub === ACTORS[actor] && claims.iss === ORIGIN + '/auth/v1' &&
    claims.role === 'authenticated' && claims.aud === 'authenticated', 'USER_TOKEN_SCOPE');
  assert(Number.isSafeInteger(claims.exp) && claims.exp * 1000 > Math.max(end, Date.now()) + 30_000, 'USER_TOKEN_EXPIRY');
  assert(typeof claims.session_id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(claims.session_id), 'USER_TOKEN_SESSION');
  return claims.session_id.toLowerCase();
}

function failure(response, dispatchEntered) {
  const http = response?.status ?? null;
  const candidates = [response?.codeHeader, response?.value?.error_code, response?.value?.code].flat();
  const codes = [...new Set(candidates.filter(code => knownCodes.has(code)))];
  return {
    http_status: http,
    public_code: codes.length > 1 ? 'PUBLIC_CODE_CONFLICT' : codes[0] ?? 'PUBLIC_CODE_UNAVAILABLE',
    passed: false,
    result_uncertain: dispatchEntered && (
      ![400, 401, 403, 404, 405, 409, 422, 429].includes(http) ||
      codes.length > 1 || codes.some(code => uncertainCodes.has(code))
    ),
  };
}

// Fresh TLS connection, with no redirect handler or application retry. Bodies remain in memory.
export function requestTestAuth({ method, path, headers, body, timeout }) {
  assert(
    method === 'GET' && (path === '/auth/v1/user' || Object.values(ACTORS).some(id => path === `/auth/v1/admin/users/${id}`)) ||
    method === 'POST' && path === '/auth/v1/token?grant_type=password',
    'AUTH_ROUTE_DENIED',
  );
  return new Promise((resolve, reject) => {
    const encoded = body === undefined ? undefined : JSON.stringify(body);
    const req = https.request(ORIGIN + path, {
      method, agent: false, rejectUnauthorized: true, signal: AbortSignal.timeout(timeout),
      headers: { ...headers, Connection: 'close', ...(encoded === undefined ? {} : {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(encoded),
      }) },
    }, res => {
      const chunks = [];
      let length = 0;
      res.on('error', () => reject(new Error('AUTH_RESPONSE_TRANSPORT')));
      res.on('data', chunk => {
        length += chunk.length;
        if (length > 262144) req.destroy(new Error('AUTH_RESPONSE_LIMIT'));
        else chunks.push(chunk);
      });
      res.on('end', () => {
        let value = null;
        const raw = Buffer.concat(chunks);
        try { value = JSON.parse(raw.toString('utf8')); } catch {}
        finally { raw.fill(0); for (const chunk of chunks) chunk.fill(0); }
        resolve({ status: res.statusCode, codeHeader: res.headers['x-sb-error-code'], value });
      });
    });
    req.on('error', () => reject(new Error('AUTH_TRANSPORT')));
    req.end(encoded);
  });
}

// Credential input, TLS requests and business execution share this process. No token is returned
// to the CLI or journal. The caller owns the Map for the duration of the business window.
export async function acquireStaffSessions({ inputs, ownerMode, end, publicKey, sessions, gate, save, request = requestTestAuth }) {
  const ids = new Set();
  const loginActors = ownerMode === 'login' ? ['OWNER_A', 'MANAGER', 'EMPLOYEE'] : ['MANAGER', 'EMPLOYEE'];
  const emails = new Map();
  let authenticatedReads = 0;
  let actor = 'OWNER_A';
  let phase = 'LOCAL_ADMISSION';
  let verified = false;
  let admin;
  const send = (method, path, headers, body) => request({ method, path, headers, body, timeout: gate() });
  const checkIdentity = async (who, token) => {
    const sessionId = checkToken(token, who, end);
    assert(!ids.has(sessionId), 'SESSION_INDEPENDENCE');
    authenticatedReads++;
    let identity;
    try {
      identity = await send('GET', '/auth/v1/user', { apikey: publicKey, Authorization: `Bearer ${token}` });
    } catch {
      save(`integrated-auth-${who}-identity.json`, {
        http_status: null, public_code: 'PUBLIC_CODE_UNAVAILABLE', passed: false, result_uncertain: phase === 'IDENTITY_READ',
      });
      throw new Error('AUTH_IDENTITY_STOP');
    }
    const valid = identity.status === 200 && identity.value?.id === ACTORS[who] &&
      identity.value?.role === 'authenticated' && identity.value?.is_anonymous !== true;
    save(`integrated-auth-${who}-identity.json`, valid ? {
      http_status: 200, identity_pass: true, pid: process.pid,
    } : { ...failure(identity, false), result_uncertain: phase === 'IDENTITY_READ' });
    assert(valid, 'AUTH_IDENTITY_DENIED');
    checkToken(token, who, end);
    ids.add(sessionId);
    sessions.set(who, token);
  };
  const readAdmin = async who => {
    actor = who;
    phase = 'ADMIN_READ';
    gate();
    save(`integrated-auth-${who}-admin-attempt.json`, { actor: who, utc: new Date().toISOString() });
    const response = await send('GET', `/auth/v1/admin/users/${ACTORS[who]}`, admin);
    const user = response.value?.user ?? response.value;
    const valid = response.status === 200 && user?.id === ACTORS[who] && user?.role === 'authenticated' &&
      user.is_anonymous !== true && typeof user.email === 'string' && user.email.trim() && user.email_confirmed_at;
    save(`integrated-auth-${who}-admin-result.json`, valid ? { http_status: 200, identity_pass: true } : failure(response, false));
    assert(valid, 'AUTH_ADMIN_IDENTITY_DENIED');
    emails.set(who, user.email);
  };
  const login = async who => {
    actor = who;
    phase = 'LOGIN';
    const prefix = `integrated-auth-${who}-login`;
    let response;
    let entered = false;
    gate();
    save(prefix + '.intent.json', { actor: who, id: ACTORS[who], operation: 'AUTH_PASSWORD_LOGIN_ONLY', utc: new Date().toISOString() });
    gate();
    save(prefix + '.reserve.json', { actor: who, attempts_reserved: 1, no_replay: true, utc: new Date().toISOString() });
    try {
      const timeout = gate();
      entered = true;
      response = await request({
        method: 'POST', path: '/auth/v1/token?grant_type=password',
        headers: { apikey: publicKey }, body: { email: emails.get(who), password: inputs[who] }, timeout,
      });
      assert(response.status === 200 && response.value?.user?.id === ACTORS[who], 'AUTH_LOGIN_IDENTITY_DENIED');
      const token = response.value.access_token;
      checkToken(token, who, end);
      save(prefix + '.result.json', { http_status: 200, passed: true, result_uncertain: false });
      response = undefined;
      phase = 'IDENTITY_READ';
      await checkIdentity(who, token);
    } catch {
      if (phase === 'LOGIN') {
        try { save(prefix + '.result.json', failure(response, entered)); } catch {}
      }
      throw new Error('AUTH_LOGIN_OR_IDENTITY_STOP');
    } finally {
      response = undefined;
      delete inputs[who];
      emails.delete(who);
    }
  };
  try {
    assert(ownerMode === 'existing' || ownerMode === 'login', 'OWNER_MODE_DENIED');
    publicKeyForTest(publicKey);
    admin = adminHeaders(inputs.ADMIN);
    delete inputs.ADMIN;
    for (const who of loginActors) assert(typeof inputs[who] === 'string' && inputs[who].length > 0 && inputs[who].length <= 4096, 'LOCAL_PASSWORD_INPUT');
    if (ownerMode === 'existing') {
      phase = 'OWNER_IDENTITY';
      await checkIdentity(actor, inputs.OWNER_A);
      delete inputs.OWNER_A;
    } else {
      await readAdmin(actor);
      await login(actor);
    }
    for (const who of ['MANAGER', 'EMPLOYEE']) await readAdmin(who);
    admin = undefined;
    for (const who of ['MANAGER', 'EMPLOYEE']) await login(who);
    verified = true;
    return { authenticatedReads, actorCount: sessions.size, pid: process.pid };
  } finally {
    admin = undefined;
    emails.clear();
    ids.clear();
    for (const field of Object.keys(inputs)) delete inputs[field];
    if (!verified) {
      sessions.clear();
      try { save('integrated-auth-stopped.json', { phase, actor, authenticatedReads, no_retry: true }); } catch {}
    }
  }
}
