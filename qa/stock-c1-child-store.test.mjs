import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync,
  chmodSync, renameSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { openC1ChildStore, C1_CHILD_AUTHORIZATION, c1ChildRegistryPath } from './stock-c1-child-store.mjs';
import { STOCK_ACTORS } from './stock-journey-core.mjs';
import { C1_FIXTURE as F, C1_CHECKS, makeC1State, sealC1Checkpoint } from './stock-c1-protocol.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const securityHash = 'd'.repeat(64);
const moduleUrl = pathToFileURL(join(process.cwd(), 'qa/stock-c1-child-store.mjs')).href;
// Node test files run in isolated processes. All store I/O stays beneath this
// per-file owned TEMP; the real/shared registry and historical checkpoints are never touched.
const storeTestRoot = mkdtempSync(join(tmpdir(), 'nexalvo-child-store-suite-'));
chmodSync(storeTestRoot, 0o700);
const originalTemp = Object.fromEntries(['TMPDIR','TEMP','TMP'].map(name => [name, process.env[name]]));
for (const name of ['TMPDIR','TEMP','TMP']) process.env[name] = storeTestRoot;
after(() => {
  for (const name of ['TMPDIR','TEMP','TMP']) {
    if (originalTemp[name] === undefined) delete process.env[name]; else process.env[name] = originalTemp[name];
  }
  rmSync(storeTestRoot, { recursive: true, force: true });
});
function setup(base = tmpdir()) {
  const directory = mkdtempSync(join(base, 'nexalvo-stock-c1-store-synthetic-')); chmodSync(directory, 0o700);
  const fixture = { item: { id: F.item, business_id: STOCK_ACTORS.A.business, name: F.name, active: true,
    supplier_id: null, unit: 'unit', notes: 'SYNTHETIC_METADATA' },
    locations: [[F.source, F.sourceName], [F.target, F.targetName]].map(([id, name]) => ({ id, name, active: true, business_id: STOCK_ACTORS.A.business })),
    stocks: [F.source, F.target].map(location_id => ({ id: randomUUID(), location_id, inventory_item_id: F.item, qty: 2, avg_cost_per_unit: 0.1 })),
    recipes: [], purchaseLines: [], transactions: [], waste: [] };
  const parent = makeC1State(fixture, [], 'a'.repeat(40), 'b'.repeat(64), { at: Date.now() - 120000, until: Date.now() - 60000 });
  parent.startedAt = new Date(Date.now() - 120000).toISOString(); parent.phase = 'PROBES_CONFIRMED';
  parent.probes = [{ actor: 'B', status: 'DENIED' }, { actor: 'anon', status: 'DENIED' }];
  C1_CHECKS.slice(0, 8).forEach(name => { parent.checks[name] = 'PASS'; });
  const parentFile = join(directory, 'stock-recovery.json'), parentBytes = Buffer.from(sealC1Checkpoint(parent));
  writeFileSync(parentFile, parentBytes, { mode: 0o600 });
  const parentSha256 = hash(parentBytes), registry = c1ChildRegistryPath();
  const options = { parentFile, parentSha256, env: { QA_C1_CHILD_EXECUTION_AUTHORIZED: C1_CHILD_AUTHORIZATION } };
  const child = () => {
    const state = makeC1State(structuredClone(fixture), [], 'c'.repeat(40), 'e'.repeat(64), { at: Date.now() - 1000, until: Date.now() + 60000 });
    state.phase = 'CHILD_RESERVED'; C1_CHECKS.slice(0, 8).forEach(name => { state.checks[name] = 'PASS'; }); return state;
  };
  const registryFiles = () => existsSync(registry) ? readdirSync(registry).filter(name => name.startsWith(parentSha256)).sort() : [];
  const cleanup = () => {
    // Only synthetic files for this unique generated parent hash. Never remove a shared registry or any other record.
    if (existsSync(registry)) for (const name of registryFiles()) rmSync(join(registry, name), { force: true });
    rmSync(directory, { recursive: true, force: true });
  };
  return { directory, fixture, parent, parentFile, parentBytes, parentSha256, options, child, registryFiles, cleanup };
}
function codeIs(code) { return error => { assert.equal(error.code, code); assert.equal(error.message, code); return true; }; }
function beginMovement(state) { state.operations.push({ name: 'COUNT', status: 'DISPATCHED', auditAttempted: false }); state.pending = 'MOVEMENT'; }
function confirmMovement(state) { Object.assign(state.operations.at(-1), { status: 'CONFIRMED', rows: [{ id: randomUUID(), qty_change: 0.125 }] }); state.confirmed++; state.pending = null; }

