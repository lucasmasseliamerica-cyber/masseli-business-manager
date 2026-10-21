import { createHash } from 'node:crypto';

export const PHOTO_HOST = 'msinksoilkluooxenecy.supabase.co';
export const PHOTO_BUCKET = 'nexalvo-product-images';
export const PHOTO_FIXTURE = 'ZZ_QA_PHOTO_CATALOG_20261009_AUTO';
export const PHOTO_ACTORS = Object.freeze({
  A: { business: 'd627563b-2ce4-491d-8cf6-141ef28d0f63', owner: 'f37e9907-47c4-48bf-94b7-9a6fa5de1f88' },
  B: { business: '3849b750-20f7-4929-8699-737a4e1983c8', owner: '88eddcda-d8b5-4474-b5d7-19860dd97fba' },
});
export class PhotoSignal extends Error {
  constructor(code, status = 'BLOCKED') { super(code); this.code = code; this.status = status; }
}
export function ensure(condition, code, status) { if (!condition) throw new PhotoSignal(code, status); }
export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function validatePhotoConfiguration(env) {
  ensure(env.QA_PHOTO_JOURNEY_AUTHORIZED === 'TEST_ONLY_EXPLICIT', 'PHOTO_AUTHORIZATION_REQUIRED');
  ensure(env.QA_PHOTO_EXCLUSIVE_WINDOW === 'TEST_ONLY_EXCLUSIVE_WINDOW', 'EXCLUSIVE_FIXTURE_WINDOW_REQUIRED');
  const names = ['QA_SUPABASE_URL', 'QA_SUPABASE_ANON_KEY', 'QA_TWO_TENANT_A_EMAIL', 'QA_TWO_TENANT_A_PASSWORD', 'QA_TWO_TENANT_B_EMAIL', 'QA_TWO_TENANT_B_PASSWORD'];
  ensure(names.every(name => typeof env[name] === 'string' && env[name].length > 0), 'SECURE_QA_CREDENTIALS_REQUIRED');
  let url;
  try { url = new URL(env.QA_SUPABASE_URL); } catch { throw new PhotoSignal('PHOTO_TARGET_INVALID'); }
  ensure(url.href === `https://${PHOTO_HOST}/`, 'PHOTO_TARGET_INVALID');
  const key = env.QA_SUPABASE_ANON_KEY;
  if (!/^sb_publishable_[a-z0-9_-]+$/i.test(key)) {
    let payload;
    try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')); } catch { /* Fail below. */ }
    ensure(payload?.role === 'anon' && payload?.ref === PHOTO_HOST.split('.')[0], 'PUBLIC_TEST_KEY_REQUIRED');
  }
  ensure(env.QA_TWO_TENANT_A_EMAIL.toLowerCase() !== env.QA_TWO_TENANT_B_EMAIL.toLowerCase(), 'INDEPENDENT_QA_USERS_REQUIRED');
  return { origin: url.origin, key };
}

export function assertDedicatedPhotoFixture(row, { recipes, history, objects }) {
  ensure(row?.name === PHOTO_FIXTURE && row.business_id === PHOTO_ACTORS.A.business && row.active === true, 'DEDICATED_FIXTURE_REQUIRED');
  ensure(/^[0-9a-f-]{36}$/i.test(row.id) && row.image_url === null, 'EMPTY_PHOTO_FIXTURE_REQUIRED');
  ensure(typeof row.category === 'string' && row.category.trim().length > 0, 'FIXTURE_CATEGORY_REQUIRED');
  ensure(Array.isArray(recipes) && recipes.length === 0, 'FIXTURE_HAS_RECIPE');
  ensure(Array.isArray(history) && history.length === 0, 'FIXTURE_HAS_SALES_HISTORY');
  ensure(Array.isArray(objects) && objects.length === 0, 'FIXTURE_HAS_HISTORICAL_OBJECTS');
}

export function businessProduct(row) {
  // updated_at must advance with legitimate writes; do not overwrite timestamps or audit history.
  return Object.fromEntries(Object.entries(row).filter(([key]) => !['image_url', 'updated_at'].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
}
export function assertProductRestorable(baseline, current) {
  ensure(fingerprint(businessProduct(baseline)) === fingerprint(businessProduct(current)), 'FIXTURE_CHANGED_BY_OTHER_WRITER');
}

export function assertOwnedPhotoPath(path, snapshot) {
  const prefix = `${snapshot.product.business_id}/${snapshot.product.id}/`;
  ensure(typeof path === 'string' && path.startsWith(prefix), 'PHOTO_PATH_OUTSIDE_FIXTURE');
  const name = path.slice(prefix.length);
  ensure(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp)$/i.test(name), 'INVALID_PHOTO_OBJECT_PATH');
  return path;
}

export function validatePhotoProductWrite(args, snapshot) {
  const row = snapshot.product;
  ensure(args.p_business_id === row.business_id && args.p_product_id === row.id && args.p_operation === 'upsert', 'PRODUCT_WRITE_OUTSIDE_SCOPE');
  ensure(args.p_name === row.name && (args.p_sku || null) === (row.sku || null)
    && args.p_category === row.category && Number(args.p_price) === Number(row.price)
    && args.p_active === row.active && (args.p_description || null) === (row.description || null)
    && Array.isArray(args.p_recipe) && args.p_recipe.length === 0, 'NON_PHOTO_PRODUCT_CHANGE_FORBIDDEN');
  ensure(args.p_image_url === null || snapshot.ownedPaths.some(path => args.p_image_url === `storage://${PHOTO_BUCKET}/${path}`), 'UNOWNED_PHOTO_REFERENCE');
}

export function restorePhotoPayload(row) {
  return { p_business_id: row.business_id, p_product_id: row.id, p_operation: 'upsert',
    p_name: row.name, p_sku: row.sku || null, p_category: row.category, p_price: row.price,
    p_active: row.active, p_description: row.description || null, p_image_url: null, p_recipe: [] };
}

export function assertPositivePhotoReconciliation(snapshot, current, observedObjectHash) {
  assertProductRestorable(snapshot.product, current);
  ensure(snapshot.unresolvedWrite && snapshot.pending, 'NO_UNSETTLED_WRITE_TO_RECONCILE');
  const pending = snapshot.pending;
  if (pending.kind === 'upload') {
    assertOwnedPhotoPath(pending.path, snapshot);
    ensure(snapshot.ownedPaths.includes(pending.path) && typeof pending.bodyHash === 'string'
      && pending.bodyHash === observedObjectHash, 'UPLOAD_COMMIT_NOT_POSITIVELY_OBSERVED');
  } else if (pending.kind === 'product') {
    const owned = [null, ...snapshot.ownedPaths.map(path => `storage://${PHOTO_BUCKET}/${path}`)];
    ensure(owned.includes(pending.expectedImage), 'RECOVERY_EXPECTATION_OUTSIDE_SCOPE');
    ensure(current.image_url === pending.expectedImage && current.updated_at !== pending.previousUpdatedAt,
      'PRODUCT_COMMIT_NOT_POSITIVELY_OBSERVED');
  } else throw new PhotoSignal('UNRECOGNIZED_PENDING_WRITE');
}

export function safePhotoReport(report) {
  // Public evidence is counts/status/hashes only. Private snapshot is a separate protected file.
  const text = JSON.stringify(report);
  ensure(!/Bearer\s|eyJ[A-Za-z0-9_-]{16,}\.|[?&]token=|signedURL|signedUrl|@|storage:\/\//i.test(text), 'EVIDENCE_CONTAINS_SENSITIVE_DATA');
  return JSON.parse(text);
}
