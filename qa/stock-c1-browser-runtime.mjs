// Local runtime only. Never authenticates, calls Supabase, or opens a checkpoint.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { StockSignal, STOCK_HOST, requireStock } from './stock-journey-core.mjs';

export const C1_RUNTIME_PORT = 4189;
export const C1_RUNTIME_HEALTH_PATH = '/__nexalvo_c1_health';
const origin = `http://127.0.0.1:${C1_RUNTIME_PORT}`;
const systemNames = ['PATH', 'SystemRoot', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE',
  'WINDIR', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'LD_LIBRARY_PATH', 'XDG_RUNTIME_DIR', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME'];
const systemEnvironment = env => Object.fromEntries(systemNames.filter(key => typeof env[key] === 'string').map(key => [key, env[key]]));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const bounded = async (promise, ms, fallback) => {
  let timer;
  try { return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(fallback), ms); })]); }
  finally { clearTimeout(timer); }
};
const diagnostic = (stage, reason, exitCode = null) => Object.freeze({ stage, reason, port: C1_RUNTIME_PORT,
  exit_code: Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255 ? exitCode : null });
function failure(code, stage, reason, exitCode) {
  const error = new StockSignal(code);
  error.runtimeDiagnostic = diagnostic(stage, reason, exitCode);
  return error;
}

export function resolveC1ChromiumExecutable(chromium, env = process.env) {
  let selected;
  try {
    selected = env.NEXALVO_QA_CHROMIUM_PATH || chromium.executablePath();
    if (typeof selected !== 'string' || !isAbsolute(selected) || !statSync(selected).isFile()) throw new Error('MISSING');
  } catch { throw failure('C1_BROWSER_EXECUTABLE_MISSING', 'RUNTIME_DEPENDENCIES', 'BROWSER_EXECUTABLE_MISSING'); }
  return selected;
}

// Checking the TCP listener also rejects occupied non-HTTP services. Never kill an occupant.
export async function probeC1LocalPort() {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => reject(failure(error?.code === 'EADDRINUSE' ? 'C1_LOCAL_PORT_IN_USE' : 'C1_LOCAL_PORT_UNAVAILABLE',
      'LOCAL_PORT', error?.code === 'EADDRINUSE' ? 'LOCAL_PORT_OCCUPIED' : 'PORT_PROBE_UNAVAILABLE')));
    probe.listen({ host: '127.0.0.1', port: C1_RUNTIME_PORT, exclusive: true }, () => probe.close(error => error
      ? reject(failure('C1_LOCAL_PORT_UNAVAILABLE', 'LOCAL_PORT', 'PORT_PROBE_UNAVAILABLE')) : resolve()));
  });
}

