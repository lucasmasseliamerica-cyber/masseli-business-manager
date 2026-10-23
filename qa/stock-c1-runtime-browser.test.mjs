import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareC1Runtime, probeC1LocalPort } from './stock-c1-browser-runtime.mjs';

// Real local Vite + real Chromium, no login, QA session, stock operation or checkpoint.
// Every non-loopback browser request is aborted before it can reach a backend.
test('C1 readonly runtime launches the same validated Chromium and renders the local React sign-in page without TEST connectivity', { timeout: 60000 }, async () => {
  const stages = [], remote = [];
  const runtime = await prepareC1Runtime({ env: process.env,
    config: { origin: 'https://msinksoilkluooxenecy.supabase.co', key: 'sb_publishable_SYNTHETIC_LOCAL_BROWSER' },
    onStage: stage => stages.push(stage) });
  try {
    const context = await runtime.browser.newContext({ serviceWorkers: 'block' });
    await context.addInitScript(() => localStorage.setItem('nexalvo.ui.language.v1', 'en'));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://127.0.0.1:4189' && ['GET', 'HEAD'].includes(route.request().method())) return route.continue();
      const event = { aborted: false }; remote.push(event); await route.abort(); event.aborted = true;
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4189', { waitUntil: 'domcontentloaded' });
    await page.locator('input[name=email]').waitFor({ state: 'visible', timeout: 20000 });
    assert.equal(await page.locator('input[type=password]').count(), 1);
    assert.ok(await page.getByText('NEXALVO', { exact: false }).count() > 0);
    assert.deepEqual(stages, ['RUNTIME_DEPENDENCIES', 'LOCAL_PORT', 'VITE_START', 'VITE_READY', 'CHROMIUM_LAUNCH']);
    assert.deepEqual(runtime.proof, { local_server_verified: true, browser_launched: true, port: 4189, readonly_runtime_only: true });
    assert.ok(remote.every(event => event.aborted));
    await context.close();
  } finally { await runtime.close(); }
  // A successful local smoke must not leave its server occupying the execution port.
  await probeC1LocalPort();
});
