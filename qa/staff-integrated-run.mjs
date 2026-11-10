import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
  const integratedPackage = path.join(workspace, 'outputs/staff-integrated-review-20261110/manifesto.json');
  assert.equal(journal.hash(APPROVAL), approvalSha);
  const approval = journal.read(APPROVAL);
  const window = verifyWindow(journal.read(WINDOW));
  const windowHash = journal.hash(WINDOW);
  const ledger = journal.read(ACCOUNTING);
  checkAuthScope(approval, ledger);
  assert.equal(approval.window_sha256, windowHash);
  assert.equal(approval.accounting_sha256, journal.hash(ACCOUNTING));
  assert.equal(approval.integration_manifest_sha256, digest(integratedPackage));
  const reviewed = json(integratedPackage);
  assert.equal(reviewed.accounting_sha256, approval.accounting_sha256);
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
    assert.equal(digest(manifestPath), MANIFEST);
    assert.equal(journal.hash('accepted-addendum-link.json'), ADDENDUM);
    assert.equal(digest(path.join(repo, 'qa/sql/staff_business_checkpoint_readonly_TEST.sql')), CHECKPOINT);
    for (const [file, hash] of Object.entries(reviewed.files)) assert.equal(digest(path.join(repo, file)), hash);
    for (const record of ledger.historical_bindings) assert.equal(journal.hash(record.name), record.sha256);
    for (const file of manifest.artifacts) assert.equal(digest(path.join(approvedPackage, file.path)), file.sha256_bytes);
    for (const file of code.files) assert.equal(digest(path.join(repo, file.path)), file.sha256_bytes);
  };
  verify();
  assert(!journal.names().some(name =>
    /^(?:staff-integrated-launch-lock|integrated-auth-|integrated-execution-|command-|[A-Z][0-9]+-(?:intent|reservation|result|ack)|native-(?:ready|ended)|renewed-native-lock|owner-a-readmission-01-business-handoff|STOP\.json|CLOSE\.json)/.test(name)),
  'PRIOR_DISPATCH_OR_LOCK');
  return { journal, plan, window, ownerMode: approval.owner_mode, publicKey: readPublicConfig(), verify, windowHash };
}

// Both stages use the same Map and PID. This entry also supports local synthetic transports.
export async function runIntegratedStaff({ journal, plan, core, window, ownerMode, publicKey, verify, collect, authRequest, businessRequest }) {
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
    journal.save('integrated-execution-stopped.json', { pid: process.pid, phase, no_retry: true, utc: new Date().toISOString() });
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
  config.journal.save(LOCK, { pid: process.pid, window_sha256: config.windowHash, utc: new Date().toISOString() });
  const result = await runIntegratedStaff({
    ...config, core, collect: () => collectStaffInput({
      ownerMode: config.ownerMode, deadline: config.window.cutoff - 25000,
      onReady: url => {
        config.journal.save('integrated-form-opened.json', { pid: process.pid, masked_fields: 4, utc: new Date().toISOString() });
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
