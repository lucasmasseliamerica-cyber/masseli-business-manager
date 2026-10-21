// AUTHORIZED A-Jornada only. Never executed by ordinary CI. Real UI + real TEST persistence.
// No browser traces/videos/screenshots, storageState export, API bodies or signed URLs in logs.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, renameSync, readFileSync, chmodSync, existsSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  PHOTO_HOST, PHOTO_BUCKET, PHOTO_FIXTURE, PHOTO_ACTORS, PhotoSignal, ensure, fingerprint,
  validatePhotoConfiguration, assertDedicatedPhotoFixture, assertProductRestorable,
  assertOwnedPhotoPath, validatePhotoProductWrite, restorePhotoPayload, safePhotoReport, assertPositivePhotoReconciliation,
} from './photo-journey-core.mjs';

const LOCAL = 'http://127.0.0.1:4187';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const requiredChecks = ['owner_a_b', 'read_isolation', 'permissions', 'dedicated_fixture', 'snapshot',
  'preview', 'upload_failure_recovery', 'upload_persist_reload', 'lost_write_response_reconciled',
  'replace_persist_reload', 'remove_persist_reload', 'owner_b_object_denied', 'anonymous_object_denied',
  'audit_preserved', 'fixture_restored', 'no_residual_objects'];

function git(...args) { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
function jsonFile(path, body) {
  const temporary = path + '.next';
  writeFileSync(temporary, JSON.stringify(body, null, 2), { mode: 0o600 });
  renameSync(temporary, path);
}

export async function photoJourney(env = process.env, args = process.argv.slice(2)) {
  const report = { scope: 'A_JORNADA_REAL_TEST_PHOTOS', status: 'BLOCKED', code: 'NOT_STARTED',
    checks: Object.fromEntries(requiredChecks.map(name => [name, 'BLOCKED'])),
    storage: { before: null, after: null, uploads_forwarded: 0 }, restored: false,
    timestamp_changes_preserved: true, audit_rows_deleted: 0, writes_outside_scope: 0 };
  const sessions = {};
  let snapshot, checkpoint, browser, context, server, config, api, lastProduct, globalUncertain = false;
  let stopped = false, routeFailure = null, droppedProductResponse = false, offlineBeforeUpload = false;
  const onStop = () => { stopped = true; };
  const pass = name => { report.checks[name] = 'PASS'; };
  const save = phase => { snapshot.phase = phase; snapshot.lastProduct = lastProduct; jsonFile(checkpoint, snapshot); };
  try {
    config = validatePhotoConfiguration(env);
    ensure(git('branch', '--show-current') === 'automation/nexalvo-qa-actions', 'QA_BRANCH_REQUIRED');
    ensure(!git('status', '--porcelain'), 'CLEAN_QA_WORKTREE_REQUIRED');
    // Preserve the exact user's test correction; never recreate an absent commit implicitly.
    let ancestor;
    try { ancestor = git('rev-parse', '--verify', '9b381e8^{commit}'); git('merge-base', '--is-ancestor', ancestor, 'HEAD'); }
    catch { throw new PhotoSignal('SOURCE_COMMIT_9B381E8_REQUIRED'); }
    report.source_sha = git('rev-parse', 'HEAD');
    ensure(/^[0-9a-f]{40}$/.test(env.QA_PHOTO_VALIDATED_CODE_SHA || ''), 'VALIDATED_CODE_SHA_REQUIRED');
    try { git('merge-base', '--is-ancestor', env.QA_PHOTO_VALIDATED_CODE_SHA, 'HEAD'); }
    catch { throw new PhotoSignal('VALIDATED_CODE_NOT_IN_HISTORY'); }
    ensure(git('diff', '--name-only', `${env.QA_PHOTO_VALIDATED_CODE_SHA}..HEAD`).split('\n').every(path => !path || path.startsWith('docs/')), 'UNVALIDATED_CODE_CHANGES');
    report.validated_code_sha = env.QA_PHOTO_VALIDATED_CODE_SHA;
    process.on('SIGINT', onStop); process.on('SIGTERM', onStop);

    api = async (path, actor = 'A', { body, method, binary = false, allowDenied = false } = {}) => {
      const target = new URL(path, config.origin);
      ensure(target.origin === config.origin && !target.username && !target.password, 'API_TARGET_OUTSIDE_TEST');
      let response;
      try {
        response = await fetch(target, { method: method || (body === undefined ? 'GET' : 'POST'), redirect: 'error',
          headers: { apikey: config.key, ...(actor !== 'anon' ? { Authorization: `Bearer ${sessions[actor].token}` }
            : config.key.split('.').length === 3 ? { Authorization: `Bearer ${config.key}` } : {}),
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
      } catch { throw new PhotoSignal('TEST_API_RESPONSE_UNKNOWN'); }
      if (binary) return response;
      let data;
      try { data = await response.json(); } catch { throw new PhotoSignal('TEST_API_INVALID_RESPONSE'); }
      if (!allowDenied) ensure(response.ok, `TEST_API_HTTP_${response.status}`);
      return allowDenied ? { status: response.status, ok: response.ok, data } : data;
    };
    for (const label of ['A', 'B']) {
      let response;
      try {
        response = await fetch(config.origin + '/auth/v1/token?grant_type=password', {
          method: 'POST', redirect: 'error', headers: { apikey: config.key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: env[`QA_TWO_TENANT_${label}_EMAIL`], password: env[`QA_TWO_TENANT_${label}_PASSWORD`] }),
          signal: AbortSignal.timeout(20000) });
      } catch { throw new PhotoSignal('QA_LOGIN_UNAVAILABLE'); }
      ensure(response.ok, 'QA_LOGIN_REJECTED');
      const login = await response.json();
      ensure(typeof login.access_token === 'string', 'QA_SESSION_MISSING');
      sessions[label] = { token: login.access_token, user: { id: login.user?.id, app_metadata: login.user?.app_metadata || {} } };
      const identity = await api('/auth/v1/user', label);
      const [profile] = await api(`/rest/v1/users?select=id,business_id,role,active&id=eq.${PHOTO_ACTORS[label].owner}`, label);
      ensure(identity.id === PHOTO_ACTORS[label].owner && profile?.id === identity.id && profile.active === true && profile.role === 'OWNER'
        && profile.business_id === PHOTO_ACTORS[label].business, 'QA_OWNER_IDENTITY_MISMATCH');
      ensure(await api('/rest/v1/rpc/current_business_id', label) === profile.business_id, 'QA_TENANT_CONTEXT_MISMATCH');
    }
    pass('owner_a_b');
    for (const label of ['A', 'B']) ensure(await api('/rest/v1/rpc/user_can?p_permission_key=manageRecipesAndCosts', label) === true, 'PHOTO_PERMISSION_REQUIRED');
    pass('permissions');

    const rows = await api(`/rest/v1/products?select=*&business_id=eq.${PHOTO_ACTORS.A.business}&name=eq.${encodeURIComponent(PHOTO_FIXTURE)}&limit=2`);
    ensure(Array.isArray(rows) && rows.length === 1, 'UNIQUE_PHOTO_FIXTURE_REQUIRED');
    lastProduct = rows[0];
    const current = async () => {
      const rows = await api(`/rest/v1/products?select=*&id=eq.${snapshot.product.id}&business_id=eq.${PHOTO_ACTORS.A.business}`);
      ensure(rows.length === 1, 'PHOTO_FIXTURE_DISAPPEARED');
      return rows[0];
    };
    const recipes = async () => api(`/rest/v1/product_recipes?select=*&product_id=eq.${lastProduct.id}`);
    const history = async () => api(`/rest/v1/rpc/fn_read_sale_items_secure?select=id&product_id=eq.${lastProduct.id}&limit=1`);
    const folder = async () => {
      const list = await api(`/storage/v1/object/list/${PHOTO_BUCKET}`, 'A', { body: {
        prefix: `${PHOTO_ACTORS.A.business}/${lastProduct.id}`, limit: 10, offset: 0, sortBy: { column: 'name', order: 'asc' },
      } });
      ensure(Array.isArray(list) && list.length < 10, 'PHOTO_FOLDER_INSPECTION_INCOMPLETE');
      return list; // Folder entries also mean historical content: never hide them from preflight.
    };
    const foreign = await api(`/rest/v1/products?select=id&id=eq.${lastProduct.id}`, 'B');
    const anonymous = await api(`/rest/v1/products?select=id&id=eq.${lastProduct.id}`, 'anon', { allowDenied: true });
    ensure(foreign.length === 0 && (!anonymous.ok || Array.isArray(anonymous.data) && !anonymous.data.length), 'CROSS_TENANT_PRODUCT_ACCESS', 'FAIL');
    pass('read_isolation');

    const onlyReconcile = args.includes('--reconcile-readonly');
    const recoveryIndex = onlyReconcile ? args.indexOf('--reconcile-readonly') : args.indexOf('--recover');
    if (recoveryIndex >= 0) {
      checkpoint = resolve(args[recoveryIndex + 1] || '');
      ensure(checkpoint.startsWith(resolve(tmpdir()) + '/') || checkpoint.startsWith(resolve(tmpdir()) + '\\'), 'RECOVERY_FILE_OUTSIDE_PRIVATE_TEMP');
      snapshot = JSON.parse(readFileSync(checkpoint, 'utf8'));
      ensure(snapshot.product?.id === lastProduct.id && snapshot.product.image_url === null && snapshot.ownedPaths?.length <= 2, 'RECOVERY_SCOPE_INVALID');
      ensure(Array.isArray(snapshot.objectsBefore) && snapshot.objectsBefore.length === 0, 'RECOVERY_BASELINE_REQUIRED');
      report.storage.before = snapshot.objectsBefore.length;
      snapshot.ownedPaths.forEach(path => assertOwnedPhotoPath(path, snapshot));
      ensure(onlyReconcile || !snapshot.unresolvedWrite, 'UNSETTLED_WRITE_REQUIRES_READONLY_RECONCILIATION');
      assertProductRestorable(snapshot.product, lastProduct);
    } else {
      const originalRecipes = await recipes(), originalHistory = await history(), originalObjects = await folder();
      assertDedicatedPhotoFixture(lastProduct, { recipes: originalRecipes, history: originalHistory, objects: originalObjects });
      // Previous edits are not silently treated as an exclusive, untouched QA fixture.
      const auditBefore = await api(`/rest/v1/audit_logs?select=id&business_id=eq.${PHOTO_ACTORS.A.business}&action=ilike.*Product*Updated*&details=ilike.*${encodeURIComponent(PHOTO_FIXTURE)}*&limit=1`);
      ensure(auditBefore.length === 0, 'FIXTURE_HAS_PREVIOUS_UPDATE_HISTORY');
      const directory = env.QA_PHOTO_PRIVATE_DIR || mkdtempSync(join(tmpdir(), 'nexalvo-photo-'));
      ensure(existsSync(directory), 'PRIVATE_CHECKPOINT_DIRECTORY_REQUIRED');
      const privateRoot = resolve(tmpdir()).toLowerCase();
      const actualDirectory = realpathSync(directory).toLowerCase();
      ensure(actualDirectory.startsWith(privateRoot + '/') || actualDirectory.startsWith(privateRoot + '\\'), 'PRIVATE_SNAPSHOT_OUTSIDE_TEMP');
      if (process.platform !== 'win32') chmodSync(directory, 0o700);
      else ensure(env.QA_PHOTO_PRIVATE_DIRECTORY_ACL === 'CURRENT_USER_ONLY', 'WINDOWS_PRIVATE_ACL_REQUIRED');
      checkpoint = join(directory, 'photo-recovery.json');
      ensure(!existsSync(checkpoint), 'UNFINISHED_PHOTO_CHECKPOINT_EXISTS');
      snapshot = { schemaVersion: 1, product: lastProduct, recipes: originalRecipes, objectsBefore: originalObjects, ownedPaths: [],
        unresolvedWrite: false, sourceSha: report.source_sha, startedAt: new Date().toISOString(), phase: 'PREPARED' };
      report.storage.before = originalObjects.length;
      pass('dedicated_fixture'); pass('snapshot'); save('SNAPSHOT_RETAINED');
      await sleep(1000);
      ensure(fingerprint(lastProduct) === fingerprint(await current()), 'FIXTURE_HAS_CONCURRENT_WRITER');
    }

    // Compensation never deletes historical paths and never overwrites a changed business field.
    const compensate = async () => {
      ensure(!snapshot.unresolvedWrite && !globalUncertain, 'UNSETTLED_WRITE_COMPENSATION_BLOCKED');
      const row = await current(); assertProductRestorable(snapshot.product, row);
      const allowed = [null, ...snapshot.ownedPaths.map(path => `storage://${PHOTO_BUCKET}/${path}`)];
      ensure(allowed.includes(row.image_url), 'FOREIGN_IMAGE_REFERENCE_COMPENSATION_BLOCKED');
      if (row.image_url !== null) {
        const args = restorePhotoPayload(snapshot.product); validatePhotoProductWrite(args, snapshot);
        snapshot.pending = { kind: 'product', expectedImage: null, previousUpdatedAt: row.updated_at };
        snapshot.unresolvedWrite = true; save('RESTORING_REFERENCE');
        await api('/rest/v1/rpc/fn_save_product', 'A', { body: args });
        lastProduct = await current();
        ensure(lastProduct.image_url === null, 'REFERENCE_RESTORE_UNCONFIRMED');
        snapshot.unresolvedWrite = false; snapshot.pending = null; save('REFERENCE_RESTORED');
      }
      const present = await folder();
      ensure(present.every(row => snapshot.ownedPaths.some(path => path.split('/').at(-1) === row.name)), 'FOREIGN_OBJECT_IN_FIXTURE_FOLDER');
      for (const path of snapshot.ownedPaths) {
        assertOwnedPhotoPath(path, snapshot);
        if (!present.some(row => row.name === path.split('/').at(-1))) continue;
        const ref = `storage://${PHOTO_BUCKET}/${path}`;
        const references = await api(`/rest/v1/products?select=id&image_url=eq.${encodeURIComponent(ref)}`);
        ensure(references.length === 0, 'OBJECT_STILL_REFERENCED');
        const response = await api(`/storage/v1/object/${PHOTO_BUCKET}`, 'A', { method: 'DELETE', body: { prefixes: [path] }, allowDenied: true });
        ensure(response.ok || response.status === 404, 'OWNED_OBJECT_CLEANUP_UNCONFIRMED');
      }
      const final = await current(); assertProductRestorable(snapshot.product, final);
      ensure(final.image_url === null && (await recipes()).length === 0 && (await history()).length === 0, 'FIXTURE_RESTORATION_FAILED');
      const after = await folder(); ensure(after.length === 0, 'RESIDUAL_PHOTO_OBJECTS');
      report.storage.after = after.length; report.restored = true;
      report.snapshot_before_sha256 = fingerprint(snapshot.product); report.snapshot_after_sha256 = fingerprint(final);
      pass('fixture_restored'); pass('no_residual_objects'); save('RESTORED');
    };

    if (onlyReconcile) {
      let observedHash;
      if (snapshot.pending?.kind === 'upload') {
        assertOwnedPhotoPath(snapshot.pending.path, snapshot);
        const response = await api(`/storage/v1/object/authenticated/${PHOTO_BUCKET}/${snapshot.pending.path}`, 'A', { binary: true });
        ensure(response.ok, 'UPLOAD_COMMIT_NOT_POSITIVELY_OBSERVED');
        observedHash = fingerprint([...new Uint8Array(await response.arrayBuffer())]);
      }
      assertPositivePhotoReconciliation(snapshot, lastProduct, observedHash);
      snapshot.unresolvedWrite = false; snapshot.pending = null; save('RECONCILED_READONLY');
      report.readonly_reconciliation = 'PASS'; report.code = 'READONLY_RECONCILED_COMPENSATION_STILL_REQUIRED';
    } else if (recoveryIndex >= 0) {
      await compensate(); report.status = 'BLOCKED'; report.code = 'RECOVERY_ONLY_NOT_HOMOLOGATION';
    } else {
      try {
        const { chromium } = await import('playwright').catch(() => { throw new PhotoSignal('PLAYWRIGHT_REQUIRED'); });
        // Launch Vite without inheriting QA credentials or privileged environment bindings.
        const childEnv = Object.fromEntries(['PATH', 'SystemRoot', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'WINDIR']
          .filter(name => env[name]).map(name => [name, env[name]]));
        childEnv.VITE_SUPABASE_URL = config.origin; childEnv.VITE_SUPABASE_ANON_KEY = config.key;
        ensure(!await fetch(LOCAL).then(() => true).catch(() => false), 'PHOTO_QA_PORT_IN_USE');
        server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4187', '--strictPort'], { env: childEnv, stdio: 'ignore' });
        let ready = false;
        for (let i = 0; i < 40; i++) { if (await fetch(LOCAL).then(r => r.ok).catch(() => false)) { ready = true; break; } await sleep(250); }
        ensure(ready, 'PHOTO_QA_VITE_UNAVAILABLE');
        browser = await chromium.launch({ headless: true, ...(env.NEXALVO_QA_CHROMIUM_PATH ? { executablePath: env.NEXALVO_QA_CHROMIUM_PATH } : {}) });
        context = await browser.newContext({ serviceWorkers: 'block' });
        await context.addInitScript(({ token, user }) => {
          localStorage.setItem('nexalvo.ui.language.v1', 'en');
          localStorage.setItem('nexalvo.supabase.session.v1', JSON.stringify({ accessToken: token, expiresAt: Date.now() + 1800000, user }));
        }, { token: sessions.A.token, user: sessions.A.user });
        const page = await context.newPage();
        await context.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url());
          try {
            ensure(!stopped, 'PHOTO_JOURNEY_INTERRUPTED');
            if (url.origin === LOCAL) return route.continue();
            ensure(url.origin === config.origin, 'BROWSER_TARGET_OUTSIDE_TEST');
            if (['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return route.continue();
            if (url.pathname === `/storage/v1/object/sign/${PHOTO_BUCKET}`) return route.continue();
            if (url.pathname.startsWith('/rest/v1/rpc/') && ['current_business_id', 'user_can', 'fn_session_access_status'].includes(url.pathname.split('/').at(-1))) return route.continue();
            if (url.pathname === '/rest/v1/rpc/fn_reconcile_business_alerts') return route.abort();
            const body = () => req.postDataJSON();
            if (req.method() === 'POST' && url.pathname.startsWith(`/storage/v1/object/${PHOTO_BUCKET}/`)) {
              // route.fetch uses an API context that can bypass Chromium offline mode. Do not
              // forward anything during this controlled offline test, even if the driver could.
              if (offlineBeforeUpload) return route.abort();
              const path = decodeURIComponent(url.pathname.slice(`/storage/v1/object/${PHOTO_BUCKET}/`.length));
              assertOwnedPhotoPath(path, snapshot);
              ensure(report.storage.uploads_forwarded < 2, 'TWO_UPLOAD_LIMIT_REACHED');
              ensure(!snapshot.ownedPaths.includes(path), 'DUPLICATE_UPLOAD_PATH_FORBIDDEN');
              ensure(req.headers()['x-upsert'] === 'false' && req.postDataBuffer()?.length < 5 * 1024 * 1024, 'UNSAFE_PHOTO_UPLOAD');
              ensure(fingerprint(await current()) === fingerprint(lastProduct), 'FIXTURE_HAS_CONCURRENT_WRITER');
              snapshot.ownedPaths.push(path); report.storage.uploads_forwarded++;
              snapshot.pending = { kind: 'upload', path, bodyHash: fingerprint([...req.postDataBuffer()]) };
              snapshot.unresolvedWrite = true; save('UPLOADING');
              const response = await route.fetch();
              if (response.status() >= 500 || response.status() === 408) throw new PhotoSignal('STORAGE_WRITE_UNKNOWN');
              ensure(response.ok(), 'STORAGE_UPLOAD_REJECTED', 'FAIL');
              snapshot.unresolvedWrite = false; snapshot.pending = null; save('UPLOAD_CONFIRMED');
              return route.fulfill({ response });
            }
            if (req.method() === 'POST' && url.pathname === '/rest/v1/rpc/fn_save_product') {
              const payload = body(); validatePhotoProductWrite(payload, snapshot);
              ensure(fingerprint(await current()) === fingerprint(lastProduct), 'FIXTURE_HAS_CONCURRENT_WRITER');
              ensure(payload.p_image_url !== lastProduct.image_url, 'DUPLICATE_PHOTO_SAVE_FORBIDDEN');
              snapshot.pending = { kind: 'product', expectedImage: payload.p_image_url, previousUpdatedAt: lastProduct.updated_at };
              snapshot.unresolvedWrite = true; save('SAVING_PRODUCT');
              const response = await route.fetch();
              if (response.status() >= 500 || response.status() === 408) throw new PhotoSignal('PRODUCT_WRITE_UNKNOWN');
              ensure(response.ok(), 'PRODUCT_SAVE_REJECTED', 'FAIL');
              lastProduct = await current(); assertProductRestorable(snapshot.product, lastProduct);
              ensure(lastProduct.image_url === payload.p_image_url, 'PRODUCT_SAVE_NOT_OBSERVED');
              snapshot.unresolvedWrite = false; snapshot.pending = null; save('PRODUCT_WRITE_CONFIRMED');
              if (!droppedProductResponse) { droppedProductResponse = true; return route.abort(); }
              return route.fulfill({ response });
            }
            if (req.method() === 'DELETE' && url.pathname === `/storage/v1/object/${PHOTO_BUCKET}`) {
              const paths = body().prefixes;
              ensure(Array.isArray(paths) && paths.length > 0 && paths.every(path => snapshot.ownedPaths.includes(path)), 'DELETE_OUTSIDE_RUN_FORBIDDEN');
              const row = await current();
              ensure(paths.every(path => row.image_url !== `storage://${PHOTO_BUCKET}/${path}`), 'DELETE_REFERENCED_PHOTO_FORBIDDEN');
              return route.continue();
            }
            if (req.method() === 'POST' && url.pathname === '/rest/v1/rpc/fn_write_audit') {
              ensure(body().p_action === 'Product Updated' && body().p_details.startsWith(PHOTO_FIXTURE + ' · '), 'AUDIT_OUTSIDE_PHOTO_SCOPE');
              return route.continue();
            }
            throw new PhotoSignal('BROWSER_MUTATION_OUTSIDE_PHOTO_SCOPE');
          } catch (e) {
            routeFailure = e instanceof PhotoSignal ? e : new PhotoSignal('PHOTO_ROUTE_FAILED');
            if (snapshot.unresolvedWrite) globalUncertain = true;
            await route.abort().catch(() => {});
          }
        });

        const openProduct = async () => {
          await page.goto(LOCAL, { waitUntil: 'domcontentloaded' });
          await page.locator('main').waitFor();
          await page.getByRole('button', { name: 'Products', exact: true }).first().click();
          await page.getByText(PHOTO_FIXTURE, { exact: true }).click();
          return page.getByRole('dialog');
        };
        const png1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
        const png2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBt8AAAAASUVORK5CYII=', 'base64');
        const choose = async (dialog, buffer) => {
          await dialog.locator('input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer });
          const preview = dialog.locator('img[src^="blob:"]'); await preview.waitFor();
          await preview.scrollIntoViewIfNeeded();
          ensure(await preview.evaluate(async img => { try { await img.decode(); return img.naturalWidth > 0; } catch { return false; } }), 'LOCAL_PREVIEW_FAILED', 'FAIL');
        };
        let dialog = await openProduct(); await choose(dialog, png1); pass('preview');
        // Browser offline before upload: no write reaches TEST, then reload/reconcile, no blind retry.
        offlineBeforeUpload = true; await context.setOffline(true);
        await dialog.getByRole('button', { name: 'Save Product', exact: true }).click();
        await dialog.getByText(/The upload result is unknown/).waitFor();
        ensure(await dialog.getByRole('button', { name: 'Save Product', exact: true }).isDisabled(), 'UNCERTAIN_UPLOAD_RETRY_NOT_BLOCKED');
        await context.setOffline(false); offlineBeforeUpload = false;
        ensure(report.storage.uploads_forwarded === 0 && (await current()).image_url === null && (await folder()).length === 0, 'OFFLINE_UPLOAD_NOT_ISOLATED');
        pass('upload_failure_recovery');

        dialog = await openProduct(); await choose(dialog, png1);
        await dialog.getByRole('button', { name: 'Save Product', exact: true }).click();
        for (let i = 0; i < 40 && !droppedProductResponse && !routeFailure; i++) await sleep(250);
        ensure(!routeFailure && droppedProductResponse, routeFailure?.code || 'LOST_RESPONSE_SCENARIO_NOT_OBSERVED');
        const first = await current(); ensure(first.image_url === `storage://${PHOTO_BUCKET}/${snapshot.ownedPaths[0]}`, 'FIRST_PHOTO_NOT_PERSISTED');
        ensure((await folder()).length === 1, 'FIRST_OBJECT_MISSING');
        pass('lost_write_response_reconciled');
        // Explicitly record the real read-after-commit observation; do not fabricate a normal
        // frontend save event which could not run after the deliberately lost HTTP response.
        await api('/rest/v1/rpc/fn_write_audit', 'A', { body: { p_action: 'QA Photo Reconciled',
          p_details: `${PHOTO_FIXTURE} · first photo confirmed after lost response · ${fingerprint(first)}` } });
        dialog = await openProduct();
        const visiblePhoto = dialog.locator('img'); await visiblePhoto.waitFor();
        await visiblePhoto.scrollIntoViewIfNeeded();
        ensure(await visiblePhoto.evaluate(async img => { try { await img.decode(); return img.naturalWidth > 0; } catch { return false; } }), 'PHOTO_NOT_VISIBLE_AFTER_RELOAD');
        pass('upload_persist_reload');

        const checkObjectIsolation = async (path, expectedBytes) => {
        const own = await api(`/storage/v1/object/authenticated/${PHOTO_BUCKET}/${path}`, 'A', { binary: true });
        ensure(own.ok, 'OWNER_A_CANNOT_READ_OBJECT');
        ensure(Buffer.from(await own.arrayBuffer()).equals(expectedBytes), 'PERSISTED_IMAGE_BYTES_DIFFER', 'FAIL');
        for (const label of ['B', 'anon']) {
          const read = await api(`/storage/v1/object/authenticated/${PHOTO_BUCKET}/${path}`, label, { binary: true });
          if (read.status >= 500 || read.status === 429) throw new PhotoSignal('ISOLATION_SERVICE_UNAVAILABLE');
          ensure([400, 401, 403, 404].includes(read.status), 'CROSS_TENANT_OBJECT_READ', 'FAIL'); await read.arrayBuffer();
          const sign = await api(`/storage/v1/object/sign/${PHOTO_BUCKET}/${path}`, label, { body: { expiresIn: 60 }, allowDenied: true });
          if (sign.status >= 500 || sign.status === 429) throw new PhotoSignal('ISOLATION_SERVICE_UNAVAILABLE');
          ensure(!sign.ok && [400, 401, 403, 404].includes(sign.status), 'CROSS_TENANT_OBJECT_SIGN', 'FAIL');
          pass(label === 'B' ? 'owner_b_object_denied' : 'anonymous_object_denied');
        }
        const publicRead = await api(`/storage/v1/object/public/${PHOTO_BUCKET}/${path}`, 'anon', { binary: true });
        ensure(!publicRead.ok && [400, 401, 403, 404].includes(publicRead.status), 'PRIVATE_BUCKET_PUBLIC_ACCESS', 'FAIL'); await publicRead.arrayBuffer();
        report.isolation_objects_checked = (report.isolation_objects_checked || 0) + 1;
        };
        await checkObjectIsolation(snapshot.ownedPaths[0], png1);

        await choose(dialog, png2);
        await dialog.getByRole('button', { name: 'Save Product', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        ensure(!routeFailure && snapshot.ownedPaths.length === 2 && (await current()).image_url === `storage://${PHOTO_BUCKET}/${snapshot.ownedPaths[1]}` && (await folder()).length === 1, 'REPLACEMENT_NOT_RECONCILED');
        dialog = await openProduct();
        await dialog.locator('img').scrollIntoViewIfNeeded();
        ensure(await dialog.locator('img').evaluate(async img => { try { await img.decode(); return img.naturalWidth > 0; } catch { return false; } }), 'REPLACEMENT_NOT_VISIBLE_AFTER_RELOAD');
        await checkObjectIsolation(snapshot.ownedPaths[1], png2);
        pass('replace_persist_reload');
        await dialog.getByRole('button', { name: 'Remove photo', exact: true }).click();
        await dialog.getByRole('button', { name: 'Save Product', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        dialog = await openProduct();
        ensure(await dialog.locator('img').count() === 0 && (await current()).image_url === null && (await folder()).length === 0, 'PHOTO_REMOVAL_NOT_RECONCILED');
        pass('remove_persist_reload');
        const auditAfter = await api(`/rest/v1/audit_logs?select=id&business_id=eq.${PHOTO_ACTORS.A.business}&details=ilike.*${encodeURIComponent(PHOTO_FIXTURE)}*&occurred_at=gte.${encodeURIComponent(snapshot.startedAt)}&limit=100`);
        ensure(Array.isArray(auditAfter) && auditAfter.length >= 3 && auditAfter.length < 100, 'PHOTO_AUDIT_NOT_CONFIRMED');
        report.audit_entries_observed = auditAfter.length; pass('audit_preserved');
      } catch (e) {
        report.primary_code = e instanceof PhotoSignal ? e.code : 'PHOTO_UI_STEP_UNCONFIRMED';
        throw e;
      } finally {
        await browser?.close().catch(() => {}); browser = null;
        try { await compensate(); }
        catch (e) { report.compensation_code = e instanceof PhotoSignal ? e.code : 'PHOTO_COMPENSATION_UNCONFIRMED'; throw e; }
      }
      ensure(!routeFailure && !stopped && requiredChecks.every(name => report.checks[name] === 'PASS'), routeFailure?.code || 'MANDATORY_PHOTO_CHECKS_INCOMPLETE');
      report.status = 'PASS'; report.code = 'REAL_PHOTO_JOURNEY_RESTORED';
    }
  } catch (e) {
    report.status = e instanceof PhotoSignal ? e.status : 'BLOCKED';
    report.code = e instanceof PhotoSignal ? e.code : 'PHOTO_EXECUTION_UNCONFIRMED';
    if (snapshot) report.recovery_checkpoint_retained = true;
  } finally {
    await browser?.close().catch(() => {});
    server?.kill();
    // Revoke only these newly created local Auth sessions, never global logout or passwords.
    for (const label of Object.keys(sessions)) {
      try { await fetch(config.origin + '/auth/v1/logout?scope=local', { method: 'POST', redirect: 'error', headers: { apikey: config.key, Authorization: `Bearer ${sessions[label].token}` }, signal: AbortSignal.timeout(10000) }); } catch { /* No secret-bearing error output. */ }
      delete sessions[label];
    }
    process.removeListener('SIGINT', onStop); process.removeListener('SIGTERM', onStop);
  }
  return safePhotoReport(report);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await photoJourney();
  console.log(JSON.stringify(report));
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'FAIL' ? 1 : 2;
}
