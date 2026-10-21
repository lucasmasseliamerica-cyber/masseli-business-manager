import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  PHOTO_HOST, PHOTO_BUCKET, PHOTO_FIXTURE, PHOTO_ACTORS, validatePhotoConfiguration,
  assertDedicatedPhotoFixture, assertProductRestorable, assertOwnedPhotoPath,
  validatePhotoProductWrite, restorePhotoPayload, safePhotoReport, assertPositivePhotoReconciliation,
} from './photo-journey-core.mjs';
import { photoJourney } from './photo-journey.TEST.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const path = `${PHOTO_ACTORS.A.business}/${id}/22222222-2222-4222-8222-222222222222.png`;
const row = { id, business_id: PHOTO_ACTORS.A.business, name: PHOTO_FIXTURE, active: true,
  image_url: null, category: 'QA', sku: null, price: 1, description: null, updated_at: 'before' };
const snapshot = { product: row, ownedPaths: [path] };
const configuration = { QA_PHOTO_JOURNEY_AUTHORIZED: 'TEST_ONLY_EXPLICIT',
  QA_PHOTO_EXCLUSIVE_WINDOW: 'TEST_ONLY_EXCLUSIVE_WINDOW', QA_SUPABASE_URL: `https://${PHOTO_HOST}`,
  QA_SUPABASE_ANON_KEY: 'sb_publishable_SIMULATED', QA_TWO_TENANT_A_EMAIL: 'a@example.invalid',
  QA_TWO_TENANT_A_PASSWORD: 'SIMULATED_A', QA_TWO_TENANT_B_EMAIL: 'b@example.invalid', QA_TWO_TENANT_B_PASSWORD: 'SIMULATED_B' };

test('A-Jornada refuses missing authorization, exclusivity, private credentials, wrong targets and same actor', () => {
  assert.equal(validatePhotoConfiguration(configuration).origin, `https://${PHOTO_HOST}`);
  for (const change of [{ QA_PHOTO_JOURNEY_AUTHORIZED: '' }, { QA_PHOTO_EXCLUSIVE_WINDOW: '' },
    { QA_TWO_TENANT_B_PASSWORD: '' }, { QA_SUPABASE_URL: 'https://another.invalid' },
    { QA_SUPABASE_URL: `https://${PHOTO_HOST}/?unsafe=true` }, { QA_SUPABASE_ANON_KEY: 'not-public' },
    { QA_TWO_TENANT_B_EMAIL: configuration.QA_TWO_TENANT_A_EMAIL }]) assert.throws(() => validatePhotoConfiguration({ ...configuration, ...change }));
  const privileged = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ role: 'service_role', ref: PHOTO_HOST.split('.')[0] })).toString('base64url'), 'SIMULATED'].join('.');
  assert.throws(() => validatePhotoConfiguration({ ...configuration, QA_SUPABASE_ANON_KEY: privileged }), /PUBLIC_TEST_KEY_REQUIRED/);
});

test('real runner without secure configuration returns BLOCKED without login, writes, or real fixtures', async () => {
  const report = await photoJourney({});
  assert.equal(report.status, 'BLOCKED'); assert.equal(report.code, 'PHOTO_AUTHORIZATION_REQUIRED');
  assert.equal(report.storage.uploads_forwarded, 0); assert.equal(report.restored, false);
  assert.ok(Object.values(report.checks).every(status => status === 'BLOCKED'));
});

test('a familiar QA name alone is insufficient: invalid state, old image, sales, recipe, historic objects and wrong tenant all block', () => {
  const clean = { recipes: [], history: [], objects: [] };
  for (const active of [true, false]) {
    const fixture = { ...row, active };
    for (const change of [{ image_url: '' }, { image_url: 'https://example.invalid/historical.png' },
      { active: null }, { active: undefined }, { active: 'false' }, { active: 0 },
      { business_id: PHOTO_ACTORS.B.business }, { name: 'COMMERCIAL' }, { category: null }]) {
      assert.throws(() => assertDedicatedPhotoFixture({ ...fixture, ...change }, clean));
    }
    for (const key of ['recipes', 'history', 'objects']) assert.throws(() => assertDedicatedPhotoFixture(fixture, { ...clean, [key]: [{}] }));
  }
});

test('inactive dedicated fixture is accepted without changing its original state or safety inputs', () => {
  for (const active of [true, false]) {
    const fixture = Object.freeze({ ...row, active });
    const safety = Object.freeze({ recipes: Object.freeze([]), history: Object.freeze([]), objects: Object.freeze([]) });
    const before = JSON.stringify({ fixture, safety });
    assert.doesNotThrow(() => assertDedicatedPhotoFixture(fixture, safety));
    assert.equal(JSON.stringify({ fixture, safety }), before);
  }
});

