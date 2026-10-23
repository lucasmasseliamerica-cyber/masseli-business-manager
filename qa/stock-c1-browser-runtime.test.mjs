import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer as createTcpServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareC1Runtime, resolveC1ChromiumExecutable, probeC1LocalPort, C1_RUNTIME_PORT,
  C1_RUNTIME_HEALTH_PATH } from './stock-c1-browser-runtime.mjs';

const config = { origin: 'https://msinksoilkluooxenecy.supabase.co', key: 'sb_publishable_SYNTHETIC_ONLY' };
const privateMarker = 'SYNTHETIC_PRIVATE_VALUE_NEVER_EXPORT';
const rawFailure = `Bearer ${privateMarker} person@example.invalid C:\\private\\checkpoint.json`;
function fixture({ fetcher, launch, spawn, probe, importer } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'nexalvo-c1-runtime-synthetic-'));
  const regular = join(directory, 'regular-chromium'); writeFileSync(regular, 'SYNTHETIC BROWSER MARKER');
  const child = new EventEmitter(); child.exitCode = null; child.kills = [];
  child.kill = signal => { child.kills.push(signal); child.exitCode = 0; child.emit('exit', 0); return true; };
  const seen = { stages: [], requests: [], launches: [], spawned: [], browserCloses: 0 };
  const browser = { close: async () => { seen.browserCloses++; } };
  const chromium = { executablePath: () => regular, launch: async options => {
    seen.launches.push(options); return launch ? launch(options, browser, child) : browser;
  } };
  const env = { PATH: process.env.PATH, UNRELATED_ADMIN_SECRET: privateMarker,
    QA_TWO_TENANT_A_PASSWORD: privateMarker, QA_TWO_TENANT_B_PASSWORD: privateMarker,
    QA_TWO_TENANT_A_EMAIL: 'person@example.invalid', NEXALVO_CLAIM_CHANGE_AUTHORIZED: privateMarker,
    NODE_OPTIONS: '--require=/private/module', VITE_OTHER_SECRET: privateMarker };
  const options = { env, config, onStage: stage => seen.stages.push(stage), readinessTimeoutMs: 60,
    fetchTimeoutMs: 10, pollIntervalMs: 1, stopTimeoutMs: 2,
    probePortImpl: probe || (async () => {}), importPlaywright: importer || (async () => ({ chromium })),
    spawnImpl: (...args) => { seen.spawned.push(args); return spawn ? spawn(child, args) : child; },
    fetchImpl: async (url, opts) => {
      seen.requests.push({ url, opts });
      assert.equal(url, `http://127.0.0.1:${C1_RUNTIME_PORT}${C1_RUNTIME_HEALTH_PATH}`);
      assert.equal(opts.redirect, 'error'); assert.equal(opts.cache, 'no-store'); assert.ok(opts.signal);
      const nonce = seen.spawned[0]?.[2]?.env.NEXALVO_C1_SERVER_NONCE;
      return fetcher ? fetcher(nonce, seen.requests.length, child) : new Response(JSON.stringify({ kind: 'NEXALVO_C1_VITE', nonce }));
    },
  };
  return { directory, regular, child, browser, chromium, seen, options, dispose: () => rmSync(directory, { recursive: true, force: true }) };
}
function safeFailure(error, code, stage, reason, exit_code = null) {
  assert.equal(error.code, code);
  assert.deepEqual(error.runtimeDiagnostic, { stage, reason, port: 4189, exit_code });
  assert.ok(Object.isFrozen(error.runtimeDiagnostic));
  assert.doesNotMatch(JSON.stringify({ code: error.code, runtime: error.runtimeDiagnostic }), /SYNTHETIC_|Bearer|example\.invalid|https?:|\\private|nonce/);
  return true;
}

test('C1 resolver rejects missing relative or directory paths without exposing their values', () => {
  const f = fixture();
  try {
    assert.equal(resolveC1ChromiumExecutable(f.chromium, {}), f.regular);
    const custom = join(f.directory, 'custom-chromium'); writeFileSync(custom, 'SYNTHETIC');
    assert.equal(resolveC1ChromiumExecutable(f.chromium, { NEXALVO_QA_CHROMIUM_PATH: custom }), custom);
    for (const path of ['relative-browser', join(f.directory, 'missing'), f.directory])
      assert.throws(() => resolveC1ChromiumExecutable(f.chromium, { NEXALVO_QA_CHROMIUM_PATH: path }), error =>
        safeFailure(error, 'C1_BROWSER_EXECUTABLE_MISSING', 'RUNTIME_DEPENDENCIES', 'BROWSER_EXECUTABLE_MISSING'));
  } finally { f.dispose(); }
});

