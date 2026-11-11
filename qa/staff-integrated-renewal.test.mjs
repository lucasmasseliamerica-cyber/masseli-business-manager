import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ADDENDUM, CHECKPOINT, MANIFEST, sha256 } from './staff-integrated-business.mjs';
import { PROJECT } from './staff-integrated-auth.mjs';
import { assertReadyProcess, executionRecords, openJournal, runIntegratedStaff, verifyLaunchState, waitForResult } from './staff-integrated-run.mjs';

const closureName = 'staff-integrated-collection-expired-20261110.json';

function fixture() {
  const entries = new Map();
  const window = {
    project: PROJECT, manifest_sha256: MANIFEST, addendum_link_sha256: ADDENDUM, checkpoint_sha256: CHECKPOINT,
    no_other_staff_operations_or_TEST_DDL: true, Edge: 17, PATCH: 4,
    start_utc: '2026-11-10T20:36:00Z', cutoff_utc: '2026-11-10T21:11:00Z', end_utc: '2026-11-10T21:21:00Z',
  };
  const journal = {
    read: name => structuredClone(entries.get(name)),
    hash: name => sha256(JSON.stringify(entries.get(name))),
    names: () => [...entries.keys()], exists: name => entries.has(name),
    save(name, value) { assert(!entries.has(name)); entries.set(name, structuredClone(value)); },
  };
  const previous = {
    project: PROJECT, explicitly_authorized: true, stop_on_error_no_retry: true, no_account_changes: true, no_refresh: true,
    owner_mode: 'login', owner_additional_login: 1, owner_additional_admin_get: 1,
    manager_additional_login: 1, employee_additional_login: 0, manager_existing_admin_get: 1, employee_existing_admin_get: 1,
    accounting_sha256: 'a'.repeat(64), supplement_authorization_record_sha256: 'b'.repeat(64),
  };
  journal.save('staff-integrated-expired-window-20261110.json', window);
  previous.window_sha256 = journal.hash('staff-integrated-expired-window-20261110.json');
  journal.save('staff-integrated-expired-approval-20261110.json', previous);
  journal.save('staff-integrated-expired-admission-20261110.json', { initial_state_exact: true });
  journal.save('staff-integrated-launch-lock.json', { pid: 12345, window_sha256: previous.window_sha256 });
  journal.save('integrated-form-opened.json', { pid: 12345 });
  journal.save('integrated-execution-stopped.json', { pid: 12345, phase: 'COLLECTION', no_retry: true, utc: '2026-11-10T21:10:35.011Z' });
  const files = Object.fromEntries(journal.names().map(name => [name, journal.hash(name)]));
  journal.save(closureName, {
    project: PROJECT, phase: 'COLLECTION', forwarding_attempts: 0, process_ended: true,
    listener_closed: true, result_uncertain: false, files,
  });
  journal.save('staff-integrated-window.json', {
    ...window, start_utc: '2026-11-11T03:35:00Z', cutoff_utc: '2026-11-11T04:10:00Z', end_utc: '2026-11-11T04:20:00Z',
  });
  const approval = { ...previous, collection_closure_sha256: journal.hash(closureName) };
  return { entries, journal, approval };
}

test('one collection-only renewal preserves the original records and authorization scope', () => {
  const { journal, approval } = fixture();
  const before = Object.fromEntries(journal.names().map(name => [name, journal.hash(name)]));
  const records = verifyLaunchState(journal, approval, () => false);
  assert.equal(records.lock, 'staff-integrated-renewal-launch-lock.json');
  assert.equal(records.stopped, 'integrated-renewal-execution-stopped.json');
  assert.deepEqual(Object.fromEntries(journal.names().map(name => [name, journal.hash(name)])), before);
  assert.throws(() => verifyLaunchState(journal, { ...approval, manager_additional_login: 2 }, () => false), /COLLECTION_AUTH_SCOPE_CHANGED/);
  assert.throws(() => verifyLaunchState(journal, { ...approval, collection_closure_sha256: undefined }, () => false), /PRIOR_DISPATCH_OR_LOCK/);
});

