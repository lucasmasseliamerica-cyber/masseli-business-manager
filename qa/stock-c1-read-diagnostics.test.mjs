import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openC1Client } from './stock-c1-client.mjs';
import { sanitizeC1Diagnostic } from './stock-c1-diagnostics.mjs';
import { STOCK_ACTORS, STOCK_HOST, STOCK_FINGERPRINTS, STOCK_PRECISION_TARGET_FINGERPRINT, STOCK_TABLES,
  validateStockFixture } from './stock-journey-core.mjs';
import { C1_FIXTURE } from './stock-c1-protocol.mjs';
import { C1_AUDIT_CONTRACT } from './stock-c1-audit-contract.mjs';
import { STOCK_WASTE_READER_CONTRACT } from './stock-waste-reader-contract.mjs';
import { stockJourney } from './stock-journey.TEST.mjs';

// Every request is intercepted in memory. No network, real session, checkpoint or TEST write.
const config = { origin: 'https://msinksoilkluooxenecy.supabase.co', key: 'sb_publishable_SYNTHETIC' };
const credentials = {
  QA_TWO_TENANT_A_EMAIL: 'a@example.invalid', QA_TWO_TENANT_A_PASSWORD: 'SYNTHETIC_A',
  QA_TWO_TENANT_B_EMAIL: 'b@example.invalid', QA_TWO_TENANT_B_PASSWORD: 'SYNTHETIC_B',
};
const privateMarker = 'SYNTHETIC_PRIVATE_UPSTREAM_VALUE';
const untrustedMessage = `Bearer ${privateMarker} person@example.invalid https://private.invalid/?token=${privateMarker}`;
const resources = [
  ['/rest/v1/inventory_items', 'INVENTORY_ITEM'],
  ['/rest/v1/locations', 'LOCATIONS'],
  ['/rest/v1/rpc/fn_read_inventory_stock_secure', 'INVENTORY_STOCK'],
  ['/rest/v1/rpc/fn_read_inventory_transactions_secure', 'INVENTORY_HISTORY'],
  ['/rest/v1/product_recipes', 'PRODUCT_RECIPES'],
  ['/rest/v1/rpc/fn_read_purchase_order_items_secure', 'PURCHASE_LINES'],
  ['/rest/v1/rpc/fn_read_waste_transactions_secure', 'WASTE_SECURE'],
  ['/rest/v1/audit_logs', 'AUDIT_HISTORY'],
];
const wastePath = '/rest/v1/rpc/fn_read_waste_transactions_secure';
const directWastePath = '/rest/v1/waste_transactions';
function reply(data, status = 200, count = Array.isArray(data) ? data.length : 0) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-range': `*/${count}` } });
}
function syntheticFixture() {
  return {
    item: { id: C1_FIXTURE.item, business_id: STOCK_ACTORS.A.business, name: C1_FIXTURE.name,
      unit: 'unit', active: true, supplier_id: null },
    locations: [[C1_FIXTURE.source, C1_FIXTURE.sourceName], [C1_FIXTURE.target, C1_FIXTURE.targetName]]
      .map(([id, name]) => ({ id, name, active: true, business_id: STOCK_ACTORS.A.business })),
    stocks: [C1_FIXTURE.source, C1_FIXTURE.target].map((location_id, index) => ({
      id: `${index ? '22222222' : '11111111'}-1111-4111-8111-111111111111`, location_id,
      inventory_item_id: C1_FIXTURE.item, qty: 2, avg_cost_per_unit: 0.1,
    })),
    transactions: [], recipes: [], purchaseLines: [], waste: [], audit: [],
  };
}
function transport({ failurePath, failure, denyIsolation = false, logoutFailure = false, wasteRows = [] } = {}) {
  const requests = [], fixture = syntheticFixture();
  const fetcher = async (url, options) => {
    const actor = options.headers.Authorization?.endsWith('_B') ? 'B'
      : options.headers.Authorization?.endsWith('_A') ? 'A' : 'ANON';
    requests.push({ path: url.pathname, actor, method: options.method });
    assert.equal(options.redirect, 'error');
    if (url.pathname === '/auth/v1/token') return reply({ access_token: 'SYNTHETIC_' + (JSON.parse(options.body).email.startsWith('a') ? 'A' : 'B') });
    if (url.pathname === '/auth/v1/logout') {
      if (logoutFailure) throw new Error(untrustedMessage);
      return reply({});
    }
    if (url.pathname === '/auth/v1/user') return reply({ id: STOCK_ACTORS[actor].owner });
    if (url.pathname === '/rest/v1/users') return reply([{ id: STOCK_ACTORS[actor].owner,
      business_id: STOCK_ACTORS[actor].business, active: true, role: 'OWNER' }]);
    if (url.pathname.endsWith('/current_business_id')) return reply(STOCK_ACTORS[actor].business);
    if (url.pathname.endsWith('/user_can')) return reply(true);
    if (url.pathname === directWastePath) return reply({ code: '42501', message: untrustedMessage }, 403);
    if (actor !== 'A') return denyIsolation ? reply({ code: '42501', message: untrustedMessage }, 403) : reply([]);
    if (url.pathname === failurePath) return failure ? failure() : reply({ code: '42501', message: untrustedMessage, details: untrustedMessage }, 403);
    if (url.pathname === '/rest/v1/inventory_items') return reply([fixture.item]);
    if (url.pathname === '/rest/v1/locations') return reply(fixture.locations);
    if (url.pathname === '/rest/v1/rpc/fn_read_inventory_stock_secure') return reply(fixture.stocks);
    if (url.pathname === wastePath) return reply(wasteRows);
    return reply([]);
  };
  return { fetcher, requests };
}
function assertNoBusinessWrites(requests) {
  assert.ok(requests.every(row => row.method === 'GET' || ['/auth/v1/token', '/auth/v1/logout'].includes(row.path)));
  assert.equal(requests.filter(row => row.path === directWastePath).length, 0);
}
function assertPrivateDiagnostic(error, expected) {
  assert.deepEqual(error.diagnostic, expected);
  assert.deepEqual(sanitizeC1Diagnostic(error.diagnostic), expected);
  assert.ok(Object.isFrozen(error.diagnostic));
  const encoded = JSON.stringify({ code: error.code, diagnostic: error.diagnostic });
  assert.doesNotMatch(encoded, /SYNTHETIC_PRIVATE|Bearer|example\.invalid|https?:|inventory_item_id|business_id|access_token/);
  assert.ok(!encoded.includes(C1_FIXTURE.item));
  assert.ok(!encoded.includes(STOCK_ACTORS.A.owner));
}
function expectedDiagnostic(resource, http_status, reason, upstream_code = null) {
  return { stage: 'FIXTURE_READ', resource, actor: 'A', method: 'GET', http_status, reason, upstream_code };
}