test('C1 explicitly launches the executable that passed validation instead of a different missing headless shell', async () => {
  const f = fixture({ launch: async (options, browser) => {
    if (!options.executablePath) throw new Error('SYNTHETIC MISSING HEADLESS SHELL');
    return browser;
  } });
  try {
    // Original launcher probe passes for the regular binary, but the original
    // headless launch without an explicit path asks Playwright for another binary.
    assert.equal(resolveC1ChromiumExecutable(f.chromium, {}), f.regular);
    await assert.rejects(f.chromium.launch({ headless: true }), /MISSING HEADLESS SHELL/);
    const runtime = await prepareC1Runtime(f.options);
    assert.equal(f.seen.launches.at(-1).executablePath, f.regular);
    assert.equal(f.seen.launches.at(-1).headless, true); assert.equal(f.seen.launches.at(-1).timeout, 15000);
    assert.deepEqual(f.seen.stages, ['RUNTIME_DEPENDENCIES', 'LOCAL_PORT', 'VITE_START', 'VITE_READY', 'CHROMIUM_LAUNCH']);
    assert.deepEqual(runtime.proof, { local_server_verified: true, browser_launched: true, port: 4189, readonly_runtime_only: true });
    await runtime.close(); await runtime.close();
    assert.equal(f.seen.browserCloses, 1); assert.deepEqual(f.child.kills, ['SIGTERM']);
  } finally { f.dispose(); }
});

test('C1 cold Vite connection refusal is retried only inside bounded local readiness and no raw exception escapes', async () => {
  const refused = () => { const error = new Error(rawFailure); error.code = 'ECONNREFUSED'; throw error; };
  // The original loop already caught ECONNREFUSED. Preserve that behavior while
  // adding bounded requests and ownership verification; it is not the proven old cause.
  assert.equal(await Promise.resolve().then(refused).then(response => response.ok).catch(() => false), false);
  const f = fixture({ fetcher: async (nonce, attempt) => {
    if (attempt === 1) refused();
    return new Response(JSON.stringify({ kind: 'NEXALVO_C1_VITE', nonce }));
  } });
  try {
    const runtime = await prepareC1Runtime(f.options);
    assert.equal(f.seen.requests.length, 2); assert.equal(f.seen.launches.length, 1);
    await runtime.close();
  } finally { f.dispose(); }
});