test('an active process, changed evidence, uncertainty or a stale window blocks renewal', () => {
  const active = fixture();
  assert.throws(() => verifyLaunchState(active.journal, active.approval, () => true), /COLLECTION_PROCESS_NOT_CLOSED/);
  const changed = fixture();
  changed.entries.get('integrated-execution-stopped.json').phase = 'AUTH';
  assert.throws(() => verifyLaunchState(changed.journal, changed.approval, () => false), /COLLECTION_HISTORY_DRIFT/);
  const uncertain = fixture();
  uncertain.entries.get(closureName).result_uncertain = true;
  uncertain.approval.collection_closure_sha256 = uncertain.journal.hash(closureName);
  assert.throws(() => verifyLaunchState(uncertain.journal, uncertain.approval, () => false), /COLLECTION_CLOSURE_NOT_ELIGIBLE/);
  const expired = fixture();
  expired.entries.set('staff-integrated-window.json', expired.journal.read('staff-integrated-expired-window-20261110.json'));
  assert.throws(() => verifyLaunchState(expired.journal, expired.approval, () => false), /COLLECTION_WINDOW_NOT_RENEWED/);
});

test('any Auth or business trace and a second renewal lock block a new collection', () => {
  for (const name of [
    'integrated-auth-OWNER_A-admin-attempt.json', 'integrated-auth-MANAGER-login.intent.json',
    'integrated-auth-EMPLOYEE-login.reserve.json', 'command-P1.json.tmp', 'P1-intent.json', 'P1-reservation.json',
    'reads-owner-expected.json', 'native-ready.json', 'STOP.json',
    'staff-integrated-renewal-launch-lock.json', 'integrated-renewal-execution-stopped.json',
  ]) {
    const { journal, approval } = fixture();
    journal.save(name, {});
    assert.throws(() => verifyLaunchState(journal, approval, () => false), /PRIOR_DISPATCH_OR_LOCK/, name);
  }
});

test('collection failure writes an exclusive renewal stop without altering the historical stop', async () => {
  const { journal, approval } = fixture();
  const original = journal.hash('integrated-execution-stopped.json');
  const records = executionRecords(approval);
  let sends = 0;
  const now = Date.now();
  const result = await runIntegratedStaff({
    journal, plan: {}, core: {}, window: { start: now - 1000, cutoff: now + 60000, end: now + 660000 },
    ownerMode: 'login', publicKey: 'synthetic', verify() {}, records,
    collect: async () => { throw new Error('synthetic collection deadline'); },
    authRequest: async () => { sends++; }, businessRequest: async () => { sends++; },
  });
  assert.equal(result.passed, false);
  assert.equal(result.phase, 'COLLECTION');
  assert.equal(sends, 0);
  assert.equal(journal.hash('integrated-execution-stopped.json'), original);
  assert.equal(journal.read(records.stopped).phase, 'COLLECTION');
  assert.throws(() => journal.save(records.stopped, {}));
});

test('the controller waits past the historical stop and accepts only the current process and window', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staff-integrated-renewal-'));
  t.after(() => {
    assert.equal(path.dirname(dir), os.tmpdir());
    assert(path.basename(dir).startsWith('staff-integrated-renewal-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const journal = openJournal(dir);
  const records = executionRecords({ collection_closure_sha256: 'a'.repeat(64) });
  journal.save('staff-integrated-window.json', { synthetic_window: 1 });
  journal.save('integrated-execution-stopped.json', { phase: 'COLLECTION' });
  const waiting = waitForResult(journal, records, 'reads-owner-result.json', Date.now() + 2000);
  setTimeout(() => journal.save('reads-owner-result.json', { mode: 'reads', results: [] }), 50);
  assert.equal(await waiting, true);
  journal.save('native-ready.json', { same_process_auth_and_executor: true, pid: 12346 });
  journal.save(records.lock, { pid: 12345, window_sha256: journal.hash('staff-integrated-window.json') });
  assert.throws(() => assertReadyProcess(journal, records), /NATIVE_READY_REQUIRED/);
  assert.throws(() => journal.save(records.lock, {}), /EEXIST/);
  journal.save(records.stopped, { phase: 'COLLECTION' });
  assert.equal(await waitForResult(journal, records, 'missing-result.json', Date.now() + 2000), false);
});