test('C1 uses secure waste RPC when direct table SELECT is denied, preserving all fixture checks', async () => {
  const { fetcher, requests } = transport();
  const client = await openC1Client(config, credentials, fetcher);
  try {
    await client.isolation();
    const { audit, ...fixture } = await client.view();
    assert.doesNotThrow(() => validateStockFixture(fixture));
    assert.deepEqual(audit, []); assert.deepEqual(fixture.waste, []);
    assert.equal(requests.filter(row => row.path === wastePath && row.actor === 'A').length, 1);
    assert.ok(requests.some(row => row.path === wastePath && row.actor === 'B'));
    assert.ok(requests.some(row => row.path === wastePath && row.actor === 'ANON'));
  } finally { await client.close(); }
  assertNoBusinessWrites(requests);
});

for (const [path, resource] of resources) test(`C1 rejected ${resource} read identifies only fixed stage resource actor and status`, async () => {
  const { fetcher, requests } = transport({ failurePath: path });
  const client = await openC1Client(config, credentials, fetcher);
  try {
    await assert.rejects(client.view(), error => {
      assert.equal(error.code, 'C1_AUTH_OR_READ_REJECTED');
      assertPrivateDiagnostic(error, expectedDiagnostic(resource, 403, 'HTTP_REJECTED', '42501'));
      return true;
    });
    assert.equal(requests.filter(row => row.path === path && row.actor === 'A').length, 1, 'a denied read must not retry');
  } finally { await client.close(); }
  assertNoBusinessWrites(requests);
});

test('C1 expected B and anonymous denial cannot hide an OWNER A secure waste rejection', async () => {
  const { fetcher, requests } = transport({ denyIsolation: true, failurePath: wastePath });
  const client = await openC1Client(config, credentials, fetcher);
  try {
    await assert.doesNotReject(client.isolation());
    await assert.rejects(client.view(), error => {
      assertPrivateDiagnostic(error, expectedDiagnostic('WASTE_SECURE', 403, 'HTTP_REJECTED', '42501')); return true;
    });
  } finally { await client.close(); }
  assertNoBusinessWrites(requests);
});

