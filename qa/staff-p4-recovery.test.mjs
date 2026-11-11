import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTORS } from './staff-integrated-auth.mjs';
import { sha256 } from './staff-integrated-business.mjs';
import { compareCheckpointState, sendRecoveryAction, verifyRestorationStep } from './staff-p4-recovery.mjs';
import { collectOwnerToken } from './staff-p4-owner-input.mjs';

const t0 = '2026-11-11T19:37:31.197199+00:00';
const t1 = '2026-11-11T19:37:31.197200Z';
const action = {
  id: 'R1', method: 'POST', path: '/functions/v1/manage-staff-user', target_id: 'staff-target',
  business_id: 'fixture-business', body_from_original_plan: { role: 'EMPLOYEE' },
  expected_audits: 1, expected_restored_semantic_md5_excluding_updated_at: 'baseline-digest',
};

function checkpoints() {
  const staff = { id: action.target_id, business_id: action.business_id, updated_at: t0,
    active: true, semantic_md5_excluding_updated_at: 'active-digest' };
  const before = { observed_utc: new Date().toISOString(), competing_staff_relation_locks: 0,
    profiles: [staff], employees: [{ id: 'canary' }], staff_audits: [{ id: 'old-audit', occurred_at: t0 }] };
  const restored = { ...staff, active: false, semantic_md5_excluding_updated_at: 'baseline-digest' };
  const original = { ...before, profiles: [restored] };
  const after = { ...before, profiles: [{ ...restored, updated_at: t1 }], staff_audits: [...before.staff_audits, {
    id: 'new-audit', occurred_at: t1, user_id: ACTORS.OWNER_A, business_id: action.business_id,
    role_snapshot: 'OWNER', action: 'Staff User Updated', details: 'staff-target · EMPLOYEE · active=false',
  }] };
  return { before, original, after };
}

test('checkpoint comparison permits equivalent offsets and rejects microsecond drift', () => {
  const { before } = checkpoints();
  const same = structuredClone(before);
  same.profiles[0].updated_at = '2026-11-11T14:37:31.197199-05:00';
  compareCheckpointState(same, before);
  same.profiles[0].updated_at = t1;
  assert.throws(() => compareCheckpointState(same, before), /CHECKPOINT_STATE_DRIFT/);
});

test('recovery verifies original fields, advances updated_at and preserves both audit sets', () => {
  const { before, original, after } = checkpoints();
  verifyRestorationStep(action, before, after, original);
  assert.throws(() => verifyRestorationStep(action, before, { ...after, employees: [{ id: 'other' }] }, original), /UNRELATED_ROW_DRIFT/);
  assert.throws(() => verifyRestorationStep(action, before, { ...after, staff_audits: after.staff_audits.slice(1) }, original), /EXISTING_AUDIT_DRIFT/);
  after.profiles[0].updated_at = t0;
  assert.throws(() => verifyRestorationStep(action, before, after, original), /UPDATE_TIME_NOT_ADVANCED/);
});

function mockAction() {
  const { before } = checkpoints();
  const files = new Map([['R1-before.json', before]]);
  const journal = {
    read: name => structuredClone(files.get(name)), hash: name => sha256(JSON.stringify(files.get(name))),
    save(name, value) { assert(!files.has(name), 'JOURNAL_REPLAY'); files.set(name, structuredClone(value)); },
  };
  const window = { start: Date.now() - 1_000, end: Date.now() + 120_000 };
  return { files, params: { action, before, journal, window, key: 'synthetic', token: 'synthetic' } };
}

test('a reserved attempt with a transport failure is uncertain and cannot be sent twice', async () => {
  const { files, params } = mockAction();
  let sends = 0;
  const request = async () => {
    assert(files.has('R1-intent.json') && files.has('R1-reservation.json'));
    sends++;
    throw Error('synthetic transport failure');
  };
  await assert.rejects(sendRecoveryAction({ ...params, gate() {}, request }), /RECOVERY_RECEIPT_NOT_PASS/);
  assert.equal(files.get('R1-result.json').uncertain, true);
  await assert.rejects(sendRecoveryAction({ ...params, gate() {}, request }), /JOURNAL_REPLAY/);
  assert.equal(sends, 1);
});

test('a gate that closes after reservation forwards zero requests', async () => {
  const { files, params } = mockAction();
  let gates = 0;
  let sends = 0;
  await assert.rejects(sendRecoveryAction({ ...params, gate() { assert(++gates < 2); }, request: async () => { sends++; } }), /RECOVERY_RECEIPT_NOT_PASS/);
  assert.equal(files.get('R1-result.json').forwarding_attempts, 0);
  assert.equal(sends, 0);
});

test('PATCH binds the exact company, target and prior updated_at, then checks the returned ID', async () => {
  const { files, params } = mockAction();
  const patch = { ...action, id: 'R3', method: 'PATCH', path: '/rest/v1/employees', target_id: 'canary',
    body_from_original_plan: { active: false, job_title: null, updated_at: 'UTC_GENERATED_ONCE_AT_ADMISSION' } };
  const before = { ...params.before, employees: [{ id: 'canary', business_id: patch.business_id, active: true, updated_at: t0 }] };
  files.set('R3-before.json', before);
  const result = await sendRecoveryAction({ ...params, action: patch, before, gate() {}, request: async (url, options) => {
    const target = new URL(url);
    assert.equal(target.pathname, '/rest/v1/employees');
    assert.equal(target.searchParams.get('id'), 'eq.canary');
    assert.equal(target.searchParams.get('business_id'), 'eq.fixture-business');
    assert.equal(target.searchParams.get('updated_at'), 'eq.' + t0);
    assert.equal(options.method, 'PATCH');
    const body = JSON.parse(options.body);
    assert.equal(body.active, false);
    assert.equal(body.job_title, null);
    assert(Number.isFinite(Date.parse(body.updated_at)));
    return { status: 200, json: async () => [{ id: 'canary' }] };
  } });
  assert.equal(result.passed, true);
});

test('one masked loopback field accepts a single synthetic token from its own origin', async () => {
  let open;
  const urlReady = new Promise(resolve => { open = resolve; });
  const received = collectOwnerToken({ deadline: Date.now() + 5_000, onReady: open });
  const url = await urlReady;
  const page = await fetch(url);
  const html = await page.text();
  assert.equal((html.match(/type="password"/g) ?? []).length, 1);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const token = 'synthetic.parts.only';
  const forbidden = await fetch(url, { method: 'POST', headers: { Origin: 'http://unrelated.test' }, body: token });
  assert.equal(forbidden.status, 403);
  const response = await fetch(url, { method: 'POST', headers: { Origin: new URL(url).origin }, body: token });
  assert.equal(response.status, 204);
  assert.equal(await received, token);
});