const workerScript = `import {readFileSync,mkdirSync,chmodSync} from 'node:fs';
import {openC1ChildStore} from ${JSON.stringify(moduleUrl)};
const input=JSON.parse(readFileSync(0,'utf8'));
try {
 if(input.unsafeRegistry){mkdirSync(input.registry);chmodSync(input.registry,0o755);}
 const store=openC1ChildStore(input.options);
 if(input.unsafeRegistry){store.assertUnreserved();}
 else{store.reserve(input.state,input.securityHash);}
 if(input.crash){process.exit(91);}
 console.log(JSON.stringify({status:'RESERVED'}));
}catch(error){console.log(JSON.stringify({status:'BLOCKED',code:/^C1_[A-Z0-9_]+$/.test(error.code||'')?error.code:'SAFE_WORKER_FAILURE'}));}`;
function worker(input, { crash = false, temp = tmpdir() } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', workerScript], {
      env: { PATH: process.env.PATH, TMPDIR: temp, TEMP: temp, TMP: temp, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) },
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    let output = '', stderr = '';
    child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
    child.on('error', reject); child.on('exit', exitCode => {
      try { assert.equal(stderr, ''); if (crash) { assert.equal(exitCode, 91); resolve({ status: 'CRASHED' }); }
        else { assert.equal(exitCode, 0); resolve(JSON.parse(output)); } } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

test('C1 child open and unreserved preflight are strictly read-only and preserve parent bytes and metadata', () => {
  const f = setup();
  try {
    const before = f.registryFiles(), store = openC1ChildStore(f.options);
    assert.equal(store.assertUnreserved(), true); assert.equal(store.assertParentUnchanged(), true); store.close();
    assert.deepEqual(f.registryFiles(), before); assert.ok(readFileSync(f.parentFile).equals(f.parentBytes));
    assert.equal(store.parentHash, f.parentSha256); assert.equal(store.parentState.phase, 'PROBES_CONFIRMED');
    assert.equal(Object.isFrozen(store.parentState.fixture), true);
    store.parentBytes.fill(0); assert.equal(store.assertParentUnchanged(), true);
  } finally { f.cleanup(); }
});
test('C1 child reservation requires new explicit authorization without creating any record', () => {
  const f = setup();
  try {
    const store = openC1ChildStore({ ...f.options, env: {} });
    assert.throws(() => store.reserve(f.child(), securityHash), codeIs('C1_CHILD_EXECUTION_AUTHORIZATION_REQUIRED'));
    assert.deepEqual(f.registryFiles(), []); assert.ok(readFileSync(f.parentFile).equals(f.parentBytes));
  } finally { f.cleanup(); }
});
test('C1 child normalizes Windows uppercase parent/security hashes into one reservation and creates no repeated probe receipts', () => {
  const f = setup();
  try {
    const state = f.child(), store = openC1ChildStore({ ...f.options, parentSha256: f.parentSha256.toUpperCase() });
    store.reserve(state, securityHash.toUpperCase());
    const read = store.load(); assert.equal(read.lineage.parent_hash, f.parentSha256); assert.equal(read.lineage.security_hash, securityHash);
    assert.equal(read.state.runId, state.runId); assert.notEqual(read.state.runId, f.parent.runId); assert.deepEqual(read.state.probes, []);
    assert.equal(read.lineage.source_sha, state.sourceSha); assert.equal(read.lineage.catalog_hash, state.catalogHash);
    assert.throws(() => store.assertUnreserved(), codeIs('C1_CHILD_ALREADY_RESERVED_NO_REPLAY'));
    assert.throws(() => store.reserve(f.child(), securityHash), codeIs('C1_CHILD_SINGLE_RESERVATION_REQUIRED'));
    assert.ok(readFileSync(f.parentFile).equals(f.parentBytes));
  } finally { f.cleanup(); }
});
test('C1 child reservation races across processes admit exactly one child and block every competing executor', async () => {
  const f = setup();
  try {
    const payload = { options: f.options, state: f.child(), securityHash };
    const results = await Promise.all(Array.from({ length: 6 }, () => worker(payload)));
    assert.equal(results.filter(r => r.status === 'RESERVED').length, 1);
    assert.equal(results.filter(r => r.code === 'C1_CHILD_ALREADY_RESERVED_NO_REPLAY').length, 5);
    assert.equal(f.registryFiles().length, 2); assert.ok(readFileSync(f.parentFile).equals(f.parentBytes));
    const restarted = openC1ChildStore(f.options); assert.throws(() => restarted.assertUnreserved(), codeIs('C1_CHILD_ALREADY_RESERVED_NO_REPLAY'));
    assert.throws(() => restarted.save('SNAPSHOT'), codeIs('C1_CHILD_WRITABLE_HANDLE_REQUIRED'));
  } finally { f.cleanup(); }
});
test('C1 child process crash after reservation leaves a permanent claim and restart is recovery-only', async () => {
  const f = setup();
  try {
    await worker({ options: f.options, state: f.child(), securityHash, crash: true }, { crash: true });
    const store = openC1ChildStore(f.options);
    assert.throws(() => store.reserve(f.child(), securityHash), codeIs('C1_CHILD_ALREADY_RESERVED_NO_REPLAY'));
    const before = f.registryFiles().map(name => [name, readFileSync(join(c1ChildRegistryPath(), name))]);
    assert.equal(store.load().state.confirmed, 0); assert.throws(() => store.save('SNAPSHOT'), codeIs('C1_CHILD_WRITABLE_HANDLE_REQUIRED'));
    for (const [name, bytes] of before) assert.ok(readFileSync(join(c1ChildRegistryPath(), name)).equals(bytes));
    assert.ok(readFileSync(f.parentFile).equals(f.parentBytes));
  } finally { f.cleanup(); }
});
test('C1 child incomplete reservation without a child never becomes permission to recreate or retry', () => {
  const f = setup();
  try {
    const store = openC1ChildStore(f.options); if (!existsSync(c1ChildRegistryPath())) mkdirSync(c1ChildRegistryPath(), { mode: 0o700 });
    writeFileSync(store.reservationFile, '{"partial":"SYNTHETIC_CRASH"}', { mode: 0o600, flag: 'wx' });
    const before = readFileSync(store.reservationFile);
    assert.throws(() => store.assertUnreserved(), codeIs('C1_CHILD_ALREADY_RESERVED_NO_REPLAY'));
    assert.throws(() => store.reserve(f.child(), securityHash), codeIs('C1_CHILD_ALREADY_RESERVED_NO_REPLAY'));
    assert.throws(() => store.load()); assert.ok(readFileSync(store.reservationFile).equals(before));
  } finally { f.cleanup(); }
});
test('C1 child saves durable movement and audit intentions before allowing their confirmed receipts', () => {
  const f = setup();
  try {
    const store = openC1ChildStore(f.options), state = f.child(); store.reserve(state, securityHash);
    beginMovement(state); store.save('MOVEMENT_PENDING');
    let loaded = store.load(); assert.equal(loaded.state.pending, 'MOVEMENT'); assert.equal(loaded.state.operations[0].status, 'DISPATCHED');
    confirmMovement(state); store.save('MOVEMENT_CONFIRMED');
    state.operations[0].auditAttempted = true; state.pending = 'AUDIT'; store.save('AUDIT_PENDING');
    loaded = store.load(); assert.equal(loaded.state.pending, 'AUDIT'); assert.equal(loaded.state.operations[0].auditAttempted, true);
    state.operations[0].auditRow = { id: randomUUID(), action: 'Client: Stock Adjusted', details: 'SYNTHETIC_AUDIT' }; state.pending = null;
    store.save('AUDIT_CONFIRMED'); state.checks.ui_adjustment = 'PASS'; store.save('UI_CONFIRMED');
    loaded = store.load(); assert.equal(loaded.state.confirmed, 1); assert.equal(loaded.state.operations[0].auditRow.action, 'Client: Stock Adjusted');
    assert.ok(readFileSync(f.parentFile).equals(f.parentBytes));
  } finally { f.cleanup(); }
});
for (const pending of ['MOVEMENT', 'AUDIT']) test(`C1 child cannot clear unknown ${pending} intent or erase its evidence`, () => {
  const f = setup();
  try {
    const store = openC1ChildStore(f.options), state = f.child(); store.reserve(state, securityHash); beginMovement(state); store.save('MOVEMENT_PENDING');
    if (pending === 'AUDIT') { confirmMovement(state); store.save('MOVEMENT_CONFIRMED'); state.operations[0].auditAttempted = true; state.pending = 'AUDIT'; store.save('AUDIT_PENDING'); }
    const before = readFileSync(store.childFile); state.pending = null;
    if (pending === 'MOVEMENT') state.operations = [];
    assert.throws(() => store.save('UI_CONFIRMED'), codeIs(pending === 'MOVEMENT' ? 'C1_CHILD_RECEIPT_CHANGED' : 'C1_CHILD_UNKNOWN_INTENT_FORBIDDEN'));
    assert.ok(readFileSync(store.childFile).equals(before)); assert.equal(store.load().state.pending, pending);
  } finally { f.cleanup(); }
});
test('C1 child cannot rewind confirmed operations change a receipt or start another movement before its audit', () => {
  for (const mutation of ['rewind', 'receipt', 'premature-next']) {
    const f = setup();
    try {
      const store = openC1ChildStore(f.options), state = f.child(); store.reserve(state, securityHash);
      beginMovement(state); store.save('MOVEMENT_PENDING'); confirmMovement(state); store.save('MOVEMENT_CONFIRMED'); const before = readFileSync(store.childFile);
      if (mutation === 'rewind') { state.confirmed = 0; state.operations = []; }
      if (mutation === 'receipt') state.operations[0].rows[0].qty_change = 99;
      if (mutation === 'premature-next') { state.operations.push({ name: 'TRANSFER', status: 'DISPATCHED', auditAttempted: false }); state.pending = 'MOVEMENT'; }
      assert.throws(() => store.save(mutation === 'premature-next' ? 'MOVEMENT_PENDING' : 'UI_CONFIRMED'));
      assert.ok(readFileSync(store.childFile).equals(before));
    } finally { f.cleanup(); }
  }
});
test('C1 child source catalog window new run ID and baseline are immutable lineage', () => {
  for (const mutation of ['source', 'catalog', 'window', 'run', 'fixture', 'audit']) {
    const f = setup();
    try {
      const store = openC1ChildStore(f.options), state = f.child(); store.reserve(state, securityHash); const before = readFileSync(store.childFile);
      if (mutation === 'source') state.sourceSha = 'f'.repeat(40);
      if (mutation === 'catalog') state.catalogHash = 'f'.repeat(64);
      if (mutation === 'window') state.window.until++;
      if (mutation === 'run') state.runId = randomUUID();
      if (mutation === 'fixture') state.fixture.item.notes = 'CHANGED';
      if (mutation === 'audit') state.audit.push({ id: randomUUID(), details: 'CHANGED' });
      assert.throws(() => store.save('UI_CONFIRMED')); assert.ok(readFileSync(store.childFile).equals(before));
    } finally { f.cleanup(); }
  }
});
test('C1 child rejects old run IDs repeated probes expired windows and invented UI acceptance before reservation', () => {
  for (const mutation of ['run', 'probe', 'window', 'ui']) {
    const f = setup();
    try {
      const store = openC1ChildStore(f.options), state = f.child();
      if (mutation === 'run') state.runId = f.parent.runId;
      if (mutation === 'probe') state.probes = structuredClone(f.parent.probes);
      if (mutation === 'window') state.window = { at: Date.now() - 60000, until: Date.now() - 1 };
      if (mutation === 'ui') state.checks.ui_adjustment = 'PASS';
      assert.throws(() => store.reserve(state, securityHash)); assert.deepEqual(f.registryFiles(), []);
    } finally { f.cleanup(); }
  }
});
test('C1 child refuses malformed parent hashes phases pending probes and missing original gates before reserving', () => {
  const f = setup();
  try {
    assert.throws(() => openC1ChildStore({ ...f.options, parentSha256: 'a'.repeat(64) }), codeIs('C1_CHILD_ORIGINAL_HASH_MISMATCH'));
    for (const mutation of ['phase', 'pending', 'probe', 'gate']) {
      const parent = structuredClone(f.parent);
      if (mutation === 'phase') parent.phase = 'RESTORED';
      if (mutation === 'pending') parent.pending = 'PROBE_B';
      if (mutation === 'probe') parent.probes[0].status = 'DISPATCHED';
      if (mutation === 'gate') parent.checks.permissions = 'BLOCKED';
      const bytes = Buffer.from(sealC1Checkpoint(parent)); writeFileSync(f.parentFile, bytes);
      assert.throws(() => openC1ChildStore({ ...f.options, parentSha256: hash(bytes) }));
    }
    assert.deepEqual(f.registryFiles(), []);
  } finally { f.cleanup(); }
});
test('C1 child detects changed or replaced parent before saving and never writes a child afterward', () => {
  for (const replace of [false, true]) {
    const f = setup();
    try {
      const store = openC1ChildStore(f.options), state = f.child(); store.reserve(state, securityHash); const before = readFileSync(store.childFile);
      if (replace) { const old = f.parentFile + '.old'; renameSync(f.parentFile, old); writeFileSync(f.parentFile, f.parentBytes, { mode: 0o600 }); }
      else writeFileSync(f.parentFile, 'SYNTHETIC_CHANGED_PARENT');
      assert.throws(() => store.save('UI_CONFIRMED'), codeIs('C1_CHILD_PARENT_CHANGED')); assert.ok(readFileSync(store.childFile).equals(before));
    } finally { f.cleanup(); }
  }
});
test('C1 child rejects unsafe parent ownership permissions aliases and hard links without revealing private paths', () => {
  const f = setup();
  try {
    for (const bad of [join(f.directory, 'wrong.json'), join(process.cwd(), 'stock-recovery.json')])
      assert.throws(() => openC1ChildStore({ ...f.options, parentFile: bad }), codeIs('C1_CHILD_ORIGINAL_PATH_REQUIRED'));
    chmodSync(f.parentFile, 0o644);
    assert.throws(() => openC1ChildStore(f.options), codeIs('C1_CHILD_PRIVATE_PERMISSIONS_REQUIRED')); chmodSync(f.parentFile, 0o600);
    const real = f.parentFile + '.real'; renameSync(f.parentFile, real); symlinkSync(real, f.parentFile);
    assert.throws(() => openC1ChildStore(f.options), codeIs('C1_CHILD_LINK_FORBIDDEN')); rmSync(f.parentFile); renameSync(real, f.parentFile);
    linkSync(f.parentFile, f.parentFile + '.hardlink');
    assert.throws(() => openC1ChildStore(f.options), codeIs('C1_CHILD_HARDLINK_FORBIDDEN'));
  } finally { f.cleanup(); }
});
test('C1 child rejects a registry outside its fixed private TEMP location and a foreign existing directory ACL', async () => {
  const f = setup(); const sandbox = mkdtempSync(join(tmpdir(), 'nexalvo-child-store-sandbox-'));
  try {
    assert.throws(() => openC1ChildStore({ ...f.options, registryDir: f.directory }), codeIs('C1_CHILD_REGISTRY_PATH_REQUIRED'));
    const isolated = setup(sandbox);
    try {
      const result = await worker({ options: isolated.options, unsafeRegistry: true,
        registry: join(sandbox, 'nexalvo-stock-c1-child-registry') }, { temp: sandbox });
      assert.equal(result.status, 'BLOCKED'); assert.equal(result.code, 'C1_CHILD_PRIVATE_PERMISSIONS_REQUIRED');
      assert.ok(readFileSync(isolated.parentFile).equals(isolated.parentBytes));
    } finally { isolated.cleanup(); }
  } finally { f.cleanup(); rmSync(sandbox, { recursive: true, force: true }); }
});
test('C1 child recovery never accepts another filename tampered lineage or changes bytes on read', () => {
  const f = setup();
  try {
    const store = openC1ChildStore(f.options); store.reserve(f.child(), securityHash);
    assert.throws(() => store.load(store.childFile + '.different'), codeIs('C1_CHILD_RECOVERY_PATH_REQUIRED'));
    const before = readFileSync(store.childFile), reservation = readFileSync(store.reservationFile);
    store.load(); store.load(); assert.ok(readFileSync(store.childFile).equals(before)); assert.ok(readFileSync(store.reservationFile).equals(reservation));
    const envelope = JSON.parse(before); envelope.lineage.source_sha = 'f'.repeat(40); writeFileSync(store.childFile, JSON.stringify(envelope));
    assert.throws(() => store.load(), codeIs('C1_CHILD_CHECKSUM_MISMATCH'));
  } finally { f.cleanup(); }
});
test('C1 child abandoned next-file intent blocks saving rather than overwriting or removing crash evidence', () => {
  const f = setup();
  try {
    const store = openC1ChildStore(f.options), state = f.child(); store.reserve(state, securityHash);
    writeFileSync(store.childFile + '.next', 'SYNTHETIC_CRASH_NEXT', { mode: 0o600, flag: 'wx' }); const before = readFileSync(store.childFile);
    assert.throws(() => store.save('UI_CONFIRMED'), codeIs('C1_CHILD_ABANDONED_NEXT_REQUIRES_REVIEW'));
    assert.throws(() => store.load(), codeIs('C1_CHILD_ABANDONED_NEXT_REQUIRES_REVIEW'));
    assert.equal(readFileSync(store.childFile + '.next', 'utf8'), 'SYNTHETIC_CRASH_NEXT'); assert.ok(readFileSync(store.childFile).equals(before));
  } finally { f.cleanup(); }
});
test('C1 child unknown native exceptions and forged upstream codes are replaced with fixed sanitized errors', () => {
  const malicious = Object.defineProperty({}, 'parentFile', { get() { const error = Error('Bearer SYNTHETIC_PRIVATE person@example.invalid C:\\private'); error.code = 'C1_SYNTHETIC_PRIVATE'; throw error; } });
  assert.throws(() => openC1ChildStore(malicious), error => {
    assert.equal(error.code, 'C1_CHILD_STORE_OPEN_REJECTED');
    assert.equal(error.message, error.code); return true;
  });
  const f = setup();
  try { assert.throws(() => openC1ChildStore({ ...f.options, parentFile: join(f.directory, 'absent', 'stock-recovery.json') }), error => {
    assert.match(error.code, /^C1_[A-Z0-9_]+$/); assert.equal(error.message, error.code);
    assert.doesNotMatch(JSON.stringify({ code: error.code, message: error.message }), /Bearer|example\.invalid|SYNTHETIC_PRIVATE|[A-Za-z]:\\/); return true;
  }); } finally { f.cleanup(); }
});

test('C1 child parent permission changes remain blocked even when content hash is preserved', () => {
  const f = setup();
  try {
    const store = openC1ChildStore(f.options); chmodSync(f.parentFile, 0o400);
    assert.equal(hash(readFileSync(f.parentFile)), f.parentSha256);
    assert.throws(() => store.assertParentUnchanged(), codeIs('C1_CHILD_PARENT_CHANGED'));
  } finally { f.cleanup(); }
});

test('C1 child dangling reservation links count as a prior claim and never unlock another child', () => {
  const f = setup();
  try {
    const store = openC1ChildStore(f.options);
    if (!existsSync(c1ChildRegistryPath())) mkdirSync(c1ChildRegistryPath(), { mode: 0o700 });
    symlinkSync(join(f.directory, 'absent-target'), store.reservationFile);
    assert.throws(() => store.assertUnreserved(), codeIs('C1_CHILD_ALREADY_RESERVED_NO_REPLAY'));
    assert.throws(() => store.reserve(f.child(), securityHash), codeIs('C1_CHILD_ALREADY_RESERVED_NO_REPLAY'));
    assert.throws(() => store.load(), codeIs('C1_CHILD_LINK_FORBIDDEN'));
    assert.equal(existsSync(store.childFile), false);
  } finally { f.cleanup(); }
});

test('C1 child recomputed envelopes still cannot change the immutable reservation lineage', () => {
  const f = setup();
  try {
    const store = openC1ChildStore(f.options); store.reserve(f.child(), securityHash);
    const envelope = JSON.parse(readFileSync(store.childFile));
    envelope.state.catalogHash = 'f'.repeat(64);
    const { integrity, ...value } = envelope; envelope.integrity = hash(JSON.stringify(value));
    writeFileSync(store.childFile, JSON.stringify(envelope));
    assert.throws(() => store.load(), codeIs('C1_CHILD_LINEAGE_MISMATCH'));
    assert.ok(readFileSync(f.parentFile).equals(f.parentBytes));
  } finally { f.cleanup(); }
});

test('C1 child never persists an audit receipt with a movement confirmation before durable audit intent', () => {
  const f = setup();
  try {
    const store = openC1ChildStore(f.options), state = f.child(); store.reserve(state, securityHash);
    beginMovement(state); store.save('MOVEMENT_PENDING'); const before = readFileSync(store.childFile);
    confirmMovement(state); state.operations[0].auditAttempted = true; state.operations[0].auditRow = { id: randomUUID() };
    assert.throws(() => store.save('MOVEMENT_CONFIRMED'), codeIs('C1_CHILD_PHASE_INTENT_MISMATCH'));
    assert.ok(readFileSync(store.childFile).equals(before));
  } finally { f.cleanup(); }
});

test('C1 child pending intent cannot be relabeled as a successful UI phase', () => {
  const f = setup();
  try {
    const store = openC1ChildStore(f.options), state = f.child(); store.reserve(state, securityHash);
    beginMovement(state); store.save('MOVEMENT_PENDING'); const before = readFileSync(store.childFile);
    assert.throws(() => store.save('UI_CONFIRMED'), codeIs('C1_CHILD_PHASE_INTENT_MISMATCH'));
    assert.ok(readFileSync(store.childFile).equals(before));
  } finally { f.cleanup(); }
});

function withSyntheticWindowsAlias(fixture, linkedAncestor, body) {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const original = { lstatSync: fs.lstatSync, realpathSync: fs.realpathSync, openSync: fs.openSync };
  const canonicalRoot = fs.realpathSync(tmpdir()), aliasRoot = canonicalRoot + '-SHORT~1';
  const aliasFile = aliasRoot + fixture.parentFile.slice(canonicalRoot.length);
  const remap = path => typeof path === 'string' && (path === aliasRoot || path.startsWith(aliasRoot + '/'))
    ? canonicalRoot + path.slice(aliasRoot.length) : path;
  try {
    Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
    fs.realpathSync = (path, ...rest) => original.realpathSync(remap(path), ...rest);
    fs.openSync = (path, ...rest) => original.openSync(remap(path), ...rest);
    fs.lstatSync = (path, ...rest) => {
      const stat = original.lstatSync(remap(path), ...rest);
      const prohibited = linkedAncestor === 'root' ? aliasRoot : linkedAncestor === 'parent' ? dirname(aliasFile) : null;
      if (path !== prohibited) return stat;
      const linked = Object.create(stat); linked.isSymbolicLink = () => true; return linked;
    };
    syncBuiltinESMExports();
    body({ ...fixture.options, parentFile: aliasFile, env: { ...fixture.options.env,
      QA_STOCK_PRIVATE_DIRECTORY_ACL: 'CURRENT_USER_ONLY', QA_C1_CHILD_REGISTRY_ACL: 'CURRENT_USER_ONLY' } });
  } finally {
    Object.assign(fs, original); Object.defineProperty(process, 'platform', platform); syncBuiltinESMExports();
  }
}

test('SYNTHETIC Windows short TEMP spelling reaches its canonical root without climbing outside the private boundary', () => {
  const f = setup();
  try {
    const before = f.registryFiles();
    withSyntheticWindowsAlias(f, null, options => {
      const store = openC1ChildStore(options); assert.equal(store.assertParentUnchanged(), true);
      assert.equal(store.assertUnreserved(), true); store.close();
    });
    assert.deepEqual(f.registryFiles(), before); assert.ok(readFileSync(f.parentFile).equals(f.parentBytes));
  } finally { f.cleanup(); }
});

for (const ancestor of ['root', 'parent']) test(`SYNTHETIC Windows alias canonicalization never hides a forbidden ${ancestor} junction`, () => {
  const f = setup();
  try {
    withSyntheticWindowsAlias(f, ancestor, options => {
      assert.throws(() => openC1ChildStore(options), codeIs('C1_CHILD_LINK_FORBIDDEN'));
    });
    assert.ok(readFileSync(f.parentFile).equals(f.parentBytes)); assert.deepEqual(f.registryFiles(), []);
  } finally { f.cleanup(); }
});