export async function prepareC1Runtime({ env = process.env, config, onStage = () => {}, fetchImpl = fetch,
  spawnImpl = spawn, importPlaywright = () => import('playwright'), probePortImpl = probeC1LocalPort,
  readinessTimeoutMs = 20000, fetchTimeoutMs = 1000, pollIntervalMs = 100, stopTimeoutMs = 2000 } = {}) {
  requireStock(config?.origin === `https://${STOCK_HOST}` && typeof config.key === 'string', 'C1_TEST_TARGET_REQUIRED');
  // Public frontend configuration only. Reject admin keys even if this helper is used on its own.
  let publicKey = /^sb_publishable_[a-z0-9_-]+$/i.test(config.key);
  if (!publicKey) {
    try { const claims = JSON.parse(Buffer.from(config.key.split('.')[1], 'base64url')); publicKey = claims.role === 'anon' && claims.ref === STOCK_HOST.split('.')[0]; }
    catch { /* fixed rejection below */ }
  }
  requireStock(publicKey, 'C1_PUBLIC_TEST_KEY_REQUIRED');
  const readinessLimit = Math.max(1, Math.min(20000, readinessTimeoutMs));
  const requestLimit = Math.max(1, Math.min(1000, fetchTimeoutMs));
  const pollLimit = Math.max(1, Math.min(250, pollIntervalMs));
  const stopLimit = Math.max(1, Math.min(5000, stopTimeoutMs));
  let stage = 'RUNTIME_DEPENDENCIES', child, browser, closed = false, exited = false, childFailure;
  const mark = next => { stage = next; onStage(next); };
  const alive = () => child && !exited && (child.exitCode === null || child.exitCode === undefined) && !childFailure;
  const close = async () => {
    if (closed) return;
    closed = true;
    if (browser) await bounded(Promise.resolve().then(() => browser.close()).catch(() => {}), stopLimit, null);
    if (child && !exited && (child.exitCode === null || child.exitCode === undefined)) {
      const ended = new Promise(resolve => { child.once('exit', resolve); child.once('close', resolve); });
      try { child.kill('SIGTERM'); } catch { /* no raw errors */ }
      await bounded(ended, stopLimit, null);
      if (!exited && (child.exitCode === null || child.exitCode === undefined)) {
        try { child.kill('SIGKILL'); } catch { /* only our child, never a foreign listener */ }
        await bounded(ended, stopLimit, null);
      }
    }
  };
  try {
    mark('RUNTIME_DEPENDENCIES');
    let chromium;
    try { ({ chromium } = await importPlaywright()); if (typeof chromium?.launch !== 'function') throw new Error('DEPENDENCY'); }
    catch { throw failure('C1_BROWSER_DEPENDENCIES_UNAVAILABLE', stage, 'PLAYWRIGHT_IMPORT_REJECTED'); }
    const executablePath = resolveC1ChromiumExecutable(chromium, env);
    mark('LOCAL_PORT');
    await probePortImpl();
    mark('VITE_START');
    const nonce = randomBytes(32).toString('hex');
    const childEnv = { ...systemEnvironment(env), VITE_SUPABASE_URL: config.origin,
      VITE_SUPABASE_ANON_KEY: config.key, NEXALVO_C1_SERVER_NONCE: nonce };
    try {
      child = spawnImpl(process.execPath, [fileURLToPath(new URL('./stock-c1-vite-server.mjs', import.meta.url))], {
        cwd: fileURLToPath(new URL('../', import.meta.url)), env: childEnv, stdio: 'ignore', windowsHide: true,
      });
      child.once('error', () => { childFailure = failure('C1_VITE_START_FAILED', 'VITE_START', 'VITE_SPAWN_REJECTED'); });
      child.once('exit', code => { exited = true; childFailure ||= failure('C1_VITE_EXITED', 'VITE_READY', 'VITE_EXITED', code); });
    } catch { throw failure('C1_VITE_START_FAILED', stage, 'VITE_SPAWN_REJECTED'); }
    mark('VITE_READY');
    const deadline = Date.now() + readinessLimit;
    let ready = false;
    while (Date.now() < deadline) {
      if (childFailure) throw childFailure;
      if (!alive()) throw failure('C1_VITE_EXITED', stage, 'VITE_EXITED', child?.exitCode);
      const attemptMs = Math.max(1, Math.min(requestLimit, deadline - Date.now()));
      // A cold Vite server commonly refuses the first connection. Catch that transient
      // failure within the bounded readiness loop, never let it escape as a raw error.
      const health = await bounded((async () => {
        try {
          const response = await fetchImpl(origin + C1_RUNTIME_HEALTH_PATH, { signal: AbortSignal.timeout(attemptMs), redirect: 'error', cache: 'no-store' });
          if (!response.ok) return false;
          const body = await response.json();
          return body?.kind === 'NEXALVO_C1_VITE' && body.nonce === nonce;
        } catch { return false; }
      })(), attemptMs, false);
      if (childFailure) throw childFailure;
      if (health && alive()) { ready = true; break; }
      await pause(Math.min(pollLimit, Math.max(1, deadline - Date.now())));
    }
    if (!ready) throw failure('C1_LOCAL_SERVER_UNAVAILABLE', stage, 'VITE_READY_TIMEOUT');
    mark('CHROMIUM_LAUNCH');
    try {
      browser = await chromium.launch({ headless: true, executablePath, timeout: 15000, env: systemEnvironment(env) });
    } catch { throw failure('C1_CHROMIUM_LAUNCH_FAILED', stage, 'CHROMIUM_LAUNCH_REJECTED'); }
    if (childFailure || !alive()) throw childFailure || failure('C1_VITE_EXITED', stage, 'VITE_EXITED', child?.exitCode);
    return { browser, close, proof: Object.freeze({ local_server_verified: true, browser_launched: true,
      port: C1_RUNTIME_PORT, readonly_runtime_only: true }) };
  } catch (error) {
    await close();
    if (error instanceof StockSignal) throw error;
    const mapping = {
      RUNTIME_DEPENDENCIES: ['C1_BROWSER_DEPENDENCIES_UNAVAILABLE', 'PLAYWRIGHT_IMPORT_REJECTED'],
      LOCAL_PORT: ['C1_LOCAL_PORT_UNAVAILABLE', 'PORT_PROBE_UNAVAILABLE'],
      VITE_START: ['C1_VITE_START_FAILED', 'VITE_SPAWN_REJECTED'],
      VITE_READY: ['C1_LOCAL_SERVER_UNAVAILABLE', 'VITE_READY_TIMEOUT'],
      CHROMIUM_LAUNCH: ['C1_CHROMIUM_LAUNCH_FAILED', 'CHROMIUM_LAUNCH_REJECTED'],
    };
    const [code, reason] = mapping[stage];
    throw failure(code, stage, reason);
  }
}
