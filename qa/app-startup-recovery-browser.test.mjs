import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('a failed App module load shows recovery and waits for a manual reload', { timeout: 45000 }, async () => {
  const vite = await createServer({ envFile: false, server: { host: '127.0.0.1', port: 0, hmr: false }, logLevel: 'silent' });
  let browser;
  try {
    await vite.listen();
    const origin = new URL(vite.resolvedUrls.local[0]).origin;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ serviceWorkers: 'block' });
    let outage = true;
    let moduleRequests = 0;
    let externalRequests = 0;
    await page.addInitScript(() => {
      window.qaClientErrors = [];
      window.addEventListener('nexalvo:client-error', (event) => window.qaClientErrors.push(event.detail));
    });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        externalRequests++;
        return route.abort();
      }
      if (url.pathname === '/src/App.jsx') {
        moduleRequests++;
        if (outage) return route.fulfill({ status: 503, body: 'synthetic-module-unavailable' });
      }
      return route.continue();
    });
    await page.goto(origin);
    const alert = page.getByRole('alert').filter({ hasText: 'NEXALVO needs to recover' });
    await alert.waitFor({ timeout: 7000 });
    assert.equal(await alert.getByRole('button').count(), 1);
    const reload = alert.getByRole('button', { name: 'Reload page' });
    await reload.waitFor();
    await page.waitForFunction(() => window.qaClientErrors.some(({ source }) => source === 'react-boundary'));
    const signals = await page.evaluate(() => window.qaClientErrors);
    assert.equal(signals.filter(({ source }) => source === 'react-boundary').length, 1);
    for (const signal of signals) assert.deepEqual(Object.keys(signal).sort(), ['incidentId', 'occurredAt', 'source']);
    assert.match(await alert.getByRole('code').textContent(), /^[\w-]+$/);
    assert.equal(moduleRequests, 1);
    assert.equal(externalRequests, 0);

    outage = false;
    await reload.click();
    await page.locator('input[name=email]').waitFor({ timeout: 15000 });
    assert.equal(await alert.count(), 0);
    assert.equal(moduleRequests, 2);
    assert.equal(externalRequests, 0);
  } finally {
    try { await browser?.close(); } finally { await vite.close(); }
  }
});
