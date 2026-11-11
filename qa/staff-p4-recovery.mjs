import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ACTORS, ORIGIN, PROJECT, publicKeyForTest } from './staff-integrated-auth.mjs';
import { ADDENDUM, CHECKPOINT, MANIFEST, requestTimeout, sha256 } from './staff-integrated-business.mjs';
import { openJournal } from './staff-integrated-run.mjs';
import { checkExistingOwner } from './staff-owner-session-readonly.mjs';
import { collectOwnerToken } from './staff-p4-owner-input.mjs';
import { parseStaffRequest, validStaffProfileReceipt } from '../supabase/functions/_shared/manage-staff-user-core.mjs';

const currentFile = fileURLToPath(import.meta.url);
const repo = path.resolve(path.dirname(currentFile), '..');
const controllerHash = 'e3159952733b2edd99f490dfb983d27b5668acec194c58344ccf2ea201a42776';
export const proposalHash = '7d85662d199fb402c487445643a8d6ca08ad2e4b525dcbc53b74003fad8c5cb7';
const bundleDir = 'outputs/staff-integrated-frontend-rebind-20261111';
const oldJournalDir = 'work/staff-user-service/business-run-20261107-0410';
export const recoveryJournalDir = 'work/staff-user-service/staff-p4-recovery-20261111';
const appOrigin = 'http://127.0.0.1:5173';
const ids = ['R1', 'R2', 'R3', 'R4'];
const groups = ['profiles', 'employees', 'staff_audits'];
const launcherFiles = [
  'qa/staff-p4-recovery.mjs', 'qa/staff-p4-owner-input.mjs', 'qa/staff-owner-session-readonly.mjs',
  'qa/staff-integrated-auth.mjs', 'qa/staff-integrated-business.mjs', 'qa/staff-integrated-run.mjs',
  'qa/staff-integrated-input.mjs', 'supabase/functions/_shared/manage-staff-user-core.mjs',
];
const hashFile = file => sha256(fs.readFileSync(file));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function exactInstant(value) {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  assert(match, 'CHECKPOINT_TIMESTAMP_INVALID');
  return new Date(match[1] + match[3]).toISOString().slice(0, 19) + '.' + (match[2] ?? '').padEnd(6, '0') + 'Z';
}

function comparable(row) {
  const copy = { ...row };
  for (const key of ['updated_at', 'occurred_at']) if (Object.hasOwn(copy, key)) copy[key] = exactInstant(copy[key]);
  return copy;
}

function indexed(rows) {
  assert(Array.isArray(rows));
  const byId = new Map(rows.map(row => [row.id, comparable(row)]));
  assert.equal(rows.length, byId.size, 'DUPLICATE_CHECKPOINT_ROW');
  return byId;
}

export function compareCheckpointState(actual, expected) {
  for (const group of groups) assert.deepEqual(indexed(actual[group]), indexed(expected[group]), 'CHECKPOINT_STATE_DRIFT');
}

function fresh(checkpoint) {
  const age = Date.now() - Date.parse(checkpoint.observed_utc);
  assert(age >= 0 && age < 45_000 && checkpoint.competing_staff_relation_locks === 0, 'CHECKPOINT_STALE_OR_NOT_QUIET');
}

function stateWithoutUpdateTime(row) {
  const { updated_at, ...state } = row;
  return state;
}

