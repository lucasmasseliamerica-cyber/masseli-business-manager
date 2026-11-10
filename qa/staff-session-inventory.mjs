const APP = 'http://127.0.0.1:5173';
const TEST = 'https://msinksoilkluooxenecy.supabase.co';
const actorById = new Map([
  ['96042557-c717-4750-9dd1-88b36958c6d1', 'MANAGER'],
  ['0e03a482-5b3c-4225-baf7-4ae1ab7e9e58', 'EMPLOYEE'],
]);

export function identifyLocalStaffSession({ origin, project, readSession, now = Date.now() }) {
  if (origin !== APP || ![TEST, TEST + '/'].includes(project)) return { code: 'TEST_BINDING_DENIED' };
  try {
    const record = readSession();
    if (!record) return { code: 'NO_STORED_SESSION' };
    const access = JSON.parse(record)?.accessToken;
    if (typeof access !== 'string' || access.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(access)) return { code: 'SESSION_FORMAT_DENIED' };
    const part = access.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    const c = JSON.parse(atob(part));
    if (c?.iss !== TEST + '/auth/v1' || c.role !== 'authenticated' || c.aud !== 'authenticated') return { code: 'TEST_USER_TOKEN_DENIED' };
    const actor = actorById.get(c.sub);
    if (!actor) return { code: 'NOT_MANAGER_OR_EMPLOYEE' };
    if (typeof c.session_id !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(c.session_id)) return { code: 'SESSION_ID_UNAVAILABLE' };
    const expiry = c.exp * 1000;
    if (!Number.isSafeInteger(c.exp) || expiry <= now + 30_000 || expiry > 8.64e15) return { code: 'SESSION_EXPIRED_OR_TOO_SHORT', actor };
    return { code: 'LOCAL_SESSION_CANDIDATE', actor, expiresUtc: new Date(expiry).toISOString() };
  } catch { return { code: 'LOCAL_SESSION_UNAVAILABLE' }; }
}

if (typeof document !== 'undefined') {
  const button = document.getElementById('inspect');
  button.addEventListener('click', () => {
    const r = identifyLocalStaffSession({
      origin: window.location.origin,
      project: import.meta.env.VITE_SUPABASE_URL,
      readSession: () => window.localStorage.getItem('nexalvo.supabase.session.v1'),
    });
    document.getElementById('result').textContent = [r.code, r.actor, r.expiresUtc].filter(Boolean).join(' · ');
  });
}