test('inactive photo upload, replacement, removal and compensation preserve status, price, SKU, recipe and historical metadata', () => {
  const fixture = Object.freeze({ ...row, active: false, sku: 'QA-INACTIVE-PHOTO', price: 12.34,
    created_at: 'original-created-at', notes: 'original-notes' });
  const secondPath = path.replace('22222222-2222-4222-8222-222222222222.png', '33333333-3333-4333-8333-333333333333.webp');
  const snap = { product: fixture, ownedPaths: [path, secondPath] };
  const before = JSON.stringify(snap);
  const restore = restorePhotoPayload(fixture);
  for (const image of [null, `storage://${PHOTO_BUCKET}/${path}`, `storage://${PHOTO_BUCKET}/${secondPath}`, null]) {
    const payload = { ...restore, p_image_url: image };
    assert.equal(payload.p_active, false);
    assert.equal(payload.p_price, fixture.price); assert.equal(payload.p_sku, fixture.sku);
    assert.deepEqual(payload.p_recipe, []);
    assert.doesNotThrow(() => validatePhotoProductWrite(payload, snap));
    assert.doesNotThrow(() => assertProductRestorable(fixture, { ...fixture, image_url: image, updated_at: 'after' }));
    for (const patch of [{ p_active: true }, { p_active: null }, { p_active: undefined },
      { p_price: 99 }, { p_sku: 'changed' }, { p_recipe: [{}] }, { p_operation: 'deactivate' }]) {
      assert.throws(() => validatePhotoProductWrite({ ...payload, ...patch }, snap));
    }
  }
  for (const patch of [{ active: true }, { price: 99 }, { sku: 'changed' }, { notes: 'changed' }, { created_at: 'changed' }]) {
    assert.throws(() => assertProductRestorable(fixture, { ...fixture, ...patch }), /FIXTURE_CHANGED_BY_OTHER_WRITER/);
  }
  const pending = { ...snap, unresolvedWrite: true, pending: { kind: 'product', expectedImage: `storage://${PHOTO_BUCKET}/${path}`, previousUpdatedAt: fixture.updated_at } };
  assert.doesNotThrow(() => assertPositivePhotoReconciliation(pending, { ...fixture, image_url: pending.pending.expectedImage, updated_at: 'after' }));
  assert.throws(() => assertPositivePhotoReconciliation(pending, { ...fixture, active: true, image_url: pending.pending.expectedImage, updated_at: 'after' }));
  assert.equal(JSON.stringify(snap), before, 'neither the snapshot nor its historical metadata may be rewritten');
});

test('snapshot preserves business values and history while allowing timestamp/audit progression', () => {
  assert.doesNotThrow(() => assertProductRestorable(row, { ...row, updated_at: 'after', image_url: `storage://${PHOTO_BUCKET}/${path}` }));
  for (const change of [{ price: 2 }, { name: 'changed' }, { active: false }, { sku: 'changed' }, { description: 'changed' }]) assert.throws(() => assertProductRestorable(row, { ...row, ...change }), /FIXTURE_CHANGED_BY_OTHER_WRITER/);
});

test('cleanup and product save cannot target historical/other-tenant objects or change price, recipe, status or identity', () => {
  assert.equal(assertOwnedPhotoPath(path, snapshot), path);
  for (const unsafe of [path.replace(PHOTO_ACTORS.A.business, PHOTO_ACTORS.B.business), path + '/../old.png', path.replace(id, '33333333-3333-4333-8333-333333333333'), path.replace(/[^/]+$/, 'historic.png')]) assert.throws(() => assertOwnedPhotoPath(unsafe, snapshot));
  const payload = restorePhotoPayload(row);
  assert.doesNotThrow(() => validatePhotoProductWrite(payload, snapshot));
  assert.doesNotThrow(() => validatePhotoProductWrite({ ...payload, p_image_url: `storage://${PHOTO_BUCKET}/${path}` }, snapshot));
  for (const change of [{ p_price: 2 }, { p_recipe: [{}] }, { p_product_id: 'another' }, { p_business_id: PHOTO_ACTORS.B.business },
    { p_operation: 'deactivate' }, { p_active: false }, { p_image_url: `storage://${PHOTO_BUCKET}/${path.replace('.png', '.webp')}` }]) assert.throws(() => validatePhotoProductWrite({ ...payload, ...change }, snapshot));
});

test('public report rejects tokens, e-mails and private references rather than logging or masking a successful leak', () => {
  assert.deepEqual(safePhotoReport({ status: 'BLOCKED', storage: { before: 0, after: 0 } }), { status: 'BLOCKED', storage: { before: 0, after: 0 } });
  for (const value of ['Bearer SIMULATED', 'https://example.invalid/?token=SIMULATED', 'a@example.invalid', `storage://${PHOTO_BUCKET}/${path}`]) assert.throws(() => safePhotoReport({ detail: value }), /SENSITIVE_DATA/);
});

