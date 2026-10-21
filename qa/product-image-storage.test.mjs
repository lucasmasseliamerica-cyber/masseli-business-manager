import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const files = ['src/App.jsx', 'App.jsx'];
const migration = readFileSync(new URL('../migrations/20261016_product_images_storage_TEST.sql', import.meta.url), 'utf8');
const preflight = readFileSync(new URL('./sql/product_images_storage_preflight_readonly_TEST.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../migrations/20261016_product_images_storage_rollback_TEST.sql', import.meta.url), 'utf8');

function section(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `${startToken} section was not found`);
  return source.slice(start, end);
}

for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

  test(`${file}: private image references and local files fail closed`, () => {
    const context = vm.createContext({ URL, Map, RegExp, String, Number, Error });
    vm.runInContext(section(source, 'function normalizeProductImageUrl', 'function normalizeCatalogSearch') + ';globalThis.api={parseProductImageStorageReference,normalizeProductImageReference,validateProductImageFile,buildProductImageStorageReference};', context);
    const business = '11111111-1111-4111-8111-111111111111';
    const product = '22222222-2222-4222-8222-222222222222';
    const object = '33333333-3333-4333-8333-333333333333';
    const reference = context.api.buildProductImageStorageReference(business, product, object, 'webp');
    assert.equal(reference, `storage://nexalvo-product-images/${business}/${product}/${object}.webp`);
    assert.equal(context.api.parseProductImageStorageReference(reference).businessId, business);
    assert.equal(context.api.normalizeProductImageReference('https://cdn.example.test/photo.jpg'), 'https://cdn.example.test/photo.jpg');
    assert.equal(context.api.normalizeProductImageReference(`storage://nexalvo-product-images/${business}/../../secret.png`), '');
    assert.equal(context.api.validateProductImageFile({ type: 'image/png', size: 1024 }).ok, true);
    assert.equal(context.api.validateProductImageFile({ type: 'image/svg+xml', size: 1024 }).ok, false);
    assert.equal(context.api.validateProductImageFile({ type: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }).ok, false);
  });

  test(`${file}: Storage adapter uses authenticated APIs, no overwrite and bounded signed URLs`, () => {
    const adapter = section(source, 'function encodeStorageObjectPath', 'function sanitizeRecoveryCode');
    assert.match(adapter, /supabaseFetch\(`\/storage\/v1\/object\/\$\{encodeURIComponent\(object\.bucket\)\}/);
    assert.match(adapter, /"x-upsert": "false"/);
    assert.match(adapter, /body: file/);
    assert.match(adapter, /method: "DELETE"[\s\S]*prefixes: \[object\.path\]/);
    assert.match(adapter, /createSignedUrls\(references, expiresIn = 600\)/);
    assert.match(adapter, /signedUrl\.origin === expectedOrigin/);
    assert.ok(adapter.includes('signedUrl.pathname.startsWith(`/storage/v1/object/sign/${PRODUCT_IMAGE_BUCKET}/`)'));
    assert.ok(adapter.includes('signedValue.startsWith("/object/sign/")'));
    assert.doesNotMatch(adapter, /publicUrl|\/object\/public\//i);
  });

  test(`${file}: product save compensates uncommitted uploads and removes old images only after RPC success`, () => {
    const modal = section(source, 'function ProductModal', '/* ============================== EXPENSES');
    assert.match(modal, /const productIdRef = useRef\(product\?\.id \|\| newDbId\(\)\)/);
    assert.match(modal, /accept="image\/jpeg,image\/png,image\/webp"/);
    assert.match(modal, /validateProductImageFile\(file\)/);
    const uploadIndex = modal.indexOf('uploadedReference = await supabaseProductImages.upload');
    const persistIndex = modal.indexOf('await setProducts(payload, "upsert")');
    const oldCleanupIndex = modal.indexOf('await supabaseProductImages.remove(existingImageReference)');
    assert.ok(uploadIndex >= 0 && persistIndex > uploadIndex && oldCleanupIndex > persistIndex);
    assert.match(modal, /const uncommittedImage = uploadedReference \|\| e\?\.objectReference/);
    assert.match(modal, /if \(uncommittedImage && !e\?\.commitUncertain\)[\s\S]*await supabaseProductImages\.remove\(uncommittedImage\)/);
    assert.match(modal, /uploaded image was preserved because the product save may have committed/i);
    assert.match(modal, /new upload is committed only when the product is saved/i);
  });

  test(`${file}: local blob previews are explicit and cannot enter persisted product data`, () => {
    const imageComponent = section(source, 'function ProductImage', '/* ============================== SALES');
    const modal = section(source, 'function ProductModal', '/* ============================== EXPENSES');
    assert.match(imageComponent, /localPreviewUrl = ""/);
    assert.match(imageComponent, /localPreviewUrl\.startsWith\("blob:"\)/);
    assert.match(imageComponent, /safeLocalPreview \|\| normalizeProductImageUrl/);
    assert.match(modal, /localPreviewUrl=\{pendingImagePreview\}/);
    assert.doesNotMatch(modal, /image:\s*pendingImagePreview/);
  });

  test(`${file}: product loads batch-sign private images and keeps HTTPS compatibility`, () => {
    const hook = section(source, 'function useSupabaseProducts', 'const inventoryTxTypeLabel');
    assert.match(hook, /supabaseProductImages\.createSignedUrls\(privateImageReferences\)/);
    assert.match(hook, /privateImageReferences\.some\(\(reference\) => !signedImages\.has\(reference\)\)/);
    assert.match(hook, /imageDisplayUrl: normalizeProductImageUrl\(r\.image_url \|\| ""\) \|\| signedImages\.get\(r\.image_url\) \|\| ""/);
    assert.match(hook, /Product photos could not be loaded securely/);
    const image = section(source, 'function ProductImage', '/* ============================== SALES');
    assert.match(image, /product\?\.imageDisplayUrl \|\| product\?\.image/);
  });
}

test('Storage adapter protocol uploads, signs and removes the same isolated object path', async () => {
  const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const calls = [];
  const business = '11111111-1111-4111-8111-111111111111';
  const product = '22222222-2222-4222-8222-222222222222';
  const object = '33333333-3333-4333-8333-333333333333';
  const expectedPath = `${business}/${product}/${object}.png`;
  const context = vm.createContext({
    URL, Map, RegExp, String, Number, Error, JSON, encodeURIComponent,
    SUPABASE_URL: 'https://msinksoilkluooxenecy.supabase.co',
    newDbId: () => object,
    supabaseFetch: async (path, options) => {
      calls.push({ path, options });
      if (path.includes('/sign/')) return { ok: true, status: 200, json: async () => [{ path: expectedPath, signedURL: `/object/sign/nexalvo-product-images/${expectedPath}?token=mock` }] };
      return { ok: true, status: 200, json: async () => ({}) };
    },
  });
  vm.runInContext(
    section(source, 'function normalizeProductImageUrl', 'function normalizeCatalogSearch')
      + section(source, 'function encodeStorageObjectPath', 'function sanitizeRecoveryCode')
      + ';globalThis.images=supabaseProductImages;',
    context,
  );
  const file = { type: 'image/png', size: 1024 };
  const reference = await context.images.upload(file, business, product);
  assert.equal(reference, `storage://nexalvo-product-images/${expectedPath}`);
  assert.equal(calls[0].options.headers['x-upsert'], 'false');
  assert.equal(calls[0].options.body, file);
  const signed = await context.images.createSignedUrls([reference]);
  assert.match(signed.get(reference), /^https:\/\/msinksoilkluooxenecy\.supabase\.co\/storage\/v1\/object\/sign\//);
  assert.equal(await context.images.remove(reference), true);
  assert.equal(JSON.parse(calls.at(-1).options.body).prefixes[0], expectedPath);
});

test('prepared Storage SQL is private, tenant-scoped and permission-scoped', () => {
  assert.match(migration, /PREPARED ONLY: do not apply/);
  assert.match(migration, /'nexalvo-product-images'[\s\S]*false[\s\S]*5242880/);
  assert.match(migration, /ARRAY\['image\/jpeg', 'image\/png', 'image\/webp'\]/);
  for (const operation of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) assert.match(migration, new RegExp(`FOR ${operation}`));
  assert.match(migration, /\(storage\.foldername\(name\)\)\[1\] = public\.current_business_id\(\)::text/g);
  assert.match(migration, /public\.user_can\('manageRecipesAndCosts'\)/g);
  assert.doesNotMatch(migration, /public\s*=\s*true/i);
  assert.doesNotMatch(migration, /\b(DROP|TRUNCATE)\b/i);
});

test('Storage deployment includes readonly discovery and data-preserving rollback', () => {
  assert.match(preflight, /BEGIN TRANSACTION READ ONLY;/);
  assert.match(preflight, /SET LOCAL statement_timeout = '30s';/);
  assert.match(preflight, /ROLLBACK;/);
  assert.match(preflight, /FROM storage\.buckets/);
  assert.match(preflight, /FROM pg_policies/);
  assert.match(preflight, /has_function_privilege\('authenticated'/);
  assert.doesNotMatch(preflight, /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/im);
  assert.match(rollback, /rollback refused: product image objects exist/);
  assert.match(rollback, /DROP POLICY IF EXISTS/);
  assert.doesNotMatch(rollback, /\bCASCADE\b/i);
});

test('root and src application copies remain identical after Storage work', () => {
  assert.equal(readFileSync(new URL('../App.jsx', import.meta.url), 'utf8'), readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'));
});

test('product upload controls and validation messages are translated to Portuguese', () => {
  const i18n = readFileSync(new URL('../src/i18n.jsx', import.meta.url), 'utf8');
  for (const key of ['Upload product photo', 'Choose a different photo', 'Remove photo', 'Product images must be 5 MB or smaller.']) {
    assert.match(i18n, new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:`), key);
  }
});
