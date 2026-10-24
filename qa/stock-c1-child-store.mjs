// Local durable lineage only. No network, Auth, stock operation, cleanup or resume API.
import { constants, openSync, closeSync, readFileSync, writeFileSync, fsyncSync, fstatSync,
  lstatSync, realpathSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve, dirname, basename, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { StockSignal, requireStock, stockHash } from './stock-journey-core.mjs';
import { validateC1State, unsealC1Checkpoint, C1_CHECKS } from './stock-c1-protocol.mjs';

export const C1_CHILD_AUTHORIZATION = 'TEST_ONLY_EXPLICIT_C1_CHILD_20261023';
export const c1ChildRegistryPath = () => join(tmpdir(), 'nexalvo-stock-c1-child-registry');
const entryExists = path => { try { lstatSync(path); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; } };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const same = (a, b) => canonical(a) === canonical(b);
const copy = value => JSON.parse(JSON.stringify(value));
const phases = new Set(['SNAPSHOT', 'CHILD_RESERVED', 'MOVEMENT_PENDING', 'MOVEMENT_CONFIRMED',
  'AUDIT_PENDING', 'AUDIT_CONFIRMED', 'UI_CONFIRMED', 'RESTORED']);
const secret = /Bearer\s|eyJ[A-Za-z0-9_-]{16,}\.|sb_secret_|@|-----BEGIN|[?&](?:token|access_token)=/i;
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function fixed(code, body) { try { return body(); } catch (error) { if (error instanceof StockSignal && typeof error.code === 'string' && /^C1_[A-Z0-9_]{1,90}$/.test(error.code)) throw error; requireStock(false, code); } }
function noLinks(path, stop) {
  let current = resolve(path);
  while (true) {
    requireStock(!lstatSync(current).isSymbolicLink(), 'C1_CHILD_LINK_FORBIDDEN');
    // Windows TEMP can use an 8.3 spelling while realpath returns the long form.
    // Check each raw ancestor for reparse/link traversal BEFORE canonicalizing it;
    // canonicalizing the full input first would hide a forbidden junction.
    const boundary = process.platform === 'win32' ? realpathSync(current).toLowerCase() : current;
    if (boundary === (process.platform === 'win32' ? stop.toLowerCase() : stop)) return;
    const next = dirname(current); requireStock(next !== current, 'C1_CHILD_PRIVATE_TEMP_REQUIRED'); current = next;
  }
}
function owned(stat, directory) {
  requireStock(directory ? stat.isDirectory() : stat.isFile(), 'C1_CHILD_PRIVATE_TYPE_REQUIRED');
  if (!directory) requireStock(stat.nlink === 1, 'C1_CHILD_HARDLINK_FORBIDDEN');
  if (process.platform !== 'win32') requireStock(stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 'C1_CHILD_PRIVATE_PERMISSIONS_REQUIRED');
}
function readPrivate(file) {
  requireStock(!lstatSync(file).isSymbolicLink(), 'C1_CHILD_LINK_FORBIDDEN');
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try { const stat = fstatSync(fd); owned(stat, false); return { bytes: readFileSync(fd), stat }; }
  finally { closeSync(fd); }
}
function durableFile(file, bytes) {
  const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
function durableDirectory(directory) {
  // Windows does not expose fsync of directories; file fsync + exclusive private files remain mandatory.
  if (process.platform === 'win32') return;
  const fd = openSync(directory, constants.O_RDONLY | (constants.O_DIRECTORY || 0));
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function parentEligible(parent) {
  requireStock(Number.isFinite(Date.parse(parent.startedAt)) && Date.parse(parent.startedAt) <= Date.now() + 60000, 'C1_CHILD_PARENT_TIME_REQUIRED');
  requireStock(parent.phase === 'PROBES_CONFIRMED' && parent.pending === null && parent.confirmed === 0
    && parent.operations.length === 0, 'C1_CHILD_ZERO_OPERATION_PARENT_REQUIRED');
  requireStock(parent.probes.length === 2 && parent.probes.every((probe, i) => probe.actor === ['B', 'anon'][i]
    && probe.status === 'DENIED') && C1_CHECKS.slice(0, 8).every(name => parent.checks[name] === 'PASS'), 'C1_CHILD_PARENT_GATES_REQUIRED');
}
function validChild(state, parent) {
  validateC1State(state);
  requireStock(Number.isFinite(state.window?.at) && Number.isFinite(state.window?.until) && state.window.until > state.window.at
    && state.window.until - state.window.at <= 30 * 60000, 'C1_CHILD_WINDOW_REQUIRED');
  requireStock(phases.has(state.phase) && state.runId !== parent.runId && state.probes.length === 0
    && !String(state.pending).startsWith('PROBE_'), 'C1_CHILD_STATE_REQUIRED');
  requireStock((state.pending !== 'MOVEMENT' || state.phase === 'MOVEMENT_PENDING')
    && (state.pending !== 'AUDIT' || state.phase === 'AUDIT_PENDING')
    && (state.phase !== 'MOVEMENT_PENDING' || state.pending === 'MOVEMENT')
    && (state.phase !== 'AUDIT_PENDING' || state.pending === 'AUDIT'), 'C1_CHILD_PHASE_INTENT_MISMATCH');
  if (['SNAPSHOT', 'CHILD_RESERVED'].includes(state.phase)) requireStock(state.confirmed === 0 && state.pending === null
    && state.operations.length === 0, 'C1_CHILD_PHASE_INTENT_MISMATCH');
  if (state.phase === 'MOVEMENT_CONFIRMED') requireStock(state.pending === null && state.confirmed > 0
    && !state.operations.at(-1).auditAttempted && !state.operations.at(-1).auditRow, 'C1_CHILD_PHASE_INTENT_MISMATCH');
  if (state.phase === 'AUDIT_CONFIRMED') requireStock(state.pending === null && state.confirmed > 0
    && state.operations.at(-1).auditAttempted && state.operations.at(-1).auditRow, 'C1_CHILD_PHASE_INTENT_MISMATCH');
  requireStock(same(state.fixture, parent.fixture) && same(state.audit, parent.audit), 'C1_CHILD_ORIGINAL_BASELINE_REQUIRED');
  requireStock(Number.isFinite(Date.parse(state.startedAt)) && Date.parse(state.startedAt) >= Date.parse(parent.startedAt), 'C1_CHILD_START_TIME_REQUIRED');
}
function baseFor(parentHash, securityHash, state) {
  return { parent_hash: parentHash, security_hash: securityHash, child_run_id: state.runId,
    source_sha: state.sourceSha, catalog_hash: state.catalogHash, started_at: state.startedAt,
    window: copy(state.window), fixture_hash: sha256(canonical(state.fixture)), audit_hash: sha256(canonical(state.audit)) };
}
function encode(scope, body) {
  const value = { version: 1, scope, ...body };
  const text = JSON.stringify({ ...value, integrity: stockHash(value) });
  requireStock(!secret.test(text), 'C1_CHILD_SECRET_FORBIDDEN'); return text;
}
function decode(bytes, scope) {
  let envelope; try { envelope = JSON.parse(bytes.toString('utf8')); } catch { requireStock(false, 'C1_CHILD_ENVELOPE_INVALID'); }
  requireStock(envelope && envelope.version === 1 && envelope.scope === scope && typeof envelope.integrity === 'string', 'C1_CHILD_SCOPE_REQUIRED');
  const { integrity, ...value } = envelope;
  requireStock(integrity === stockHash(value) && !secret.test(bytes.toString('utf8')), 'C1_CHILD_CHECKSUM_MISMATCH'); return value;
}
function monotonic(before, after) {
  requireStock(after.confirmed >= before.confirmed && after.confirmed <= before.confirmed + 1, 'C1_CHILD_REWIND_FORBIDDEN');
  for (let i = 0; i < before.operations.length; i++) {
    const old = before.operations[i], next = after.operations[i];
    requireStock(next && old.name === next.name && (!old.auditAttempted || next.auditAttempted), 'C1_CHILD_RECEIPT_CHANGED');
    if (old.status === 'CONFIRMED') requireStock(next.status === 'CONFIRMED' && same(old.rows, next.rows), 'C1_CHILD_RECEIPT_CHANGED');
    if (old.auditRow) requireStock(same(old.auditRow, next.auditRow), 'C1_CHILD_RECEIPT_CHANGED');
  }
  for (const name of C1_CHECKS) requireStock(before.checks[name] !== 'PASS' || after.checks[name] === 'PASS', 'C1_CHILD_CHECK_REWIND_FORBIDDEN');
  if (before.pending === 'MOVEMENT') requireStock((after.pending === 'MOVEMENT' && after.confirmed === before.confirmed
    && same(before.operations, after.operations)) || (after.pending === null && after.confirmed === before.confirmed + 1
    && after.phase === 'MOVEMENT_CONFIRMED'), 'C1_CHILD_UNKNOWN_INTENT_FORBIDDEN');
  else if (before.pending === 'AUDIT') requireStock((after.pending === 'AUDIT' && after.confirmed === before.confirmed
    && same(before.operations, after.operations)) || (after.pending === null && after.confirmed === before.confirmed
    && after.operations.at(-1)?.auditRow && after.phase === 'AUDIT_CONFIRMED'), 'C1_CHILD_UNKNOWN_INTENT_FORBIDDEN');
  else if (after.pending === 'MOVEMENT') requireStock(after.confirmed === before.confirmed && after.phase === 'MOVEMENT_PENDING'
    && before.confirmed < 4 && before.operations.every(op => op.auditAttempted && op.auditRow), 'C1_CHILD_INTENT_ORDER_REQUIRED');
  else if (after.pending === 'AUDIT') requireStock(after.confirmed === before.confirmed && after.confirmed > 0
    && after.phase === 'AUDIT_PENDING' && !before.operations.at(-1).auditAttempted, 'C1_CHILD_INTENT_ORDER_REQUIRED');
  else requireStock(after.confirmed === before.confirmed && same(before.operations, after.operations), 'C1_CHILD_INTENT_ORDER_REQUIRED');
  if (after.phase === 'RESTORED') requireStock(after.confirmed === 4 && after.pending === null
    && after.operations.every(op => op.auditAttempted && op.auditRow), 'C1_CHILD_FINAL_RECEIPTS_REQUIRED');
}

export function openC1ChildStore(input = {}) {
  return fixed('C1_CHILD_STORE_OPEN_REJECTED', () => {
    const { parentFile, parentSha256: suppliedHash, registryDir = c1ChildRegistryPath(), env = process.env } = input;
    let parentSha256 = suppliedHash;
    requireStock(typeof parentFile === 'string' && hex(parentSha256), 'C1_CHILD_ORIGINAL_HASH_REQUIRED');
    parentSha256 = parentSha256.toLowerCase();
    const file = resolve(parentFile), directory = dirname(file), root = realpathSync(tmpdir());
    requireStock(basename(file) === 'stock-recovery.json' && basename(directory).startsWith('nexalvo-stock-c1-'), 'C1_CHILD_ORIGINAL_PATH_REQUIRED');
    const rel = relative(root, realpathSync(directory));
    requireStock(rel && !rel.startsWith('..') && !isAbsolute(rel), 'C1_CHILD_PRIVATE_TEMP_REQUIRED');
    noLinks(file, root); const directoryOpened = lstatSync(directory); owned(directoryOpened, true);
    if (process.platform === 'win32') requireStock(env.QA_STOCK_PRIVATE_DIRECTORY_ACL === 'CURRENT_USER_ONLY', 'C1_CHILD_PARENT_ACL_REQUIRED');
    const opened = readPrivate(file), original = Buffer.from(opened.bytes);
    requireStock(sha256(original) === parentSha256, 'C1_CHILD_ORIGINAL_HASH_MISMATCH');
    requireStock(!secret.test(original.toString('utf8')), 'C1_CHILD_SECRET_FORBIDDEN');
    const parent = unsealC1Checkpoint(original); parentEligible(parent); freeze(parent);
    const registry = resolve(registryDir);
    requireStock(registry === resolve(c1ChildRegistryPath()), 'C1_CHILD_REGISTRY_PATH_REQUIRED');
    const reservationFile = join(registry, `${parentSha256}.reservation.json`), childFile = join(registry, `${parentSha256}.child.json`);
    let boundState, boundLineage, lastChildHash;
    const assertParentUnchanged = () => fixed('C1_CHILD_PARENT_CHANGED', () => {
      noLinks(file, root); const currentDirectory = lstatSync(directory); owned(currentDirectory, true);
      const current = readPrivate(file);
      const metadata = ['dev', 'ino', 'uid', 'gid', 'mode', 'nlink', 'mtimeMs', 'ctimeMs'];
      const directoryMetadata = ['dev', 'ino', 'uid', 'gid', 'mode'];
      requireStock(metadata.every(key => current.stat[key] === opened.stat[key])
        && directoryMetadata.every(key => currentDirectory[key] === directoryOpened[key])
        && current.bytes.equals(original) && sha256(current.bytes) === parentSha256, 'C1_CHILD_PARENT_CHANGED');
      return true;
    });
    const guard = body => { assertParentUnchanged(); try { return body(); } finally { assertParentUnchanged(); } };
    const registryExists = () => {
      if (!entryExists(registry)) return false;
      noLinks(registry, root); owned(lstatSync(registry), true);
      if (process.platform === 'win32') requireStock(env.QA_C1_CHILD_REGISTRY_ACL === 'CURRENT_USER_ONLY', 'C1_CHILD_REGISTRY_ACL_REQUIRED');
      return true;
    };
    const assertUnreserved = () => guard(() => fixed('C1_CHILD_RESERVATION_REJECTED', () => {
      if (registryExists()) requireStock(![reservationFile, childFile, childFile + '.next'].some(entryExists), 'C1_CHILD_ALREADY_RESERVED_NO_REPLAY');
      return true;
    }));
    const readEnvelope = () => {
      requireStock(registryExists(), 'C1_CHILD_RESERVATION_REQUIRED');
      requireStock(!entryExists(childFile + '.next'), 'C1_CHILD_ABANDONED_NEXT_REQUIRES_REVIEW');
      const reservationRead = readPrivate(reservationFile), reservation = decode(reservationRead.bytes, 'C1_CHILD_RESERVATION');
      const childRead = readPrivate(childFile), child = decode(childRead.bytes, 'C1_CHILD_TEST_STOCK');
      requireStock(hex(reservation.lineage?.security_hash) && reservation.lineage.parent_hash === parentSha256
        && same(reservation.lineage, child.lineage), 'C1_CHILD_LINEAGE_MISMATCH');
      validChild(child.state, parent);
      requireStock(same(child.lineage, baseFor(parentSha256, child.lineage.security_hash, child.state)), 'C1_CHILD_LINEAGE_MISMATCH');
      return { state: child.state, lineage: child.lineage, childSha256: sha256(childRead.bytes) };
    };
    return {
      parentBytes: Buffer.from(original), parentState: parent, parentHash: parentSha256, reservationFile, childFile,
      assertParentUnchanged, assertUnreserved,
      reserve(state, securityHash) { return guard(() => fixed('C1_CHILD_RESERVATION_REJECTED', () => {
        requireStock(env.QA_C1_CHILD_EXECUTION_AUTHORIZED === C1_CHILD_AUTHORIZATION, 'C1_CHILD_EXECUTION_AUTHORIZATION_REQUIRED');
        requireStock(!boundState && hex(securityHash), 'C1_CHILD_SINGLE_RESERVATION_REQUIRED');
        securityHash = securityHash.toLowerCase();
        validChild(state, parent);
        requireStock(state.window.at <= Date.now() && Date.now() < state.window.until, 'C1_CHILD_WINDOW_REQUIRED');
        requireStock(C1_CHECKS.slice(8, -1).every(name => state.checks[name] === 'BLOCKED'), 'C1_CHILD_NEW_UI_EVIDENCE_REQUIRED');
        requireStock(state.confirmed === 0 && state.pending === null && state.operations.length === 0
          && ['SNAPSHOT', 'CHILD_RESERVED'].includes(state.phase), 'C1_CHILD_NEW_STATE_REQUIRED');
        const lineage = baseFor(parentSha256, securityHash, state);
        const reservationBytes = encode('C1_CHILD_RESERVATION', { lineage });
        const childBytes = encode('C1_CHILD_TEST_STOCK', { lineage, state });
        assertUnreserved();
        if (!registryExists()) {
          requireStock(process.platform !== 'win32', 'C1_CHILD_PRIVATE_REGISTRY_REQUIRED');
          try { mkdirSync(registry, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
        }
        requireStock(registryExists(), 'C1_CHILD_PRIVATE_REGISTRY_REQUIRED');
        // The durable claim is permanent even if creating the child subsequently fails.
        try { durableFile(reservationFile, reservationBytes); } catch (error) {
          if (error?.code === 'EEXIST') requireStock(false, 'C1_CHILD_ALREADY_RESERVED_NO_REPLAY'); throw error;
        }
        durableDirectory(registry); assertParentUnchanged();
        durableFile(childFile, childBytes); durableDirectory(registry);
        boundState = state; boundLineage = freeze(copy(lineage)); lastChildHash = sha256(childBytes);
        return { state, lineage: copy(lineage), childFile, reservationFile };
      })); },
      save(phase) { return guard(() => fixed('C1_CHILD_SAVE_REJECTED', () => {
        requireStock(boundState && phases.has(phase), 'C1_CHILD_WRITABLE_HANDLE_REQUIRED');
        requireStock(env.QA_C1_CHILD_EXECUTION_AUTHORIZED === C1_CHILD_AUTHORIZATION, 'C1_CHILD_EXECUTION_AUTHORIZATION_REQUIRED');
        const previous = readEnvelope();
        requireStock(previous.childSha256 === lastChildHash && same(previous.lineage, boundLineage), 'C1_CHILD_STATE_CHANGED');
        const next = { ...boundState, phase };
        validChild(next, parent);
        requireStock(same(baseFor(parentSha256, boundLineage.security_hash, next), boundLineage), 'C1_CHILD_LINEAGE_MISMATCH');
        monotonic(previous.state, next);
        const bytes = encode('C1_CHILD_TEST_STOCK', { lineage: boundLineage, state: next });
        durableFile(childFile + '.next', bytes); assertParentUnchanged();
        renameSync(childFile + '.next', childFile); durableDirectory(registry);
        boundState.phase = phase; lastChildHash = sha256(bytes); return lastChildHash;
      })); },
      load(requestedFile = childFile) { return guard(() => fixed('C1_CHILD_RECOVERY_REJECTED', () => {
        requireStock(typeof requestedFile === 'string' && resolve(requestedFile) === childFile, 'C1_CHILD_RECOVERY_PATH_REQUIRED');
        const loaded = readEnvelope(); return { state: freeze(copy(loaded.state)), lineage: freeze(copy(loaded.lineage)), childSha256: loaded.childSha256 };
      })); },
      close() { return assertParentUnchanged(); },
    };
  });
}
