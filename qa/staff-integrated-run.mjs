import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ACTORS, ORIGIN, PROJECT, acquireStaffSessions, publicKeyForTest } from './staff-integrated-auth.mjs';
import { ADDENDUM, CHECKPOINT, MANIFEST, createBusinessExecutor, requestTimeout, sha256, verifyWindow } from './staff-integrated-business.mjs';
import { collectStaffInput } from './staff-integrated-input.mjs';

const currentFile = fileURLToPath(import.meta.url);
const repo = path.resolve(path.dirname(currentFile), '..');
const WINDOW = 'staff-integrated-window.json';
const ADMISSION = 'staff-integrated-admission.json';
const APPROVAL = 'staff-integrated-approval.json';
const ACCOUNTING = 'staff-integrated-auth-accounting-20261110.json';
const LOCK = 'staff-integrated-launch-lock.json';
const COLLECTION_CLOSURE = 'staff-integrated-collection-expired-20261110.json';
const originalRecords = Object.freeze({
  lock: LOCK, form: 'integrated-form-opened.json', stopped: 'integrated-execution-stopped.json',
});
const renewalRecords = Object.freeze({
  lock: 'staff-integrated-renewal-launch-lock.json',
  form: 'integrated-renewal-form-opened.json', stopped: 'integrated-renewal-execution-stopped.json',
});
const readmissionRecords = Object.freeze({
  lock: 'staff-integrated-readmission-launch-lock.json',
  form: 'integrated-readmission-form-opened.json', stopped: 'integrated-readmission-execution-stopped.json',
});
const originalCollection = Object.freeze({
  records: originalRecords, closure: COLLECTION_CLOSURE, field: 'collection_closure_sha256',
  window: 'staff-integrated-expired-window-20261110.json',
  approval: 'staff-integrated-expired-approval-20261110.json',
  admission: 'staff-integrated-expired-admission-20261110.json',
});
const renewedCollection = Object.freeze({
  records: renewalRecords, closure: 'staff-integrated-renewal-collection-expired-20261111.json',
  field: 'renewal_collection_closure_sha256',
  window: 'staff-integrated-renewal-window-confirmed.json',
  approval: 'staff-integrated-renewal-approval-record.json',
  admission: 'staff-integrated-renewal-admission-record.json',
});
const PACKAGE_FILES = [
  'qa/staff-integrated-run.mjs', 'qa/staff-integrated-auth.mjs', 'qa/staff-integrated-input.mjs',
  'qa/staff-integrated-business.mjs', 'qa/staff-integrated-control.mjs',
];

export function openJournal(dir) {
  const target = name => {
    assert(typeof name === 'string' && /^[A-Za-z0-9_.-]+\.json(?:\.tmp)?$/.test(name), 'JOURNAL_NAME_SCOPE');
    return path.join(dir, name);
  };
  return {
    read: name => JSON.parse(fs.readFileSync(target(name), 'utf8')),
    hash: name => sha256(fs.readFileSync(target(name))),
    exists: name => fs.existsSync(target(name)),
    names: () => fs.readdirSync(dir),
    save(name, value) {
      const fd = fs.openSync(target(name), 'wx');
      try {
        fs.writeFileSync(fd, JSON.stringify(value, null, 2) + '\n');
        fs.fsyncSync(fd);
      } finally { fs.closeSync(fd); }
    },
  };
}

export function checkAuthScope(approval, ledger) {
  assert(approval.project === PROJECT && approval.explicitly_authorized === true &&
    approval.stop_on_error_no_retry === true && approval.no_account_changes === true, 'AUTH_APPROVAL_SCOPE');
  assert(ledger.project === PROJECT && ledger.manager.manual_possibly_consumed === 1 &&
    ledger.manager.manual_http_status === null && ledger.manager.available_without_new_authorization === 0 &&
    ledger.employee.available_without_new_authorization === 1, 'HISTORICAL_AUTH_BUDGET');
  assert(approval.manager_additional_login === 1 && approval.employee_additional_login === 0 &&
    approval.manager_existing_admin_get === 1 && approval.employee_existing_admin_get === 1, 'MEMBER_APPROVAL_SCOPE');
  assert(approval.owner_mode === 'existing' || approval.owner_mode === 'login', 'OWNER_MODE_DENIED');
  const ownerAllowance = approval.owner_mode === 'login' ? 1 : 0;
  assert(approval.owner_additional_login === ownerAllowance && approval.owner_additional_admin_get === ownerAllowance, 'OWNER_APPROVAL_SCOPE');
}

export function executionRecords(approval) {
  if (approval.renewal_collection_closure_sha256 !== undefined) return readmissionRecords;
  return approval.collection_closure_sha256 === undefined ? originalRecords : renewalRecords;
}

