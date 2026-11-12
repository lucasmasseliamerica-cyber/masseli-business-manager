import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { ACTORS, ORIGIN, PROJECT, acquireStaffSessions, publicKeyForTest } from './staff-integrated-auth.mjs';
import { collectStaffInput } from './staff-integrated-input.mjs';
import { openJournal } from './staff-integrated-run.mjs';
import { requestTimeout, sha256 } from './staff-integrated-business.mjs';
import { executeContinuation, loadContinuation, scopeApproval } from './staff-continuation.mjs';

const baseHash = 'b7139c713a1a56351383621f8482f06f48ecc2e4bdbb22be9f1be34714deaf78';
const dir = 'work/staff-user-service/staff-permissions-continuation-password-20261112';
const packet = 'outputs/staff-permissions-continuation-review-20261111/complemento-auth-senhas.json';
const closedDir = 'work/staff-user-service/staff-permissions-continuation-20261111';
const root = fileURLToPath(new URL('..', import.meta.url));
const digest = file => sha256(fs.readFileSync(file));
const authScope = { owner_mode: 'existing', owner_login_POST: 0, member_admin_GET: { MANAGER: 1, EMPLOYEE: 1 },
  member_login_POST: { MANAGER: 1, EMPLOYEE: 1 }, identity_GET_in_base_budget: 3 };

function readPublicKey() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
    const match = /^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  assert.equal(env.VITE_SUPABASE_URL?.replace(/\/$/, ''), ORIGIN);
  return publicKeyForTest(env.VITE_SUPABASE_ANON_KEY);
}

function current(checkpoint, request) {
  const observed = Date.parse(checkpoint.observed_utc);
  assert(observed >= Date.parse(request.requested_utc) && Date.now() - observed >= 0 &&
    Date.now() - observed < 45_000 && checkpoint.competing_staff_relation_locks === 0, 'CHECKPOINT_STALE_OR_NOT_QUIET');
}

async function openAdmission(addendumHash, approvalHash) {
  assert(/^[a-f0-9]{64}$/.test(addendumHash) && /^[a-f0-9]{64}$/.test(approvalHash), 'ADDENDUM_HASH_REQUIRED');
  const bundle = await loadContinuation(process.cwd(), baseHash);
  const addendumFile = path.resolve(packet);
  assert.equal(digest(addendumFile), addendumHash, 'ADDENDUM_DRIFT');
  const addendum = JSON.parse(fs.readFileSync(addendumFile, 'utf8'));
  assert.equal(addendum.base_manifest_sha256, baseHash);
  assert.equal(addendum.project, PROJECT);
  assert.deepEqual(addendum.auth, authScope);
  assert.equal(addendum.runner_sha256, digest(fileURLToPath(import.meta.url)));
  assert.equal(addendum.journal, dir);
  assert.equal(Object.keys(addendum.closed_auth_receipts).length, 4, 'AUTH_HISTORY_REQUIRED');
  const previous = openJournal(closedDir);
  const previousClosure = previous.read('closed-before-input.json');
  const journal = openJournal(dir);
  const approval = journal.read('approval.json');
  const window = scopeApproval(approval, baseHash);
  assert.deepEqual(approval.auth, authScope);
  assert(approval.auth_addendum_sha256 === addendumHash && approval.auth_explicitly_authorized === true, 'AUTH_APPROVAL_REQUIRED');
  const edge = journal.read('edge-admission.json');
  const expected = bundle.manifest.edge;
  assert(edge.project === PROJECT && edge.edge_id === expected.id && edge.edge_version === expected.version && edge.status === 'ACTIVE' &&
    edge.verify_jwt === expected.verify_jwt && edge.edge_bundle_sha256 === expected.bundle_sha256 &&
    Date.parse(edge.observed_utc) >= window.start && Date.parse(edge.observed_utc) <= Date.now(), 'EDGE_ADMISSION_DRIFT');
  assert.deepEqual(edge.source_sha256, expected.source_sha256, 'EDGE_SOURCES_DRIFT');
  const check = () => {
    bundle.verify();
    assert.equal(digest(addendumFile), addendumHash);
    assert.equal(digest(fileURLToPath(import.meta.url)), addendum.runner_sha256);
    for (const [file, hash] of Object.entries(addendum.closed_auth_receipts)) assert.equal(digest(file), hash, 'AUTH_HISTORY_DRIFT');
    assert.deepEqual(previous.names().sort(), ['approval.json', 'closed-before-input.json', 'edge-admission.json', 'lock.json']);
    assert.equal(previous.hash('closed-before-input.json'), addendum.previous_closure_sha256);
    assert(previousClosure.status === 'COLLECTION_CLOSED_BEFORE_INPUT' &&
      ['Edge', 'PATCH', 'authenticated_GET', 'SQL', 'Auth_login_POST'].every(key => previousClosure[key] === 0));
    for (const [name, hash] of Object.entries(previousClosure.artifacts)) assert.equal(previous.hash(name), hash);
    assert.equal(journal.hash('approval.json'), approvalHash);
    assert.equal(journal.hash('edge-admission.json'), approval.edge_admission_sha256);
  };
  const gate = phase => {
    check();
    assert(!journal.exists('stop.json') || phase === 'RECONCILE', 'CONTINUATION_STOPPED');
    return requestTimeout(window, phase === 'RECONCILE' ? 'RECOVERY' : phase);
  };
  check();
  return { bundle, journal, window, gate };
}

