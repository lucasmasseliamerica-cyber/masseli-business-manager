const APP_ORIGIN = 'http://127.0.0.1:5173';
const TEST_REF = 'msinksoilkluooxenecy';
const TEST_ORIGIN = 'https://' + TEST_REF + '.supabase.co';
const OWNER_A = 'f37e9907-47c4-48bf-94b7-9a6fa5de1f88';
const SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_VALIDITY_MS = 30_000;

function jwtClaims(value) {
  if (typeof value !== 'string' || value.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const part = value.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    const claims = JSON.parse(atob(part));
    return claims && typeof claims === 'object' && !Array.isArray(claims) ? claims : null;
  } catch { return null; }
}

function isPublicTestKey(key) {
  if (typeof key !== 'string') return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) return true;
  const claims = jwtClaims(key);
  return claims?.role === 'anon' && claims.ref === TEST_REF;
}

export async function checkExistingOwner({ origin, projectUrl, publicKey, readStoredSession, request = globalThis.fetch, now = Date.now }) {
  if (origin !== APP_ORIGIN || ![TEST_ORIGIN, TEST_ORIGIN + '/'].includes(projectUrl) || !isPublicTestKey(publicKey)) return { code: 'TEST_BINDING_DENIED' };

  let accessToken;
  try {
    const raw = readStoredSession();
    if (!raw) return { code: 'NO_STORED_SESSION' };
    accessToken = JSON.parse(raw)?.accessToken;
  } catch { return { code: 'LOCAL_SESSION_UNAVAILABLE' }; }

  const claims = jwtClaims(accessToken);
  if (!claims || claims.iss !== TEST_ORIGIN + '/auth/v1' || claims.role !== 'authenticated' || claims.aud !== 'authenticated') return { code: 'TEST_USER_TOKEN_DENIED' };
  if (claims.sub !== OWNER_A) return { code: 'NOT_OWNER_A' };
  if (typeof claims.session_id !== 'string' || !SESSION_UUID.test(claims.session_id)) return { code: 'SESSION_ID_UNAVAILABLE' };
  const expires = claims.exp * 1000;
  if (!Number.isSafeInteger(claims.exp) || !Number.isFinite(expires) || expires > 8.64e15 || expires <= now() + MIN_VALIDITY_MS) return { code: 'SESSION_EXPIRED_OR_TOO_SHORT' };

  try {
    const response = await request(TEST_ORIGIN + '/auth/v1/user', {
      method: 'GET',
      headers: { apikey: publicKey, Authorization: 'Bearer ' + accessToken },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 200) return { code: 'TEST_AUTH_REJECTED', http: response.status };
    const user = await response.json();
    if (user?.id !== OWNER_A || user.role !== 'authenticated' || user.is_anonymous === true) return { code: 'TEST_AUTH_IDENTITY_MISMATCH' };
    if (expires <= now() + MIN_VALIDITY_MS) return { code: 'SESSION_EXPIRED_OR_TOO_SHORT' };
    return { code: 'OWNER_A_SESSION_CONFIRMED', expiresUtc: new Date(expires).toISOString() };
  } catch { return { code: 'TEST_AUTH_READ_UNAVAILABLE' }; }
  finally { accessToken = undefined; }
}