export function verifyRestorationStep(step, before, after, original) {
  const group = step.method === 'POST' ? 'profiles' : 'employees';
  for (const table of ['profiles', 'employees']) {
    const oldRows = indexed(before[table]);
    const newRows = indexed(after[table]);
    assert.equal(newRows.size, oldRows.size, 'ROW_COUNT_DRIFT');
    for (const [id, row] of oldRows) {
      const updated = newRows.get(id);
      if (table !== group || id !== step.target_id) {
        assert.deepEqual(updated, row, 'UNRELATED_ROW_DRIFT');
      } else {
        assert(updated && updated.updated_at > row.updated_at, 'UPDATE_TIME_NOT_ADVANCED');
        const baseline = original[group].find(item => item.id === id);
        assert.deepEqual(stateWithoutUpdateTime(updated), stateWithoutUpdateTime(baseline), 'RESTORED_FIELDS_DRIFT');
        assert.equal(updated.semantic_md5_excluding_updated_at, step.expected_restored_semantic_md5_excluding_updated_at);
      }
    }
  }
  const existing = indexed(before.staff_audits);
  const resulting = indexed(after.staff_audits);
  for (const [id, row] of existing) assert.deepEqual(resulting.get(id), row, 'EXISTING_AUDIT_DRIFT');
  const added = [...resulting.values()].filter(row => !existing.has(row.id));
  assert.equal(added.length, step.expected_audits, 'AUDIT_COUNT_DRIFT');
  if (added.length === 1) {
    const [audit] = added;
    assert(audit.business_id === step.business_id && audit.user_id === ACTORS.OWNER_A && audit.role_snapshot === 'OWNER' &&
      audit.action === 'Staff User Updated' && audit.details === `${step.target_id} · ${step.body_from_original_plan.role} · active=false`,
    'RECOVERY_AUDIT_DRIFT');
  }
}

export function loadRecoveryBundle(workspace) {
  const old = openJournal(path.join(workspace, oldJournalDir));
  const originalDir = path.join(workspace, 'outputs/staff-business-homologation-review-20261104');
  const file = path.join(workspace, bundleDir, 'proposta-recuperacao-P4.json');
  assert.equal(hashFile(file), proposalHash, 'PROPOSAL_DRIFT');
  assert.equal(hashFile(path.join(originalDir, 'manifesto.json')), MANIFEST);
  assert.equal(old.hash('accepted-addendum-link.json'), ADDENDUM);
  assert.equal(hashFile(path.join(repo, 'qa/sql/staff_business_checkpoint_readonly_TEST.sql')), CHECKPOINT);
  assert.equal(hashFile(path.join(repo, 'qa/staff-integrated-control.mjs')), controllerHash);
  const proposal = readJson(file);
  const planFile = path.join(originalDir, 'plano-operacoes.json');
  assert.equal(hashFile(planFile), proposal.original_plan_sha256);
  const plan = readJson(planFile);
  assert.equal(old.hash('staff-integrated-readmission-launch-lock.json'), proposal.stopped_attempt.lock_sha256);
  assert.equal(old.hash('STOP.json'), proposal.stopped_attempt.stop_sha256);
  assert.equal(old.hash('native-ended.json'), '01754b2f6407ec9e2da56a0f43ad84c41382b0c1f6198679909073abfcbfd0b0');
  const oldPid = old.read('staff-integrated-readmission-launch-lock.json').pid;
  assert.equal(old.read('native-ended.json').pid, oldPid);
  assert.throws(() => process.kill(oldPid, 0), { code: 'ESRCH' }, 'HISTORICAL_PROCESS_STILL_ACTIVE');
  assert.equal(old.hash('w1430-P1-before.json'), 'e80ae44237b877cc3fd56848be05233665fe5719c2b26767d7154bf32347894e');
  assert.equal(old.hash('w1430-P4-after.json'), 'ea09eff9db77e488877dbc805b29178a292d874b9012e68dce5d2ae6d57eda32');
  assert.equal(old.hash('w1430-final-readonly.json'), proposal.stopped_attempt.reconciled_checkpoint_sha256);
  const reservations = old.names().filter(name => /^[A-Z][0-9]+-reservation\.json$/.test(name)).sort();
  assert.deepEqual(reservations, ['P1', 'P2', 'P3', 'P4'].map(id => id + '-reservation.json'));
  const acknowledged = {
    P1: '77982046c7af57019b8b576a3680baf6b65d3661608fb20cb537a1c57573c1b1',
    P2: 'ebafa89b2ac018dd2eaa73d0c7bb62b675f548b297fdf590ee32d15bca74200a',
    P3: '915f449a7b1cb1820af3a5e92317e049c464e9ab4de8bcd257f48078868de35d',
    P4: 'd6afd79f7f33b93cbecf4201b922d5b1863e964687cb4d9da927c1b30f1aaff8',
  };
  const consumed = { POST: 0, PATCH: 0 };
  for (const [id, hash] of Object.entries(acknowledged)) {
    assert.equal(old.hash(id + '-ack.json'), hash);
    const result = old.read(id + '-result.json');
    assert(result.passed === true && result.result_uncertain === false && result.forwarding_attempts === 1 && Object.hasOwn(consumed, result.method));
    consumed[result.method]++;
  }
  assert.deepEqual(consumed, { POST: 2, PATCH: 2 });
  assert(!old.names().some(name => /^command-R[1-4]\.|^R[1-4]-/.test(name)), 'HISTORICAL_RECOVERY_TRACE');
  const original = old.read('w1430-P1-before.json');
  const reconciled = old.read('w1430-final-readonly.json');
  compareCheckpointState(reconciled, old.read('w1430-P4-after.json'));
  assert.equal(original.staff_audits.length, 0);
  assert.equal(reconciled.staff_audits.length, 2);
  assert.equal(plan.actors.OWNER_A.id, ACTORS.OWNER_A);
  assert.deepEqual(proposal.actions.map(action => action.id), ids);
  for (const action of proposal.actions) {
    const step = plan.steps.find(item => item.id === action.id);
    assert(step?.phase === 'RECOVERY' && step.method === action.method && step.path === action.path &&
      step.actor === action.actor && action.actor === 'OWNER_A' && step.target_id === action.target_id &&
      action.business_id === plan.business_A && step.expected_audits_inserted === action.expected_audits, 'ORIGINAL_ACTION_DRIFT');
    assert.deepEqual(action.body_from_original_plan, step.payload);
    const group = action.method === 'POST' ? 'profiles' : 'employees';
    const initial = original[group].find(row => row.id === action.target_id);
    const current = reconciled[group].find(row => row.id === action.target_id);
    assert(initial?.active === false && current?.active === true && initial.business_id === action.business_id && current.business_id === action.business_id);
    assert.equal(initial.semantic_md5_excluding_updated_at, action.expected_restored_semantic_md5_excluding_updated_at);
    assert.equal(current.semantic_md5_excluding_updated_at, action.final_reconciled_semantic_md5_excluding_updated_at);
    assert.equal(current.updated_at, action.final_reconciled_updated_at);
    if (action.method === 'POST') parseStaffRequest(action.body_from_original_plan);
  }
  return { actions: proposal.actions, original, reconciled };
}

