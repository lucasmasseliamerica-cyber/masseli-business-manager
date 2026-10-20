import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PROJECT = 'msinksoilkluooxenecy';
const BASE = `https://${PROJECT}.supabase.co`;
const ORIGIN = 'http://127.0.0.1:5173';
const SAFE_CODES = new Set(['PLATFORM_NOT_CONFIGURED', 'AUTH_REQUIRED', 'AUTH_INVALID', 'ACCESS_DENIED', 'ORIGIN_DENIED', 'PLATFORM_DEPENDENCY_FAILED']);

// Only OPTIONS, Auth/profile GETs and the two read-only Edge operations are permitted here.
// An existing user session must be supplied by the secure execution environment, never in argv.
export async function verifyPlatformAdminReadonlyTest({ env = process.env, fetchImpl = fetch } = {}) {
  const result = { project_ref: PROJECT, status: 'BLOCKED', checks: {}, mutations: 0 };
  const blocked = reason => ({ ...result, status: Object.values(result.checks).some(check => check.status === 'FAIL') ? 'FAIL' : 'BLOCKED', reason });
  const publicKey = env.VITE_SUPABASE_ANON_KEY || env.QA_SUPABASE_ANON_KEY;
  const session = env.NEXALVO_PLATFORM_ADMIN_ACCESS_TOKEN;
  if ((env.VITE_SUPABASE_URL || env.QA_SUPABASE_URL || '').replace(/\/$/, '') !== BASE || !publicKey) {
    return { ...result, reason: 'TEST_PUBLIC_CONFIGURATION_REQUIRED' };
  }
  const request = async (path, options) => {
    const response = await fetchImpl(`${BASE}${path}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const body = await response.json().catch(() => null);
    return { response, body };
  };
  const edgeRead = (operation, token) => request('/functions/v1/platform-admin', {
    method: 'POST', headers: { apikey: publicKey, ...(token ? { Authorization: `Bearer ${token}` } : {}), Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation }),
  });
  try {
    for (const [key, origin, expectedStatus, allow] of [
      ['cors_local', ORIGIN, 204, true], ['cors_unknown', 'https://nexalvo-untrusted.invalid', 403, false],
    ]) {
      const { response } = await request('/functions/v1/platform-admin', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, apikey, content-type' } });
      const actualOrigin = response.headers.get('access-control-allow-origin');
      const passed = response.status === expectedStatus && (allow ? actualOrigin === origin : actualOrigin === null);
      result.checks[key] = { status: passed ? 'PASS' : 'FAIL', http_status: response.status };
    }
    const anonymous = await edgeRead('list_businesses');
    const code = SAFE_CODES.has(anonymous.body?.code) ? anonymous.body.code : 'UNCLASSIFIED';
    if (anonymous.response.status === 503 && code === 'PLATFORM_NOT_CONFIGURED') {
      result.checks.edge_configuration = { status: 'BLOCKED', http_status: 503, code };
      return blocked('EDGE_CONFIGURATION_REQUIRED');
    }
    const denied = [401, 403].includes(anonymous.response.status) && ['AUTH_REQUIRED', 'AUTH_INVALID', 'ACCESS_DENIED'].includes(code);
    result.checks.anonymous_denied = { status: denied ? 'PASS' : 'FAIL', http_status: anonymous.response.status, code };
    if (Object.values(result.checks).some(check => check.status === 'FAIL')) return { ...result, status: 'FAIL', reason: 'EDGE_SECURITY_CHECK_FAILED' };
    if (!session) return blocked('SECURE_SUPERADMIN_SESSION_REQUIRED');
    const headers = { apikey: publicKey, Authorization: `Bearer ${session}` };
    const auth = await request('/auth/v1/user', { method: 'GET', headers });
    const actor = auth.body;
    if (auth.response.status !== 200 || !/^[0-9a-f-]{36}$/i.test(actor?.id || '') || actor.is_anonymous === true
      || actor.app_metadata?.nexalvo_platform_role !== 'SUPERADMIN') {
      result.checks.superadmin_identity = { status: 'BLOCKED', http_status: auth.response.status };
      return blocked('SIGNED_SUPERADMIN_SESSION_REQUIRED');
    }
    const profile = await request(`/rest/v1/users?select=active,role&id=eq.${encodeURIComponent(actor.id)}&limit=2`, { method: 'GET', headers });
    const profiles = profile.body;
    if (profile.response.status !== 200 || !Array.isArray(profiles) || profiles.length !== 1 || profiles[0].active !== true) {
      result.checks.active_profile = { status: 'BLOCKED', http_status: profile.response.status };
      return blocked('ACTIVE_TENANT_PROFILE_REQUIRED');
    }
    result.checks.superadmin_identity = { status: 'PASS', active_profile: true };
    for (const [operation, field] of [['list_businesses', 'businesses'], ['list_audit_logs', 'audit_logs']]) {
      const { response, body } = await edgeRead(operation, session);
      const passed = response.status === 200 && body?.ok === true && Array.isArray(body[field]);
      result.checks[operation] = { status: passed ? 'PASS' : 'FAIL', http_status: response.status, ...(passed ? { row_count: body[field].length } : {}) };
    }
    result.status = Object.values(result.checks).every(check => check.status === 'PASS') ? 'PASS' : 'FAIL';
    return result;
  } catch {
    return blocked('READONLY_NETWORK_OR_RESPONSE_UNAVAILABLE');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let branch = '';
  try { branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(); } catch { /* fail closed */ }
  const result = branch === 'automation/nexalvo-qa-actions'
    ? await verifyPlatformAdminReadonlyTest()
    : { project_ref: PROJECT, status: 'BLOCKED', reason: 'QA_BRANCH_REQUIRED', mutations: 0 };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.status === 'PASS' ? 0 : 2;
}