export function assertReadyProcess(journal, records) {
  const ready = journal.read('native-ready.json'), lock = journal.read(records.lock);
  assert(ready.same_process_auth_and_executor === true && ready.pid === lock.pid &&
    lock.window_sha256 === journal.hash(WINDOW), 'NATIVE_READY_REQUIRED');
}

export async function waitForResult(journal, records, name, until) {
  while (!journal.exists(name) && !journal.exists('native-ended.json') && !journal.exists(records.stopped) && Date.now() < until) {
    await delay(200);
  }
  return journal.exists(name);
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

function verifyRecordedCollection(journal, approval, history, isAlive) {
  assert(/^[a-f0-9]{64}$/.test(approval[history.field] ?? ''), 'COLLECTION_CLOSURE_REQUIRED');
  assert.equal(journal.hash(history.closure), approval[history.field], 'COLLECTION_CLOSURE_DRIFT');
  const closure = journal.read(history.closure);
  assert(closure.project === PROJECT && closure.phase === 'COLLECTION' && closure.forwarding_attempts === 0 &&
    closure.process_ended === true && closure.listener_closed === true && closure.result_uncertain === false,
  'COLLECTION_CLOSURE_NOT_ELIGIBLE');
  const { records } = history;
  const files = [records.lock, records.form, records.stopped, history.window, history.approval, history.admission];
  assert.deepEqual(Object.keys(closure.files).sort(), [...files].sort(), 'COLLECTION_CLOSURE_FILES');
  for (const file of files) assert.equal(journal.hash(file), closure.files[file], 'COLLECTION_HISTORY_DRIFT');
  const lock = journal.read(records.lock), form = journal.read(records.form), stopped = journal.read(records.stopped);
  assert(Number.isInteger(lock.pid) && lock.pid > 0 && form.pid === lock.pid && stopped.pid === lock.pid &&
    stopped.phase === 'COLLECTION' && stopped.no_retry === true && !isAlive(lock.pid), 'COLLECTION_PROCESS_NOT_CLOSED');
  const oldWindow = verifyWindow(journal.read(history.window));
  const newWindow = verifyWindow(journal.read(WINDOW));
  assert(lock.window_sha256 === closure.files[history.window] &&
    Date.parse(stopped.utc) >= oldWindow.cutoff - 25000 && newWindow.start > oldWindow.end,
  'COLLECTION_WINDOW_NOT_RENEWED');
  const previous = journal.read(history.approval);
  assert(previous.window_sha256 === lock.window_sha256, 'COLLECTION_OLD_APPROVAL_DRIFT');
  for (const key of [
    'project', 'explicitly_authorized', 'stop_on_error_no_retry', 'no_account_changes', 'no_refresh', 'owner_mode',
    'owner_additional_login', 'owner_additional_admin_get', 'manager_additional_login', 'employee_additional_login',
    'manager_existing_admin_get', 'employee_existing_admin_get', 'accounting_sha256', 'supplement_authorization_record_sha256',
  ]) assert.deepEqual(approval[key], previous[key], 'COLLECTION_AUTH_SCOPE_CHANGED');
}

export function verifyCollectionClosure(journal, approval, isAlive = processAlive) {
  verifyRecordedCollection(journal, approval, originalCollection, isAlive);
  if (approval.renewal_collection_closure_sha256 !== undefined) {
    verifyRecordedCollection(journal, approval, renewedCollection, isAlive);
    const previous = journal.read(renewedCollection.approval);
    assert.equal(previous.collection_closure_sha256, approval.collection_closure_sha256, 'COLLECTION_CHAIN_DRIFT');
    assert.equal(journal.read(renewedCollection.admission).window_sha256, previous.window_sha256, 'COLLECTION_ADMISSION_DRIFT');
  }
}

export function verifyLaunchState(journal, approval, isAlive = processAlive) {
  const allowed = new Set();
  if (approval.collection_closure_sha256 !== undefined || approval.renewal_collection_closure_sha256 !== undefined) {
    verifyCollectionClosure(journal, approval, isAlive);
    for (const name of Object.values(originalRecords)) allowed.add(name);
    if (approval.renewal_collection_closure_sha256 !== undefined) {
      for (const name of Object.values(renewalRecords)) allowed.add(name);
    }
  }
  assert(!journal.names().some(name => !allowed.has(name) &&
    /^(?:staff-integrated-(?:launch|renewal-launch|readmission-launch)-lock|integrated-auth-|integrated-form-|integrated-execution-|integrated-renewal-|integrated-readmission-|command-|reads-|[A-Z][0-9]+-(?:intent|reservation|result|ack)|native-(?:ready|ended)|renewed-native-lock|owner-a-readmission-01-business-handoff|STOP\.json|CLOSE\.json)/.test(name)),
  'PRIOR_DISPATCH_OR_LOCK');
  return executionRecords(approval);
}

const digest = file => sha256(fs.readFileSync(file));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function readPublicConfig() {
  const values = {};
  for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  assert(values.VITE_SUPABASE_URL?.replace(/\/$/, '') === ORIGIN, 'TEST_PUBLIC_CONFIG');
  return publicKeyForTest(values.VITE_SUPABASE_ANON_KEY);
}

function loadOperationalInputs(workspace, approvalSha) {
  assert(/^[a-f0-9]{64}$/.test(approvalSha ?? ''), 'APPROVAL_SHA_REQUIRED');
  for (const variable of [
    'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'NODE_USE_ENV_PROXY',
    'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'SSLKEYLOGFILE',
  ]) {
    assert(!Object.hasOwn(process.env, variable), 'NODE_TRANSPORT_CONFIGURATION_DRIFT');
  }
  const journal = openJournal(path.join(workspace, 'work/staff-user-service/business-run-20261107-0410'));
  const approvedPackage = path.join(workspace, 'outputs/staff-business-homologation-review-20261104');
  assert.equal(journal.hash(APPROVAL), approvalSha);
  const approval = journal.read(APPROVAL);
  const records = executionRecords(approval);
  const originalIntegration = path.join(workspace, 'outputs/staff-integrated-review-20261110/manifesto.json');
  const renewedIntegration = path.join(workspace, 'outputs/staff-integrated-renewal-20261111/manifesto.json');
  const readmission = approval.renewal_collection_closure_sha256 !== undefined;
  const previousIntegration = readmission ? renewedIntegration : originalIntegration;
  const integratedPackage = readmission ? path.join(workspace, 'outputs/staff-integrated-readmission-20261111/manifesto.json') :
    approval.collection_closure_sha256 === undefined ? originalIntegration : renewedIntegration;
  const window = verifyWindow(journal.read(WINDOW));
  const windowHash = journal.hash(WINDOW);
  const ledger = journal.read(ACCOUNTING);
  checkAuthScope(approval, ledger);
  assert.equal(approval.window_sha256, windowHash);
  assert.equal(approval.accounting_sha256, journal.hash(ACCOUNTING));
  assert.equal(approval.integration_manifest_sha256, digest(integratedPackage));
  const reviewed = json(integratedPackage);
  assert.equal(reviewed.accounting_sha256, approval.accounting_sha256);
  if (approval.collection_closure_sha256 !== undefined) {
    assert.equal(reviewed.collection_closure_sha256, approval.collection_closure_sha256);
    assert.equal(reviewed.previous_integration_manifest_sha256, digest(previousIntegration));
    if (readmission) {
      assert.equal(reviewed.renewal_collection_closure_sha256, approval.renewal_collection_closure_sha256);
      assert.equal(journal.read(renewedCollection.approval).integration_manifest_sha256, reviewed.previous_integration_manifest_sha256);
    }
  }
  assert.deepEqual(Object.keys(reviewed.files).sort(), [...PACKAGE_FILES].sort());
  const manifestPath = path.join(approvedPackage, 'manifesto.json');
  assert.equal(digest(manifestPath), MANIFEST);
  const manifest = json(manifestPath);
  const plan = json(path.join(approvedPackage, 'plano-operacoes.json'));
  const code = json(path.join(approvedPackage, 'vinculo-codigo-e-gates.json'));
  const admissionHash = journal.hash(ADMISSION);
  const admission = journal.read(ADMISSION);
  assert(admission.project === PROJECT && admission.edge_version === 6 && admission.edge_source_hashes === 4 &&
    admission.verify_jwt === true && admission.edge_id === '9dad0ab5-fd65-43da-be56-da79c3cec5ba' &&
    admission.bundle_sha256 === '50a95817b3363fdbcbfd97b25f20b2c84a98cfdb93d5ade00e2fb5316897ef0d' &&
    admission.initial_state_exact === true && admission.quiet_at_admission === true &&
    admission.window_sha256 === windowHash, 'BUSINESS_ADMISSION_DRIFT');
  const age = Date.now() - Date.parse(admission.observed_utc);
  assert(age >= 0 && age < 45000, 'ADMISSION_STALE_OR_FUTURE');
  for (const [actor, id] of Object.entries(ACTORS)) assert.equal(plan.actors[actor].id, id);
  assert.equal(plan.steps.filter(s => s.method === 'POST').length, 17);
  assert.equal(plan.steps.filter(s => s.method === 'PATCH').length, 4);
  assert.equal(plan.steps.length, 21);
  assert.equal(new Set(plan.steps.map(s => s.id)).size, 21);

  const verify = () => {
    assert.equal(journal.hash(APPROVAL), approvalSha);
    assert.equal(journal.hash(WINDOW), windowHash);
    assert.equal(journal.hash(ADMISSION), admissionHash);
    assert.equal(journal.hash(ACCOUNTING), approval.accounting_sha256);
    assert.equal(digest(integratedPackage), approval.integration_manifest_sha256);
    assert.equal(journal.hash('staff-integrated-supplement-authorization-20261110.json'), approval.supplement_authorization_record_sha256);
    if (approval.collection_closure_sha256 !== undefined) assert.equal(digest(previousIntegration), reviewed.previous_integration_manifest_sha256);
    assert.equal(digest(manifestPath), MANIFEST);
    assert.equal(journal.hash('accepted-addendum-link.json'), ADDENDUM);
    assert.equal(digest(path.join(repo, 'qa/sql/staff_business_checkpoint_readonly_TEST.sql')), CHECKPOINT);
    for (const [file, hash] of Object.entries(reviewed.files)) assert.equal(digest(path.join(repo, file)), hash);
    for (const record of ledger.historical_bindings) assert.equal(journal.hash(record.name), record.sha256);
    if (approval.collection_closure_sha256 !== undefined) verifyCollectionClosure(journal, approval);
    for (const file of manifest.artifacts) assert.equal(digest(path.join(approvedPackage, file.path)), file.sha256_bytes);
    for (const file of code.files) assert.equal(digest(path.join(repo, file.path)), file.sha256_bytes);
  };
  verify();
  verifyLaunchState(journal, approval);
  return { journal, plan, window, ownerMode: approval.owner_mode, publicKey: readPublicConfig(), verify, windowHash, records };
}

// Both stages use the same Map and PID. This entry also supports local synthetic transports.
export async function runIntegratedStaff({ journal, plan, core, window, ownerMode, publicKey, verify, collect, authRequest, businessRequest, records = originalRecords }) {
  const sessions = new Map();
  let phase = 'COLLECTION';
  const gate = () => {
    verify();
    assert(!journal.exists('STOP.json') && !journal.exists('CLOSE.json'), 'BATCH_STOPPED');
    return requestTimeout(window, 'SETUP');
  };
  try {
    gate();
    const inputs = await collect();
    phase = 'AUTH';
    const authProof = await acquireStaffSessions({
      inputs, ownerMode, end: window.end, publicKey, sessions, gate,
      save: (name, receipt) => journal.save(name, receipt), request: authRequest,
    });
    phase = 'BUSINESS';
    gate();
    const executor = createBusinessExecutor({ journal, plan, core, window, sessions, authProof, publicKey, verify, fetchRequest: businessRequest });
    await executor.run();
    const passed = !journal.exists('STOP.json') &&
      plan.steps.every(step => journal.exists(step.id + '-ack.json') && journal.read(step.id + '-ack.json').passed === true);
    return { pid: process.pid, phase, passed };
  } catch {
    journal.save(records.stopped, { pid: process.pid, phase, no_retry: true, utc: new Date().toISOString() });
    return { pid: process.pid, phase, passed: false };
  } finally { sessions.clear(); }
}

async function main() {
  assert.equal(process.argv.length, 3);
  const config = loadOperationalInputs(process.cwd(), process.argv[2]);
  requestTimeout(config.window, 'SETUP');
  const core = await import(pathToFileURL(path.join(repo, 'supabase/functions/_shared/manage-staff-user-core.mjs')).href);
  for (const step of config.plan.steps) if (step.method === 'POST') core.parseStaffRequest(step.payload);
  config.verify();
  config.journal.save(config.records.lock, { pid: process.pid, window_sha256: config.windowHash, utc: new Date().toISOString() });
  const result = await runIntegratedStaff({
    ...config, core, collect: () => collectStaffInput({
      ownerMode: config.ownerMode, deadline: config.window.cutoff - 25000,
      onReady: url => {
        config.journal.save(config.records.form, { pid: process.pid, masked_fields: 4, utc: new Date().toISOString() });
        console.log(url);
      },
    }),
  });
  console.log(result.passed ? 'INTEGRATED_RUN_ENDED' : 'INTEGRATED_RUN_STOPPED');
  if (!result.passed) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  try { await main(); }
  catch { console.error('INTEGRATED_ADMISSION_BLOCKED'); process.exitCode = 2; }
}