function verifyWindow(approval) {
  assert(approval.project === PROJECT && approval.proposal_sha256 === proposalHash && approval.exclusive_confirmed === true &&
    approval.owner_mode === 'existing' && approval.max_Edge === 2 && approval.max_PATCH === 2, 'RECOVERY_APPROVAL_SCOPE');
  for (const time of [approval.start_utc, approval.end_utc]) {
    assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(time) && new Date(time).toISOString() === time.replace('Z', '.000Z'));
  }
  const window = { start: Date.parse(approval.start_utc), end: Date.parse(approval.end_utc) };
  assert(window.start >= Date.parse('2026-11-11T20:15:00Z') && window.end > window.start);
  return window;
}

async function waitFor(journal, name, end) {
  while (Date.now() < end && !journal.exists('stop.json')) {
    if (journal.exists(name)) return journal.read(name);
    await delay(200);
  }
  throw new Error('RECOVERY_WAIT_ENDED');
}

function publicKey() {
  const config = {};
  for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split(/\r?\n/)) {
    const match = /^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) config[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  assert(config.VITE_SUPABASE_URL?.replace(/\/$/, '') === ORIGIN);
  return publicKeyForTest(config.VITE_SUPABASE_ANON_KEY);
}

export async function sendRecoveryAction({ action, before, journal, window, gate, key, token, request = fetch }) {
  const id = action.id;
  const beforeFile = id + '-before.json';
  assert.deepEqual(journal.read(beforeFile), before, 'BEFORE_CHECKPOINT_CHANGED');
  const beforeSha = journal.hash(beforeFile);
  const body = structuredClone(action.body_from_original_plan);
  const patch = action.method === 'PATCH';
  const target = before[patch ? 'employees' : 'profiles'].find(row => row.id === action.target_id);
  assert(target?.active === true && target.business_id === action.business_id, 'RECOVERY_TARGET_DRIFT');
  let url = ORIGIN + action.path;
  if (patch) {
    body.updated_at = new Date().toISOString();
    url += '?' + new URLSearchParams({ id: 'eq.' + target.id, business_id: 'eq.' + action.business_id,
      updated_at: 'eq.' + target.updated_at, select: 'id' });
  }
  const parsed = new URL(url);
  assert(parsed.origin === ORIGIN && (patch && parsed.pathname === '/rest/v1/employees' ||
    action.method === 'POST' && parsed.pathname === '/functions/v1/manage-staff-user'));
  gate();
  fresh(before);
  journal.save(id + '-intent.json', { id, method: action.method, url, body_sha256: sha256(JSON.stringify(body)),
    target_id: target.id, before_sha256: beforeSha, utc: new Date().toISOString() });
  journal.save(id + '-reservation.json', { id, slots_consumed: 1, no_replay: true, utc: new Date().toISOString() });
  const result = { id, method: action.method, forwarding_attempts: 0, http: null, passed: false, uncertain: false };
  try {
    gate();
    fresh(before);
    assert.equal(journal.hash(beforeFile), beforeSha, 'BEFORE_CHECKPOINT_CHANGED');
    const signal = AbortSignal.timeout(requestTimeout(window, 'RECOVERY'));
    result.forwarding_attempts = 1;
    result.forwarding_utc = new Date().toISOString();
    const response = await request(url, {
      method: action.method, redirect: 'error', signal,
      headers: { apikey: key, Authorization: 'Bearer ' + token, Origin: appOrigin, 'Content-Type': 'application/json',
        ...(patch ? { Prefer: 'return=representation' } : {}) },
      body: JSON.stringify(body),
    });
    result.http = response.status;
    const value = await response.json();
    result.passed = result.http === 200 && (patch ? Array.isArray(value) && value.length === 1 && value[0].id === target.id :
      value?.ok === true && validStaffProfileReceipt(value.user, target.id, action.business_id, parseStaffRequest(body)));
    result.uncertain = result.http >= 500 || result.http === 408 || value?.reconciliation_required === true ||
      (result.http >= 200 && result.http < 300 && !result.passed);
  } catch { result.uncertain = result.forwarding_attempts === 1; }
  journal.save(id + '-result.json', result);
  assert(result.passed && !result.uncertain, 'RECOVERY_RECEIPT_NOT_PASS');
  return result;
}