async function run(addendumHash, approvalHash) {
  for (const key of ['NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'NODE_USE_ENV_PROXY', 'SSLKEYLOGFILE']) {
    assert(!Object.hasOwn(process.env, key), 'ENVIRONMENT_DRIFT');
  }
  const { bundle, journal, window, gate } = await openAdmission(addendumHash, approvalHash);
  assert.deepEqual(journal.names().sort(), ['approval.json', 'edge-admission.json']);
  gate('HOMOLOGATION');
  const publicKey = readPublicKey();
  journal.save('lock.json', { pid: process.pid, approval_sha256: approvalHash });
  const sessions = new Map();
  try {
    const inputs = await collectStaffInput({ ownerMode: 'existing', deadline: window.cutoff - 25_000, onReady: console.log });
    journal.save('collection-receipt.json', { pid: process.pid, received_utc: new Date().toISOString() });
    const auth = await acquireStaffSessions({ inputs, ownerMode: 'existing', end: window.end, publicKey, sessions,
      gate: () => gate('HOMOLOGATION'), save: (name, value) => journal.save(name, value) });
    assert(auth.actorCount === 3 && auth.authenticatedReads === 3 && auth.pid === process.pid &&
      Object.keys(ACTORS).every(actor => sessions.has(actor)), 'AUTH_PROOF_DRIFT');
    journal.save('ready.json', { pid: process.pid, identities_confirmed: 3 });
    let reads = 0;
    const checkpoint = async (label, phase) => {
      assert(++reads <= (label === 'reconcile-only' ? 36 : 35), 'SQL_BUDGET_EXHAUSTED');
      const executionPhase = label === 'reconcile-only' ? 'RECONCILE' : phase;
      gate(executionPhase);
      const name = 'SQL-' + String(reads).padStart(2, '0');
      const request = { label, query_sha256: bundle.manifest.package_files['checkpoint-continuacao.sql'],
        requested_utc: new Date().toISOString() };
      journal.save(name + '-request.json', request);
      while (!journal.exists(name + '-checkpoint.json')) { gate(executionPhase); await delay(200); }
      const result = journal.read(name + '-checkpoint.json');
      current(result, request);
      return result;
    };
    const dispatch = async (actor, method, url, payload, phase) => {
      const response = await fetch(new URL(url, ORIGIN), { method, redirect: 'error', signal: AbortSignal.timeout(gate(phase)),
        headers: { apikey: publicKey, Authorization: 'Bearer ' + sessions.get(actor), Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload) });
      return { http: response.status, value: await response.json().catch(() => null) };
    };
    await executeContinuation({ ...bundle, checkpoint, journal, dispatch, gate });
    console.log(journal.read('closed.json').passed ? 'STAFF_CONTINUATION_PASS' : 'STAFF_CONTINUATION_RESTORED_AFTER_STOP');
  } finally {
    sessions.clear();
    journal.save('ended.json', { pid: process.pid, utc: new Date().toISOString() });
  }
}

async function recordCheckpoint(addendumHash, approvalHash, name) {
  assert(/^SQL-(?:0[1-9]|[12]\d|3[0-6])$/.test(name), 'SQL_CHECKPOINT_NAME_SCOPE');
  const { bundle, journal, gate } = await openAdmission(addendumHash, approvalHash);
  const request = journal.read(name + '-request.json');
  assert(journal.read('lock.json').approval_sha256 === approvalHash && !journal.exists('ended.json') &&
    request.query_sha256 === bundle.manifest.package_files['checkpoint-continuacao.sql']);
  const phase = request.label === 'reconcile-only' ? 'RECONCILE' : request.label.startsWith('RESTAURAR-') ? 'RECOVERY' : 'HOMOLOGATION';
  gate(phase);
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
    assert(raw.length <= 100_000, 'SQL_CHECKPOINT_INPUT_LIMIT');
  }
  const checkpoint = JSON.parse(raw);
  gate(phase);
  assert(!journal.exists('ended.json'));
  current(checkpoint, request);
  const file = name + '-checkpoint.json';
  assert(!journal.exists(file), 'SQL_CHECKPOINT_ALREADY_RECORDED');
  journal.save(file + '.tmp', checkpoint);
  fs.renameSync(path.join(dir, file + '.tmp'), path.join(dir, file));
  console.log(name + '_CHECKPOINT_RECORDED');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--checkpoint') {
      assert.equal(process.argv.length, 6);
      await recordCheckpoint(process.argv[3], process.argv[4], process.argv[5]);
    } else {
      assert.equal(process.argv.length, 4);
      await run(process.argv[2], process.argv[3]);
    }
  } catch (error) {
    console.error(/^[A-Z0-9_]{4,100}$/.test(error?.message ?? '') ? error.message : 'STAFF_CONTINUATION_AUTH_BLOCKED');
    process.exitCode = 2;
  }
}