for (const http of [false, true]) test(`C1 TCP port check rejects an occupied ${http ? 'HTTP' : 'non-HTTP'} listener without killing it`, async () => {
  const server = http ? createHttpServer((request, response) => response.end('SYNTHETIC FOREIGN SERVER'))
    : createTcpServer(socket => socket.end('SYNTHETIC FOREIGN SERVICE'));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host: '127.0.0.1', port: 4189, exclusive: true }, resolve); });
  try {
    await assert.rejects(probeC1LocalPort(), error => safeFailure(error, 'C1_LOCAL_PORT_IN_USE', 'LOCAL_PORT', 'LOCAL_PORT_OCCUPIED'));
    assert.equal(server.listening, true);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('C1 child and Chromium environments omit user sessions administrative keys and Node injection options', async () => {
  const f = fixture();
  try {
    const runtime = await prepareC1Runtime(f.options);
    const child = f.seen.spawned[0][2]; assert.equal(child.stdio, 'ignore'); assert.equal(child.windowsHide, true);
    assert.equal(child.env.VITE_SUPABASE_URL, config.origin); assert.equal(child.env.VITE_SUPABASE_ANON_KEY, config.key);
    assert.match(child.env.NEXALVO_C1_SERVER_NONCE, /^[a-f0-9]{64}$/);
    for (const environment of [child.env, f.seen.launches[0].env]) {
      assert.doesNotMatch(JSON.stringify(environment), /SYNTHETIC_PRIVATE|person@example|NODE_OPTIONS|UNRELATED_ADMIN_SECRET|QA_TWO_TENANT/);
    }
    assert.equal(f.seen.launches[0].env.NEXALVO_C1_SERVER_NONCE, undefined);
    assert.doesNotMatch(JSON.stringify(runtime.proof), /nonce|chromium|SYNTHETIC_|\/tmp|[A-Z]:\\/);
    await runtime.close();
  } finally { f.dispose(); }
});

for (const wrong of ['nonce', 'kind', 'invalid-json']) test(`C1 HTTP200 with ${wrong} mismatch never counts as its own ready Vite server`, async () => {
  const f = fixture({ fetcher: nonce => new Response(wrong === 'invalid-json' ? rawFailure
    : JSON.stringify({ kind: wrong === 'kind' ? 'FOREIGN_SERVICE' : 'NEXALVO_C1_VITE', nonce: wrong === 'nonce' ? 'WRONG_NONCE' : nonce })) });
  f.options.readinessTimeoutMs = 15;
  try {
    await assert.rejects(prepareC1Runtime(f.options), error => safeFailure(error, 'C1_LOCAL_SERVER_UNAVAILABLE', 'VITE_READY', 'VITE_READY_TIMEOUT'));
    assert.deepEqual(f.child.kills, ['SIGTERM']); assert.equal(f.seen.launches.length, 0);
  } finally { f.dispose(); }
});

test('C1 a non-resolving health request is bounded even when a fetch implementation ignores AbortSignal', async () => {
  const f = fixture({ fetcher: () => new Promise(() => {}) });
  f.options.readinessTimeoutMs = 20; f.options.fetchTimeoutMs = 5;
  const started = Date.now();
  try {
    await assert.rejects(prepareC1Runtime(f.options), error => safeFailure(error, 'C1_LOCAL_SERVER_UNAVAILABLE', 'VITE_READY', 'VITE_READY_TIMEOUT'));
    assert.ok(Date.now() - started < 3000); assert.deepEqual(f.child.kills, ['SIGTERM']);
    assert.equal(f.seen.launches.length, 0);
  } finally { f.dispose(); }
});

for (const type of ['throw', 'event', 'exit']) test(`C1 Vite ${type} failure is classified and cleanup preserves the original sanitized cause`, async () => {
  const f = fixture({ spawn: child => {
    if (type === 'throw') throw new Error(rawFailure);
    queueMicrotask(() => {
      if (type === 'event') child.emit('error', new Error(rawFailure));
      else { child.exitCode = 7; child.emit('exit', 7); }
    });
    return child;
  } });
  try {
    await assert.rejects(prepareC1Runtime(f.options), error => safeFailure(error,
      type === 'exit' ? 'C1_VITE_EXITED' : 'C1_VITE_START_FAILED', type === 'exit' ? 'VITE_READY' : 'VITE_START',
      type === 'exit' ? 'VITE_EXITED' : 'VITE_SPAWN_REJECTED', type === 'exit' ? 7 : null));
    assert.equal(f.seen.launches.length, 0); assert.equal(f.seen.browserCloses, 0);
    if (type === 'event') assert.deepEqual(f.child.kills, ['SIGTERM']);
  } finally { f.dispose(); }
});

test('C1 Playwright import failure blocks before port probing server startup or browser launch', async () => {
  const f = fixture({ importer: async () => { throw new Error(rawFailure); } });
  try {
    await assert.rejects(prepareC1Runtime(f.options), error => safeFailure(error,
      'C1_BROWSER_DEPENDENCIES_UNAVAILABLE', 'RUNTIME_DEPENDENCIES', 'PLAYWRIGHT_IMPORT_REJECTED'));
    assert.equal(f.seen.spawned.length, 0); assert.equal(f.seen.requests.length, 0);
  } finally { f.dispose(); }
});

test('C1 Chromium launch rejection stops only its own verified Vite and redacts the browser error', async () => {
  const f = fixture({ launch: async () => { throw new Error(rawFailure); } });
  try {
    await assert.rejects(prepareC1Runtime(f.options), error => safeFailure(error,
      'C1_CHROMIUM_LAUNCH_FAILED', 'CHROMIUM_LAUNCH', 'CHROMIUM_LAUNCH_REJECTED'));
    assert.deepEqual(f.child.kills, ['SIGTERM']); assert.equal(f.seen.launches.length, 1);
  } finally { f.dispose(); }
});

test('C1 process exiting during Chromium launch cannot return a ready runtime', async () => {
  const f = fixture({ launch: async (options, browser, child) => { child.exitCode = 9; child.emit('exit', 9); return browser; } });
  try {
    await assert.rejects(prepareC1Runtime(f.options), error => safeFailure(error, 'C1_VITE_EXITED', 'VITE_READY', 'VITE_EXITED', 9));
    assert.equal(f.seen.browserCloses, 1); assert.equal(f.child.kills.length, 0);
  } finally { f.dispose(); }
});

test('C1 public TEST-only configuration rejects production and administrative keys before runtime work', async () => {
  const f = fixture();
  try {
    await assert.rejects(prepareC1Runtime({ ...f.options, config: { ...config, origin: 'https://forbidden.invalid' } }), /C1_TEST_TARGET_REQUIRED/);
    await assert.rejects(prepareC1Runtime({ ...f.options, config: { ...config, key: 'sb_secret_FAKE' } }), /C1_PUBLIC_TEST_KEY_REQUIRED/);
    assert.equal(f.seen.stages.length, 0); assert.equal(f.seen.spawned.length, 0); assert.equal(f.seen.requests.length, 0);
  } finally { f.dispose(); }
});

for (const exitCode of [-1073741515, 3221225781]) test(`C1 Windows process status ${exitCode} preserves a sanitized failure with normalized exit code`, async () => {
  const f = fixture({ spawn: child => {
    queueMicrotask(() => { child.exitCode = exitCode; child.emit('exit', exitCode); }); return child;
  } });
  try {
    await assert.rejects(prepareC1Runtime(f.options), error => safeFailure(error, 'C1_VITE_EXITED', 'VITE_READY', 'VITE_EXITED'));
    assert.equal(f.seen.launches.length, 0);
  } finally { f.dispose(); }
});