async function main(workspace, approvalSha) {
  assert(/^[a-f0-9]{64}$/.test(approvalSha));
  for (const variable of ['NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'NODE_USE_ENV_PROXY',
    'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'SSLKEYLOGFILE']) assert(!Object.hasOwn(process.env, variable));
  const journal = openJournal(path.join(workspace, recoveryJournalDir));
  assert.deepEqual(journal.names().sort(), ['admission.json', 'approval.json', 'initial.json']);
  assert.equal(journal.hash('approval.json'), approvalSha);
  const approval = journal.read('approval.json');
  const window = verifyWindow(approval);
  const launcher = path.join(workspace, bundleDir, 'manifesto-executor-recuperacao.json');
  const query = path.join(workspace, bundleDir, 'checkpoint-recuperacao-readonly.sql');
  const verify = () => {
    requestTimeout(window, 'RECOVERY');
    assert(!journal.exists('stop.json'), 'RECOVERY_STOPPED');
    assert.equal(journal.hash('approval.json'), approvalSha);
    assert.equal(journal.hash('admission.json'), approval.admission_sha256);
    assert.equal(journal.hash('initial.json'), approval.initial_sha256);
    assert.equal(hashFile(launcher), approval.launcher_manifest_sha256);
    const manifest = readJson(launcher);
    assert.equal(manifest.proposal_sha256, proposalHash);
    assert.equal(hashFile(query), manifest.checkpoint_with_locks_sha256);
    assert.deepEqual(Object.keys(manifest.files).sort(), [...launcherFiles].sort());
    for (const [name, hash] of Object.entries(manifest.files)) assert.equal(hashFile(path.join(repo, name)), hash);
  };
  verify();
  const admission = journal.read('admission.json');
  assert(admission.project === PROJECT && admission.edge_version === 6 && admission.verify_jwt === true &&
    admission.edge_id === '9dad0ab5-fd65-43da-be56-da79c3cec5ba' && admission.sources_exact === 4 &&
    admission.edge_bundle_sha256 === '50a95817b3363fdbcbfd97b25f20b2c84a98cfdb93d5ade00e2fb5316897ef0d');
  const { actions, original, reconciled } = loadRecoveryBundle(workspace);
  const initial = journal.read('initial.json');
  compareCheckpointState(initial, reconciled);
  fresh(initial);
  const key = publicKey();
  journal.save('lock.json', { approval_sha256: approvalSha, pid: process.pid, utc: new Date().toISOString() });
  let token, step = 'COLLECTION';
  try {
    token = await collectOwnerToken({ deadline: window.end - 25_000, onReady: url => console.log(url) });
    verify();
    step = 'OWNER_IDENTITY';
    const receipt = await checkExistingOwner({ origin: appOrigin, projectUrl: ORIGIN, publicKey: key,
      readStoredSession: () => JSON.stringify({ accessToken: token }), now: () => window.end });
    journal.save('identity.json', receipt);
    assert.equal(receipt.code, 'OWNER_A_SESSION_CONFIRMED');
    journal.save('ready.json', { pid: process.pid, owner_identity_pass: true, utc: new Date().toISOString() });
    let expected = reconciled;
    for (const action of actions) {
      step = action.id;
      const before = await waitFor(journal, step + '-before.json', window.end - 25_000);
      compareCheckpointState(before, expected);
      const receipt = await sendRecoveryAction({ action, before, journal, window, gate: verify, key, token });
      const after = await waitFor(journal, step + '-after.json', window.end);
      fresh(after);
      assert(Date.parse(after.observed_utc) >= Date.parse(receipt.forwarding_utc), 'AFTER_CHECKPOINT_PREDATES_SEND');
      verifyRestorationStep(action, before, after, original);
      journal.save(step + '-ack.json', { id: step, passed: true, audit_delta: action.expected_audits,
        after_sha256: journal.hash(step + '-after.json'), utc: new Date().toISOString() });
      expected = after;
    }
    assert.equal(expected.staff_audits.length, 4);
    journal.save('closed.json', { passed: true, audits: 4, utc: new Date().toISOString() });
    console.log('RECOVERY_R1_R4_PASS');
  } catch {
    const resultName = step + '-result.json';
    const reserved = ids.includes(step) && journal.exists(step + '-reservation.json');
    const result = ids.includes(step) && journal.exists(resultName) ? journal.read(resultName) : null;
    if (!journal.exists('stop.json')) journal.save('stop.json', { step, uncertain: result?.uncertain || (reserved && !result),
      read_only_reconciliation_required: reserved, no_retry: true, utc: new Date().toISOString() });
    console.log('RECOVERY_R1_R4_STOPPED');
    process.exitCode = 2;
  } finally {
    token = undefined;
    journal.save('ended.json', { pid: process.pid, utc: new Date().toISOString() });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  try { assert.equal(process.argv.length, 3); await main(process.cwd(), process.argv[2]); }
  catch { console.error('RECOVERY_R1_R4_ADMISSION_BLOCKED'); process.exitCode = 2; }
}