for (const [name, failure, code, status, reason, upstream] of [
  ['network error', () => { throw new Error(untrustedMessage); }, 'C1_READ_UNAVAILABLE', null, 'NETWORK_UNAVAILABLE', null],
  ['invalid JSON', () => new Response(untrustedMessage, { status: 502 }), 'C1_RESPONSE_UNCONFIRMED', 502, 'INVALID_JSON', null],
  ['truncated count', () => reply([], 200, 1), 'C1_INCOMPLETE_READ', 200, 'INCOMPLETE_READ', null],
  ['missing exact count', () => new Response('[]', { status: 200 }), 'C1_INCOMPLETE_READ', 200, 'INCOMPLETE_READ', null],
  ['unknown upstream code', () => reply({ code: untrustedMessage, message: untrustedMessage }, 403), 'C1_AUTH_OR_READ_REJECTED', 403, 'HTTP_REJECTED', null],
  ['missing secure RPC', () => reply({ code: 'PGRST202', message: untrustedMessage }, 404), 'C1_AUTH_OR_READ_REJECTED', 404, 'HTTP_REJECTED', 'PGRST202'],
]) test(`C1 ${name} stays blocked without credentials retry or direct table fallback`, async () => {
  const { fetcher, requests } = transport({ failurePath: wastePath, failure });
  const client = await openC1Client(config, credentials, fetcher);
  try {
    await assert.rejects(client.view(), error => {
      assert.equal(error.code, code);
      assertPrivateDiagnostic(error, expectedDiagnostic('WASTE_SECURE', status, reason, upstream)); return true;
    });
    assert.equal(requests.filter(row => row.path === wastePath && row.actor === 'A').length, 1);
    assert.equal(requests.filter(row => row.path === '/rest/v1/audit_logs').length, 0);
  } finally { await client.close(); }
  assertNoBusinessWrites(requests);
});

test('C1 nonempty secure waste history is preserved and still disqualifies the dedicated fixture', async () => {
  const waste = { id: '33333333-3333-4333-8333-333333333333', inventory_item_id: C1_FIXTURE.item, qty: 0.125 };
  const { fetcher, requests } = transport({ wasteRows: [waste] });
  const client = await openC1Client(config, credentials, fetcher);
  try {
    const { audit, ...fixture } = await client.view();
    assert.deepEqual(fixture.waste, [waste]); assert.deepEqual(audit, []);
    assert.throws(() => validateStockFixture(fixture), /C_EXISTING_DEPENDENCIES_OR_HISTORY/);
  } finally { await client.close(); }
  assertNoBusinessWrites(requests);
});

test('C1 logout failures cannot overwrite or disclose the original rejected-read diagnostic', async () => {
  const { fetcher, requests } = transport({ failurePath: wastePath, logoutFailure: true });
  const client = await openC1Client(config, credentials, fetcher);
  let original;
  try { await client.view(); assert.fail('read must be rejected'); } catch (error) { original = error; }
  await assert.doesNotReject(client.close());
  assert.equal(original.code, 'C1_AUTH_OR_READ_REJECTED');
  assertPrivateDiagnostic(original, expectedDiagnostic('WASTE_SECURE', 403, 'HTTP_REJECTED', '42501'));
  assert.equal(requests.filter(row => row.path === '/auth/v1/logout').length, 2);
  assertNoBusinessWrites(requests);
});