test('read-only recovery requires positive commit evidence; stable absence never releases an unknown upload', () => {
  const pending = { ...snapshot, unresolvedWrite: true, pending: { kind: 'upload', path, bodyHash: 'expected-hash' } };
  assert.doesNotThrow(() => assertPositivePhotoReconciliation(pending, row, 'expected-hash'));
  for (const hash of [undefined, null, '', 'different-hash']) assert.throws(() => assertPositivePhotoReconciliation(pending, row, hash));
});

test('read-only recovery of a saved product requires a new version with exactly the intended reference', () => {
  const ref = `storage://${PHOTO_BUCKET}/${path}`;
  const pending = { ...snapshot, unresolvedWrite: true, pending: { kind: 'product', expectedImage: ref, previousUpdatedAt: row.updated_at } };
  assert.doesNotThrow(() => assertPositivePhotoReconciliation(pending, { ...row, image_url: ref, updated_at: 'after' }));
  for (const change of [{}, { image_url: ref }, { updated_at: 'after' }, { image_url: ref, updated_at: 'after', price: 2 }]) assert.throws(() => assertPositivePhotoReconciliation(pending, { ...row, ...change }));
});

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
function section(start, end) { const a = source.indexOf(start), b = source.indexOf(end, a + start.length); assert.ok(a >= 0 && b > a); return source.slice(a, b); }
function storage(fetch) {
  const ctx = vm.createContext({ URL, Map, RegExp, String, Number, Error, JSON, encodeURIComponent,
    SUPABASE_URL: `https://${PHOTO_HOST}`, newDbId: () => '22222222-2222-4222-8222-222222222222', supabaseFetch: fetch });
  vm.runInContext(section('function normalizeProductImageUrl', 'function normalizeCatalogSearch')
    + section('function encodeStorageObjectPath', 'function sanitizeRecoveryCode') + ';globalThis.storage=supabaseProductImages;', ctx);
  return ctx.storage;
}
for (const status of [408, 500, 502, 504]) {
  test(`Storage upload ${status} preserves the uncertain path and freezes cleanup/retry`, async () => {
    let requests = 0;
    const api = storage(async () => { requests++; return { ok: false, status }; });
    await assert.rejects(api.upload({ size: 100, type: 'image/png' }, PHOTO_ACTORS.A.business, id), error => error.commitUncertain === true && error.uploadUncertain === true && error.objectReference.endsWith('.png'));
    assert.equal(requests, 1);
  });
}
test('lost upload response is uncertain; a definitive RLS rejection is not', async () => {
  const args = [{ size: 100, type: 'image/png' }, PHOTO_ACTORS.A.business, id];
  await assert.rejects(storage(async () => { throw new TypeError('lost'); }).upload(...args), e => e.commitUncertain && e.uploadUncertain);
  await assert.rejects(storage(async () => ({ ok: false, status: 403 })).upload(...args), e => e.commitUncertain === false && e.uploadUncertain === false);
});

test('product modal freezes file selection, mutation and deactivation after unknown outcomes', () => {
  const modal = section('function ProductModal', '/* ============================== EXPENSES');
  assert.match(modal, /if \(e\?\.commitUncertain\) setImageOutcomeUnknown\(true\)/);
  assert.equal((modal.match(/if \(submitting \|\| imageOutcomeUnknown\) return/g) || []).length, 4);
  assert.match(modal, /if \(uncommittedImage && !e\?\.commitUncertain\)/);
  assert.match(modal, /disabled=\{submitting \|\| imageOutcomeUnknown\}/);
});

test('executor uses hidden process-only credentials, private checkpoint ACL, exact source and scoped recovery', () => {
  const ps = readFileSync(new URL('./Invoke-QaPhotoJourney.ps1', import.meta.url), 'utf8');
  const runner = readFileSync(new URL('./photo-journey.TEST.mjs', import.meta.url), 'utf8');
  assert.match(ps, /Read-Host[^\n]+-AsSecureString/); assert.match(ps, /ZeroFreeBSTR/);
  assert.match(ps, /SetAccessRuleProtection\(\$true, \$false\)/);
  assert.match(ps, /finally[\s\S]*SetEnvironmentVariable\(\$name, \$previous\[\$name\], 'Process'\)/);
  assert.match(ps, /merge-base --is-ancestor 9b381e8 HEAD/);
  assert.match(runner, /snapshot\.unresolvedWrite = true; save\('UPLOADING'\)/);
  assert.match(runner, /TWO_UPLOAD_LIMIT_REACHED/); assert.match(runner, /FOREIGN_OBJECT_IN_FIXTURE_FOLDER/);
  assert.match(runner, /UNSETTLED_WRITE_COMPENSATION_BLOCKED/);
  assert.match(runner, /scope=local/); assert.doesNotMatch(runner, /scope=global|storageState\(|tracing\.start\(|screenshot\(/);
  const workflow = readFileSync(new URL('../.github/workflows/nexalvo-test.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /(?<!--check )node qa\/photo-journey\.TEST\.mjs/);
});
