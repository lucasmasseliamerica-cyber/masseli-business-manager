import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const boundary = readFileSync(new URL('../src/AppErrorBoundary.jsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('application root is protected by a React error boundary', () => {
  assert.match(main, /<AppErrorBoundary>[\s\S]*<App \/>[\s\S]*<\/AppErrorBoundary>/);
  assert.match(boundary, /static getDerivedStateFromError\(\)/);
  assert.match(boundary, /componentDidCatch\(\)/);
  assert.match(boundary, /generation: current\.generation \+ 1/);
  assert.match(boundary, /window\.location\.reload\(\)/);
});

test('fallback is accessible and supports English and Portuguese recovery', () => {
  assert.match(boundary, /role="alert" aria-live="assertive"/);
  assert.match(boundary, /ref=\{this\.headingRef\} tabIndex="-1"/);
  assert.match(boundary, /NEXALVO needs to recover/);
  assert.match(boundary, /O NEXALVO precisa se recuperar/);
  assert.match(boundary, /Nenhuma operação será repetida automaticamente/);
});

test('client error signal contains correlation metadata without error or session content', () => {
  assert.match(main, /const uninstallClientErrorSignals = installClientErrorSignals\(\)/);
  assert.match(main, /import\.meta\.hot\.dispose\(uninstallClientErrorSignals\)/);
  assert.match(boundary, /"nexalvo:client-error"/);
  assert.match(boundary, /incidentId: newIncidentId\(\)/);
  assert.match(boundary, /occurredAt: new Date\(\)\.toISOString\(\)/);
  assert.match(boundary, /CLIENT_ERROR_SOURCES\.has\(source\)/);
  assert.doesNotMatch(boundary, /error\.(?:message|stack)|reason\.(?:message|stack)|localStorage\.setItem|fetch\(/);
});

test('global error listeners can be removed and do not retry business operations', () => {
  assert.match(boundary, /addEventListener\("error", onError\)/);
  assert.match(boundary, /addEventListener\("unhandledrejection", onUnhandledRejection\)/);
  assert.match(boundary, /removeEventListener\("error", onError\)/);
  assert.match(boundary, /removeEventListener\("unhandledrejection", onUnhandledRejection\)/);
  assert.doesNotMatch(boundary, /supabase|rpc|retryRequest|setInterval/);
});