test('C1 real preflight runner reports the precise rejected resource after successful earlier gates without a checkpoint or business write', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nexalvo-c1-diagnostic-report-'));
  const repository = join(directory, 'qa-repo'), catalogFile = join(directory, 'catalog.json');
  const hooks = join(directory, 'empty-hooks');
  mkdirSync(repository); mkdirSync(hooks);
  const previous = process.cwd();
  const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const catalog = { project_ref_expected: STOCK_HOST.split('.')[0], mode: 'READ_ONLY',
    status: 'PASS_MATCHED_HISTORICAL_CONTRACTS', captured_at: new Date().toISOString(),
    functions: Object.entries(STOCK_FINGERPRINTS).map(([name, fingerprint]) => ({ name, present: true,
      fingerprint: name === 'fn_record_inventory_movement' ? STOCK_PRECISION_TARGET_FINGERPRINT : fingerprint,
      anon_execute: false, authenticated_execute: name !== 'fn_record_inventory_movement' })),
    tables: STOCK_TABLES.map(name => ({ name, present: true, rls: true, anon_select: false })),
    public_schema: { anon_create: false, authenticated_create: false },
    c1_audit_contract: { ...C1_AUDIT_CONTRACT.expected },
    waste_reader_contract: { ...STOCK_WASTE_READER_CONTRACT.expected },
  };
  writeFileSync(catalogFile, JSON.stringify(catalog));
  const { fetcher, requests } = transport({ denyIsolation: true, failurePath: wastePath });
  try {
    git('init', '-b', 'automation/nexalvo-qa-actions');
    git('-c', 'user.name=Synthetic QA', '-c', 'user.email=qa@example.invalid', '-c', 'commit.gpgsign=false',
      '-c', `core.hooksPath=${hooks}`, 'commit', '--allow-empty', '-m', 'Synthetic isolated preflight baseline');
    const sha = git('rev-parse', 'HEAD');
    process.chdir(repository);
    const report = await stockJourney({ ...credentials, QA_SUPABASE_URL: config.origin,
      QA_SUPABASE_ANON_KEY: config.key, QA_STOCK_ITEM_ID: C1_FIXTURE.item,
      QA_STOCK_SOURCE_LOCATION_ID: C1_FIXTURE.source, QA_STOCK_TARGET_LOCATION_ID: C1_FIXTURE.target,
      QA_STOCK_CATALOG_FILE: catalogFile, QA_STOCK_VALIDATED_CODE_SHA: sha }, ['--preflight'], fetcher);
    assert.equal(report.status, 'BLOCKED'); assert.equal(report.code, 'C1_AUTH_OR_READ_REJECTED');
    for (const check of ['catalog', 'owner_a_b', 'permissions', 'read_isolation']) assert.equal(report.checks[check], 'PASS');
    assert.equal(report.checks.exclusive_fixture, 'BLOCKED');
    assertPrivateDiagnostic(report, expectedDiagnostic('WASTE_SECURE', 403, 'HTTP_REJECTED', '42501'));
    assert.equal(report.stock_requests_forwarded, 0); assert.equal(report.audit_requests_forwarded, 0);
    assert.equal(report.negative_requests_forwarded, 0); assert.equal(report.fixtures_created, 0);
    assert.equal(report.history_rows_deleted, 0); assert.equal(report.full_homologation, false);
    assert.equal(report.recovery_checkpoint_retained, false);
    const encoded = JSON.stringify(report);
    assert.doesNotMatch(encoded, /SYNTHETIC_|Bearer|example\.invalid|https?:|checkpoint_sha256|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/i);
    assert.deepEqual(readdirSync(repository), ['.git']);
    assert.deepEqual(readdirSync(directory).sort(), ['catalog.json', 'empty-hooks', 'qa-repo']);
    assert.equal(git('status', '--porcelain'), '');
    assertNoBusinessWrites(requests);
  } finally {
    process.chdir(previous);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('C1 diagnostic sanitizer strips extra information and rejects untrusted enum status and resource values', () => {
  const valid = expectedDiagnostic('WASTE_SECURE', 403, 'HTTP_REJECTED', '42501');
  assert.deepEqual(sanitizeC1Diagnostic({ ...valid, url: untrustedMessage, details: untrustedMessage,
    token: privateMarker, email: 'person@example.invalid' }), valid);
  for (const change of [
    { stage: untrustedMessage }, { resource: '/rest/v1/waste_transactions' }, { actor: 'OWNER_EMAIL' },
    { method: 'DELETE' }, { http_status: 99 }, { http_status: 600 }, { http_status: '403' },
    { http_status: 403.5 }, { reason: untrustedMessage },
  ]) assert.equal(sanitizeC1Diagnostic({ ...valid, ...change }), null);
  for (const key of ['stage', 'resource', 'actor', 'method', 'http_status', 'reason']) {
    const missing = { ...valid }; delete missing[key]; assert.equal(sanitizeC1Diagnostic(missing), null);
  }
  const unknownCode = sanitizeC1Diagnostic({ ...valid, upstream_code: untrustedMessage });
  assert.ok(unknownCode && unknownCode.upstream_code == null);
  assert.equal(sanitizeC1Diagnostic(null), null); assert.equal(sanitizeC1Diagnostic(untrustedMessage), null);
});
