// Append-only fsync journal. Directory itself is the permanent, exclusive C2 reservation.
import { mkdirSync, lstatSync, readdirSync, openSync, closeSync, fstatSync, fsyncSync, writeFileSync, readFileSync, constants } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { C2, hash, same, need, validateC2Fixture } from './stock-c2-protocol.mjs';

export const c2Directory = () => join(tmpdir(), 'nexalvo-stock-c2-' + C2.item);
const secret = /Bearer\s|eyJ[A-Za-z0-9_-]{16,}\.|sb_secret_|-----BEGIN|@|[?&](?:token|access_token)=/i;
const transitions = { RESERVED: 'LOSS_INTENT', LOSS_INTENT: 'LOSS_CONFIRMED', LOSS_CONFIRMED: 'AUDIT_INTENT', AUDIT_INTENT: 'AUDIT_CONFIRMED', AUDIT_CONFIRMED: 'COMPLETE' };
function noLinks(path) {
  for (let p = resolve(path);;) {
    need(!lstatSync(p).isSymbolicLink(), 'JOURNAL_LINK_FORBIDDEN');
    const next = dirname(p); if (next === p) break; p = next;
  }
}
function privateDirectory(path, initialize = false) {
  noLinks(path); const stat = lstatSync(path);
  need(stat.isDirectory(), 'JOURNAL_DIRECTORY_REQUIRED');
  if (process.platform === 'win32') {
    const args = ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./stock-c2-private.ps1', import.meta.url)), '-Path', path];
    if (initialize) args.push('-Initialize');
    need(execFileSync('powershell.exe', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 10000 }).trim() === 'C2_PRIVATE_PASS', 'PRIVATE_ACL_REQUIRED');
  } else need(stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 'PRIVATE_MODE_REQUIRED');
}
function syncDirectory(path) {
  if (process.platform === 'win32') return; // Windows provides file fsync, not directory fsync.
  const fd = openSync(path, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); }
}
export function openC2Store() {
  const directory = c2Directory(); let expectedHash = null, bound = false;
  const exists = () => { try { lstatSync(directory); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
  const available = () => { need(!exists(), 'RESERVATION_CONSUMED_NO_REPLAY'); return true; };
  const load = (readonlyRecovery = false) => {
    privateDirectory(directory);
    const names = readdirSync(directory).sort(); need(names.length > 0 && names.length <= 7, 'JOURNAL_INCOMPLETE');
    let previous = null, result;
    for (const [index, name] of names.entries()) {
      need(name === `${index}.json`, 'JOURNAL_SEQUENCE_REQUIRED');
      const file = join(directory, name); noLinks(file);
      const fd = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)); let bytes;
      try {
        const stat = fstatSync(fd); need(stat.isFile() && stat.nlink === 1, 'JOURNAL_FILE_REQUIRED');
        if (process.platform !== 'win32') need(stat.uid === process.getuid() && (stat.mode & 0o077) === 0, 'PRIVATE_MODE_REQUIRED');
        bytes = readFileSync(fd, 'utf8');
      } finally { closeSync(fd); }
      need(!secret.test(bytes), 'JOURNAL_SECRET_FORBIDDEN');
      let entry, checksum;
      try { ({ checksum, ...entry } = JSON.parse(bytes)); }
      catch {
        // A torn final append is retained. Only recovery may use the verified prefix;
        // its hash binds the partial bytes too, and no writable handle is returned.
        need(readonlyRecovery && result && index === names.length - 1, 'JOURNAL_INCOMPLETE');
        return { ...result, partial_tail_retained: true, checksum: hash({ head: result.checksum, partial: bytes }) };
      }
      need(entry.scope === 'C2_ONLY' && entry.index === index && entry.previous === previous && checksum === hash(entry), 'JOURNAL_INTEGRITY_REQUIRED');
      validateC2Fixture(entry.state.baseline);
      if (result) {
        need(transitions[result.state.phase] === entry.state.phase, 'JOURNAL_TRANSITION_REQUIRED');
        for (const k of ['baseline', 'sourceSha', 'reviewHash', 'window', 'startedAt']) need(same(entry.state[k], result.state[k]), 'JOURNAL_LINEAGE_CHANGED');
        for (const k of ['intentAt', 'lossReceipt', 'movementReceipt', 'auditReceipt']) if (result.state[k] !== undefined) need(same(entry.state[k], result.state[k]), 'JOURNAL_RECEIPT_CHANGED');
      } else need(entry.state.phase === 'RESERVED', 'JOURNAL_RESERVATION_REQUIRED');
      previous = checksum; result = { state: entry.state, checksum, index };
    }
    return result;
  };
  const append = state => {
    privateDirectory(directory);
    const before = bound ? load() : null;
    need(bound ? before.checksum === expectedHash && transitions[before.state.phase] === state.phase : state.phase === 'RESERVED', 'JOURNAL_CHANGED_NO_REPLAY');
    if (before) for (const k of ['baseline', 'sourceSha', 'reviewHash', 'window', 'startedAt']) need(same(before.state[k], state[k]), 'JOURNAL_LINEAGE_CHANGED');
    if (before) for (const k of ['intentAt', 'lossReceipt', 'movementReceipt', 'auditReceipt']) if (before.state[k] !== undefined) need(same(before.state[k], state[k]), 'JOURNAL_RECEIPT_CHANGED');
    validateC2Fixture(state.baseline);
    const index = before ? before.index + 1 : 0;
    const entry = { scope: 'C2_ONLY', index, previous: before?.checksum || null, state: structuredClone(state) };
    const checksum = hash(entry), bytes = JSON.stringify({ ...entry, checksum });
    need(!secret.test(bytes), 'JOURNAL_SECRET_FORBIDDEN');
    const fd = openSync(join(directory, `${index}.json`), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    syncDirectory(directory); expectedHash = checksum; bound = true;
    need(load().checksum === checksum, 'JOURNAL_READBACK_REQUIRED'); return checksum;
  };
  return { available, load,
    reserve(state) { available(); noLinks(tmpdir()); mkdirSync(directory, { mode: 0o700 }); privateDirectory(directory, true); syncDirectory(tmpdir()); return append(state); },
    save(state) { need(bound, 'NO_RESUME_HANDLE'); return append(state); },
    assertCurrent() { need(bound && load().checksum === expectedHash, 'JOURNAL_CHANGED_NO_REPLAY'); },
  };
}
