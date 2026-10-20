#!/usr/bin/env node
// Configuration only. No SQL, deployment, Auth changes or commercial RPC invocation.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const TEST_PROJECT_REF = 'msinksoilkluooxenecy';
export const LOCAL_ORIGIN = 'http://127.0.0.1:5173';
const TEST_URL = `https://${TEST_PROJECT_REF}.supabase.co`;
const SECRET_NAMES = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

export async function configurePlatformAdminTest({ env = process.env, fetchImpl = fetch, apply = false } = {}) {
  const result = {
    project_ref: TEST_PROJECT_REF,
    mode: apply ? 'APPLY_CONFIGURATION_ONLY' : 'DRY_RUN',
    status: 'BLOCKED',
    changed: [],
  };
  const configuredUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || TEST_URL;
  try {
    if (new URL(configuredUrl).href !== `${TEST_URL}/`) {
      return { ...result, reason: 'TEST_URL_REQUIRED' };
    }
  } catch { return { ...result, reason: 'TEST_URL_REQUIRED' }; }
  if (!env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return { ...result, reason: 'MANAGEMENT_ACCESS_UNAVAILABLE' };
  }

  const endpoint = `https://api.supabase.com/v1/projects/${TEST_PROJECT_REF}/secrets`;
  const managementHeaders = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN.trim()}` };
  const request = (url, options) => fetchImpl(url, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  try {
    const secretResponse = await request(endpoint, { headers: managementHeaders });
    if (!secretResponse.ok) {
      return { ...result, reason: 'MANAGEMENT_ACCESS_REJECTED', http_status: secretResponse.status };
    }
    const secrets = await secretResponse.json();
    if (!Array.isArray(secrets) || secrets.some(s => typeof s?.name !== 'string')) {
      return { ...result, reason: 'INVALID_SECRET_INVENTORY' };
    }
    // Do not inspect or emit secret values or digests returned by the management service.
    const names = new Set(secrets.map(s => s.name));
    result.service_variables_present = Object.fromEntries(SECRET_NAMES.map(n => [n, names.has(n)]));
    if (SECRET_NAMES.some(n => !names.has(n))) {
      return { ...result, reason: 'REQUIRED_SERVICE_VARIABLE_MISSING' };
    }
    const probeOrigin = () => request(`${TEST_URL}/functions/v1/platform-admin`, {
      method: 'OPTIONS',
      headers: {
        Origin: LOCAL_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,apikey,content-type',
      },
    });
    const matchesLocalOrigin = response => response.status === 204
      && response.headers.get('access-control-allow-origin') === LOCAL_ORIGIN;
    const corsResponse = await probeOrigin();
    result.local_origin_allowed = matchesLocalOrigin(corsResponse);
    const updates = [];
    if (!result.local_origin_allowed) {
      if (names.has('PLATFORM_ADMIN_ALLOWED_ORIGINS')) {
        // An inventory is not the existing plaintext allowlist. Never overwrite it blindly.
        return { ...result, reason: 'EXISTING_ORIGINS_REQUIRE_SAFE_MERGE' };
      }
      if (corsResponse.status !== 403) {
        return { ...result, reason: 'ORIGIN_CONFIGURATION_UNVERIFIED' };
      }
      updates.push({ name: 'PLATFORM_ADMIN_ALLOWED_ORIGINS', value: LOCAL_ORIGIN });
    }
    if (!names.has('NEXALVO_ALLOWED_PROJECT_REF')) {
      updates.push({ name: 'NEXALVO_ALLOWED_PROJECT_REF', value: TEST_PROJECT_REF });
    }
    result.planned_updates = updates.map(u => u.name);
    if (apply && updates.length) {
      const updated = await request(endpoint, {
        method: 'POST',
        headers: { ...managementHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!updated.ok) return { ...result, reason: 'CONFIGURATION_UPDATE_REJECTED', http_status: updated.status };
      result.changed = updates.map(u => u.name);
      result.local_origin_allowed = matchesLocalOrigin(await probeOrigin());
      if (!result.local_origin_allowed) return { ...result, reason: 'ORIGIN_STILL_UNVERIFIED' };
    }
    if (!apply && updates.length) return { ...result, status: 'READY', reason: 'CONFIGURATION_CHANGE_PREPARED' };

    const anonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
    if (!anonKey) return { ...result, reason: 'PUBLIC_KEY_REQUIRED_FOR_CONFIGURATION_PROBE' };
    const configured = await request(`${TEST_URL}/functions/v1/platform-admin`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'list_businesses' }),
    });
    const body = await configured.json().catch(() => null);
    result.configuration_probe_http_status = configured.status;
    if ([401, 403].includes(configured.status)
        && ['AUTH_REQUIRED', 'AUTH_INVALID', 'PLATFORM_ACCESS_DENIED'].includes(body?.code)) {
      // This proves configuration and denial only, never authenticated panel acceptance.
      return { ...result, status: 'PASS', reason: 'CONFIGURED_AUTHENTICATED_VALIDATION_STILL_REQUIRED' };
    }
    return { ...result, reason: body?.code === 'PLATFORM_NOT_CONFIGURED'
      ? 'PLATFORM_CONFIGURATION_STILL_INCOMPLETE' : 'CONFIGURATION_PROBE_UNVERIFIED' };
  } catch {
    // Never forward URLs, headers, response bodies or exception messages to logs.
    return { ...result, reason: 'CONFIGURATION_ACCESS_UNAVAILABLE' };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let branch = '';
  try { branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch {}
  const result = branch === 'automation/nexalvo-qa-actions'
    ? await configurePlatformAdminTest({ apply: process.argv.includes('--apply') })
    : { status: 'BLOCKED', reason: 'QA_BRANCH_REQUIRED', changed: [] };
  console.log(JSON.stringify(result));
  process.exitCode = ['PASS', 'READY'].includes(result.status) ? 0 : 2;
}
