import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { ACTORS, ORIGIN, PROJECT, publicKeyForTest, requestTestAuth } from './staff-integrated-auth.mjs';
import { requestTimeout, sha256 } from './staff-integrated-business.mjs';
import { openJournal } from './staff-integrated-run.mjs';
import { compareCheckpointState } from './staff-p4-recovery.mjs';
import { collectContinuationTokens } from './staff-continuation-input.mjs';
import { buildStaffSalaryRevision, staffSalaryIndicator } from './staff-salary-review.mjs';
import { parseStaffRequest, validStaffProfileReceipt } from '../supabase/functions/_shared/manage-staff-user-core.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const packageDir = 'outputs/staff-permissions-continuation-review-20261111';
const historicalDir = 'work/staff-user-service/business-run-20261107-0410';
const recoveryDir = 'work/staff-user-service/staff-p4-recovery-20261111-renewed';
export const continuationJournalDir = 'work/staff-user-service/staff-permissions-continuation-20261111';
const caseIds = ['N1', 'N2', 'U1', 'G1', 'N3', 'N4', 'N5', 'N6', 'N7', 'U2', 'U3', 'G2', 'N8'];
const fixtureStages = { 'ATIVAR-M': 'P3', 'ATIVAR-E': 'P4', 'RESTAURAR-E': 'R1', 'RESTAURAR-M': 'R2' };
const profileFields = ['id', 'business_id', 'name', 'username', 'role', 'employee_id', 'active', 'permission_overrides'];
const digest = file => sha256(fs.readFileSync(file));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const readBefore = { N1: 'baseline', N3: 'after_G1', N8: 'after_G2' };
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) &&
  new Date(value).toISOString() === value.replace('Z', '.000Z');

export function validatePlan(plan, original, defaults, readPlan, baseline) {
  assert.equal(plan.project, PROJECT);
  assert.deepEqual(plan.steps.map(step => step.id), caseIds);
  assert.deepEqual(plan.setup.map(step => step.id), ['ATIVAR-M', 'ATIVAR-E']);
  assert.deepEqual(plan.recovery.map(step => step.id), ['RESTAURAR-E', 'RESTAURAR-M']);
  for (const step of [...plan.setup, ...plan.steps, ...plan.recovery]) {
    const prior = original.steps.find(row => row.id === (fixtureStages[step.id] ?? step.id));
    assert(prior && step.method === 'POST' && step.path === '/functions/v1/manage-staff-user' && step.no_retry === true &&
      step.maximum_forwarding_attempts === 1 && Object.hasOwn(ACTORS, step.actor) && ACTORS[step.actor] === step.actor_id);
    for (const field of ['actor', 'actor_id', 'target_id', 'payload', 'expected_after', 'expected_status', 'expected_code',
      'expected_user_rows_updated', 'expected_audits_inserted']) assert.deepEqual(step[field], prior[field], 'CASE_DRIFT');
    if (caseIds.includes(step.id)) assert.deepEqual(step.before, prior.before, 'CASE_START_STATE_DRIFT');
    assert.equal(parseStaffRequest(step.payload).operation, 'update');
    assert.equal(step.payload.user_id, step.target_id);
  }
  const generated = readPlan(original, 'baseline', defaults);
  assert.deepEqual(plan.authenticated_read_plan, { baseline: generated.slice(23), after_G1: readPlan(original, 'grant', defaults),
    after_G2: readPlan(original, 'revoke', defaults) }, 'READ_PLAN_DRIFT');
  assert.equal(generated.length, 74);
  const checkpoints = Object.values(plan.authenticated_read_plan).flat();
  assert.equal(checkpoints.length, 56);
  assert.equal(new Set(checkpoints.map(row => row.id)).size, 56);
  for (const check of checkpoints) {
    assert(Object.hasOwn(ACTORS, check.actor) && typeof check.path === 'string' && check.path.startsWith('/rest/v1/'));
    const url = new URL(check.path, ORIGIN);
    assert(url.origin === ORIGIN && !url.hash && !url.username && !url.password && !/undefined|null/.test(check.path));
    assert(['/rest/v1/users', '/rest/v1/rpc/user_can', '/rest/v1/rpc/fn_read_employees_secure'].includes(url.pathname));
    if (check.id.endsWith('-foreign-employee')) {
      assert.deepEqual([...url.searchParams.keys()], ['select', 'business_id', 'id']);
      assert.equal(url.searchParams.get('business_id'), 'eq.' + original.business_B_canary);
      assert.equal(url.searchParams.get('id'), 'eq.' + original.employee_QA_B_read_only_canary);
    }
  }
  assert.equal(baseline.staff_audits.length, 4);
  for (const step of plan.setup) {
    const profile = baseline.profiles.find(row => row.id === step.target_id);
    const employee = baseline.employees.find(row => row.id === step.payload.employee_id);
    assert(profile?.active === false && employee?.active === false && employee.business_id === original.business_A);
  }
}

export function scopeApproval(approval, manifestHash, approvedBudget) {
  assert(approval.project === PROJECT && approval.manifest_sha256 === manifestHash && approval.exclusive_confirmed === true &&
    approval.additional_scope_confirmed === true && approval.stop_on_uncertainty_no_retry === true, 'CONTINUATION_APPROVAL_REQUIRED');
  assert.deepEqual(approval.budget, approvedBudget ?? { Edge_original_cases: 13, Edge_additional: 4, Edge_restore_reserved: 2, PATCH: 0,
    GET_authenticated_additional: 4, GET_authenticated_total: 59, SQL_read_only: 36 });
  const times = [approval.start_utc, approval.cutoff_utc, approval.end_utc];
  assert(times.every(iso), 'CONTINUATION_WINDOW_FORMAT');
  const [start, cutoff, end] = times.map(value => Date.parse(value));
  assert(end - cutoff === 600_000 && cutoff > start && end - start <= 2_700_000, 'CONTINUATION_WINDOW_SCOPE');
  return { start, cutoff, end };
}

function requireCurrentCheckpoint(checkpoint) {
  const age = Date.now() - Date.parse(checkpoint.observed_utc);
  assert(age >= 0 && age < 45_000 && checkpoint.competing_staff_relation_locks === 0, 'CHECKPOINT_STALE_OR_NOT_QUIET');
}

function validateRead(check, value, business) {
  if (Object.hasOwn(check.expect, 'boolean')) return value === check.expect.boolean;
  if (!Array.isArray(value) || value.length !== check.expect.rows || !value.every(row => row.business_id === business)) return false;
  if (value.length && check.path.includes('&id=eq.')) {
    const id = new URL(check.path, ORIGIN).searchParams.get('id').slice(3);
    if (value.some(row => row.id !== id)) return false;
  }
  return !Object.hasOwn(check.expect, 'salary_visible') || (Object.hasOwn(value[0], 'hourly_rate') &&
    (value[0].hourly_rate !== null) === check.expect.salary_visible);
}

function verifyDelta(before, after, step, business) {
  if (step.expected_user_rows_updated === 0) return compareCheckpointState(after, before);
  const row = after.profiles.find(value => value.id === step.target_id);
  assert(row && profileFields.every(field => Object.hasOwn(step.expected_after, field)), 'AFTER_PROFILE_SCOPE');
  assert.deepEqual(Object.fromEntries(profileFields.map(field => [field, row[field]])), step.expected_after);
  assert(Date.parse(row.updated_at) > Date.parse(before.profiles.find(value => value.id === step.target_id).updated_at), 'PROFILE_NOT_UPDATED');
  const existingIds = new Set(before.staff_audits.map(audit => audit.id));
  const added = after.staff_audits.filter(audit => !existingIds.has(audit.id));
  assert.equal(added.length, step.expected_audits_inserted);
  assert(added.length === 1 && added[0].business_id === business && added[0].user_id === step.actor_id &&
    added[0].role_snapshot === before.profiles.find(profile => profile.id === step.actor_id).role &&
    added[0].action === 'Staff User Updated' && added[0].details === `${step.target_id} · ${row.role} · active=${row.active}`, 'AUDIT_SCOPE_DRIFT');
  compareCheckpointState({ ...after, profiles: after.profiles.filter(item => item.id !== row.id),
    staff_audits: after.staff_audits.filter(audit => existingIds.has(audit.id)) },
  { ...before, profiles: before.profiles.filter(item => item.id !== row.id) });
}

export async function executeContinuation({ plan, baseline, business, defaults, checkpoint, journal, dispatch, gate }) {
  let confirmed = await checkpoint('admission', 'HOMOLOGATION');
  compareCheckpointState(confirmed, baseline);
  assert.equal(confirmed.employee_link_conflicts, 0);
  const ordered = values => values.slice().sort((a, b) => `${a.role}:${a.permission_key}`.localeCompare(`${b.role}:${b.permission_key}`));
  assert.deepEqual(ordered(confirmed.role_defaults), ordered(defaults));
  assert.deepEqual(confirmed.staff_contracts, plan.staff_live_contracts);
  journal.save('restore-budget.json', { Edge_reserved_for_restoration: 2, PATCH: 0 });
  let uncertain = false;
  let readCount = 0;
  const readLimit = Object.values(plan.authenticated_read_plan).flat().length;
  let deterministicStop = null;
  let stage = 'admission';
  async function readGroup(name) {
    for (const check of plan.authenticated_read_plan[name]) {
      gate('HOMOLOGATION');
      assert(++readCount <= readLimit && readLimit <= 56);
      journal.save(`GET-${readCount}-intent.json`, { id: check.id, actor: check.actor, path: check.path });
      let response;
      try { response = await dispatch(check.actor, 'GET', check.path, undefined, 'HOMOLOGATION'); } catch {}
      const salary = check.expect.salary_state;
      const indicator = salary && response?.http === 200
        ? staffSalaryIndicator(response.value, business, check.expect.employee_id) : null;
      const passed = response?.http === 200 && (salary ? indicator === salary : validateRead(check, response.value, business));
      journal.save(`GET-${readCount}-result.json`, { id: check.id, http: response?.http ?? null, passed,
        ...(salary ? { salary_indicator: indicator } : {}) });
      if (!passed) return false;
    }
    return true;
  }
  async function runCase(step, phase) {
    stage = step.id;
    gate(phase);
    const before = await checkpoint(`${step.id}-before`, phase);
    compareCheckpointState(before, confirmed);
    const actual = before.profiles.find(row => row.id === step.target_id);
    const values = Object.fromEntries(profileFields.map(field => [field, actual[field]]));
    if (phase === 'RECOVERY') {
      if (actual.active === false) {
        assert.deepEqual(values, step.expected_after, 'INACTIVE_PROFILE_DRIFT');
        journal.save(`${step.id}-skipped.json`, { already_restored: true });
        return true;
      }
      assert(step.allowed_before_states.some(state => isDeepStrictEqual(state, values)), 'RESTORATION_STATE_DRIFT');
    } else assert.deepEqual(values, step.before, 'BEFORE_PROFILE_DRIFT');
    requireCurrentCheckpoint(before);
    journal.save(`${step.id}-intent.json`, { actor: step.actor, path: step.path, target: step.target_id,
      payload_sha256: sha256(JSON.stringify(step.payload)), before_sha256: sha256(JSON.stringify(before)) });
    gate(phase);
    journal.save(`${step.id}-reservation.json`, { Edge: 1, PATCH: 0, no_retry: true });
    gate(phase);
    requireCurrentCheckpoint(before);
    let receipt;
    uncertain = true;
    const sentUtc = Date.now();
    try { receipt = await dispatch(step.actor, 'POST', step.path, step.payload, phase); } catch {}
    const success = receipt?.http === 200 && receipt.value?.ok === true &&
      validStaffProfileReceipt(receipt.value.user, step.target_id, step.expected_after.business_id, parseStaffRequest(step.payload));
    const knownDenied = receipt?.value?.ok === false && (receipt.http === 403 && receipt.value.code === 'STAFF_ACCESS_DENIED' ||
      receipt.http === 409 && receipt.value.code === 'PROFILE_OPERATION_REJECTED') && receipt.value.reconciliation_required !== true;
    const passed = receipt?.http === step.expected_status && (success || knownDenied && receipt.value.code === step.expected_code);
    journal.save(`${step.id}-result.json`, { id: step.id, http: receipt?.http ?? null, passed, forwarding_attempts: 1,
      result_uncertain: !success && !knownDenied || success && !passed });
    if (!passed && !knownDenied) throw Error('CONTINUATION_RESULT_UNCERTAIN');
    const after = await checkpoint(`${step.id}-after`, phase);
    assert(Date.parse(after.observed_utc) >= sentUtc, 'AFTER_CHECKPOINT_PREDATES_SEND');
    if (passed) verifyDelta(before, after, step, business);
    else compareCheckpointState(after, before);
    confirmed = after;
    uncertain = false;
    journal.save(`${step.id}-ack.json`, { passed, reconciled: true, audits: passed ? step.expected_audits_inserted : 0 });
    return passed;
  }
  try {
    try {
      for (const step of [...plan.setup, ...plan.steps]) {
        stage = step.id;
        const group = readBefore[step.id];
        if (group && !await readGroup(group)) { deterministicStop = group; break; }
        if (!await runCase(step, 'HOMOLOGATION')) { deterministicStop = step.id; break; }
      }
    } catch (error) {
      if (uncertain || error.message !== 'WINDOW_MARGIN_REJECTED') throw error;
      deterministicStop = stage;
    }
    if (deterministicStop) journal.save('business-stopped.json', { stage: deterministicStop, confirmed_prefix: true });
    for (const step of plan.recovery) assert(await runCase(step, 'RECOVERY'), 'RESTORATION_STOPPED');
    assert.deepEqual(confirmed.profiles.map(row => Object.fromEntries(profileFields.map(key => [key, row[key]]))).sort((a,b)=>a.id.localeCompare(b.id)),
      plan.current.profiles.slice().sort((a,b)=>a.id.localeCompare(b.id)));
    for (const profile of confirmed.profiles) assert.equal(profile.semantic_md5_excluding_updated_at,
      baseline.profiles.find(original => original.id === profile.id).semantic_md5_excluding_updated_at, 'FINAL_SEMANTIC_PROFILE_DRIFT');
    const expectedAudits = [...plan.setup, ...plan.steps, ...plan.recovery].reduce((total, step) => total + step.expected_audits_inserted, 0);
    if (!deterministicStop) assert.equal(confirmed.staff_audits.length, baseline.staff_audits.length + expectedAudits);
    journal.save('closed.json', { passed: !deterministicStop, restored: true, audits: confirmed.staff_audits.length, permission_GETs: readCount });
  } catch (error) {
    journal.save('stop.json', { stage, result_uncertain: uncertain, no_retry: true });
    if (uncertain) {
      try { await checkpoint('reconcile-only', 'RECOVERY'); } catch {}
    }
    throw error;
  }
}

function publicKey() {
  const env = {};
  for (const line of fs.readFileSync(path.join(repo, '.env.local'), 'utf8').split(/\r?\n/)) {
    const match = /^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  assert.equal(env.VITE_SUPABASE_URL?.replace(/\/$/, ''), ORIGIN);
  return publicKeyForTest(env.VITE_SUPABASE_ANON_KEY);
}

export async function loadContinuation(workspace, manifestSha, { salaryRevision = false } = {}) {
  const dir = path.join(workspace, packageDir);
  const manifestFile = path.join(dir, salaryRevision ? 'manifesto-executor-salary-review.json' : 'manifesto-executor.json');
  assert(/^[a-f0-9]{64}$/.test(manifestSha) && digest(manifestFile) === manifestSha, 'EXECUTOR_MANIFEST_DRIFT');
  const manifest = readJson(manifestFile);
  const required = ['checkpoint-continuacao.sql', 'controlador-leituras-candidato.mjs',
    'manifesto.json', 'plano-continuacao.json', 'prova-employees-inativos.json'];
  if (salaryRevision) required.push('complemento-auth-senhas.json', 'manifesto-executor.json', 'plano-salary-review.json');
  assert.deepEqual(Object.keys(manifest.package_files).sort(), required.sort());
  const verify = () => {
    assert.equal(digest(manifestFile), manifestSha);
    for (const [name, hash] of Object.entries(manifest.package_files)) assert.equal(digest(path.join(dir, name)), hash, 'PACKAGE_FILE_DRIFT');
    for (const [name, hash] of Object.entries(manifest.code_files)) assert.equal(digest(path.join(repo, name)), hash, 'CODE_FILE_DRIFT');
    for (const [name, hash] of Object.entries(manifest.history_files)) assert.equal(digest(path.join(workspace, name)), hash, 'HISTORY_FILE_DRIFT');
  };
  assert.equal(manifest.project, PROJECT);
  assert(Object.hasOwn(manifest.code_files, 'qa/staff-continuation.mjs') &&
    Object.hasOwn(manifest.code_files, 'qa/staff-continuation-input.mjs'), 'EXECUTOR_HASHES_REQUIRED');
  verify();
  const originalDir = path.join(workspace, 'outputs/staff-business-homologation-review-20261104');
  const original = readJson(path.join(originalDir, 'plano-operacoes.json'));
  const defaults = readJson(path.join(originalDir, 'estado-inicial-sanitizado.json')).detail.role_defaults;
  const baseline = readJson(path.join(workspace, recoveryDir, 'R4-after.json'));
  const plan = readJson(path.join(dir, 'plano-continuacao.json'));
  const proof = readJson(path.join(dir, 'prova-employees-inativos.json'));
  assert(proof.status === 'PASS' && proof.employees_unchanged === true && proof.audit_delta === 9 &&
    proof.staff_rpc_md5 === plan.staff_live_contracts.find(contract => contract.name === 'fn_manage_staff_profile').md5);
  assert.deepEqual(proof.tested.map(({ id, status }) => [id, status]),
    [...plan.setup, ...plan.steps, ...plan.recovery].map(step => [step.id, step.expected_status]));
  const { readPlan } = await import(pathToFileURL(path.join(dir, 'controlador-leituras-candidato.mjs')).href);
  validatePlan(plan, original, defaults, readPlan, baseline);
  const oldReads = readJson(path.join(workspace, historicalDir, 'reads-baseline-result.json'));
  const generated = readPlan(original, 'baseline', defaults);
  assert.equal(oldReads.results.length, 24);
  assert.equal(oldReads.results[23].status, 400);
  for (const [i, receipt] of oldReads.results.slice(0, 23).entries()) {
    const check = generated[i];
    const value = Object.hasOwn(check.expect, 'salary_visible') && Array.isArray(receipt.value)
      ? receipt.value.map(row => ({ ...row, hourly_rate: row.hourly_rate_visible ? 1 : null })) : receipt.value;
    assert(receipt.id === check.id && receipt.status === 200 && validateRead(check, value, original.business_A));
  }
  if (salaryRevision) {
    const closed = path.join(workspace, 'work/staff-user-service/staff-permissions-continuation-password-20261112');
    const closedState = readJson(path.join(closed, 'closed.json'));
    assert.deepEqual(closedState, { passed: false, restored: true, audits: 8, permission_GETs: 25 });
    const restored = readJson(path.join(closed, 'SQL-09-checkpoint.json'));
    assert.equal(restored.staff_audits.length, 8);
    assert.deepEqual(restored.employees, baseline.employees);
    assert.deepEqual(restored.role_defaults, readJson(path.join(closed, 'SQL-01-checkpoint.json')).role_defaults);
    assert.deepEqual(restored.staff_contracts, plan.staff_live_contracts);
    const completed = Array.from({ length: 25 }, (_, i) => {
      const { id, actor, path: route } = plan.authenticated_read_plan.baseline[i];
      assert.deepEqual(readJson(path.join(closed, `GET-${i+1}-intent.json`)), { id, actor, path: route });
      return readJson(path.join(closed, `GET-${i+1}-result.json`));
    });
    const revised = buildStaffSalaryRevision(plan, restored, completed);
    assert.deepEqual(revised, readJson(path.join(dir, 'plano-salary-review.json')));
    assert.deepEqual(manifest.revision_budget, { Edge_original_cases: 13, Edge_additional: 4, Edge_restore_reserved: 2, PATCH: 0,
      GET_authenticated_total: 37, SQL_read_only: 36 });
    return { plan: revised, baseline: restored, business: original.business_A, defaults, verify, manifest };
  }
  return { plan, baseline, business: original.business_A, defaults, verify, manifest };
}

async function main(manifestSha, approvalSha) {
  for (const key of ['NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'NODE_USE_ENV_PROXY', 'SSLKEYLOGFILE']) {
    assert(!Object.hasOwn(process.env, key));
  }
  const workspace = process.cwd();
  const bundle = await loadContinuation(workspace, manifestSha);
  const journal = openJournal(path.join(workspace, continuationJournalDir));
  assert.deepEqual(journal.names().sort(), ['approval.json', 'edge-admission.json']);
  assert(/^[a-f0-9]{64}$/.test(approvalSha) && journal.hash('approval.json') === approvalSha);
  const approval = journal.read('approval.json');
  const window = scopeApproval(approval, manifestSha);
  const edge = journal.read('edge-admission.json');
  assert.equal(journal.hash('edge-admission.json'), approval.edge_admission_sha256);
  assert(edge.project === PROJECT && edge.edge_id === '9dad0ab5-fd65-43da-be56-da79c3cec5ba' && edge.edge_version === 6 &&
    edge.status === 'ACTIVE' && edge.verify_jwt === true && edge.edge_bundle_sha256 === bundle.manifest.edge.bundle_sha256 &&
    Date.parse(edge.observed_utc) >= window.start && Date.parse(edge.observed_utc) <= Date.now(), 'EDGE_ADMISSION_DRIFT');
  assert.deepEqual(edge.source_sha256, bundle.manifest.edge.source_sha256, 'EDGE_SOURCES_DRIFT');
  const gate = phase => {
    bundle.verify();
    assert.equal(journal.hash('approval.json'), approvalSha);
    assert.equal(journal.hash('edge-admission.json'), approval.edge_admission_sha256);
    assert(!journal.exists('stop.json') || phase === 'RECONCILE', 'CONTINUATION_STOPPED');
    return requestTimeout(window, phase === 'RECONCILE' ? 'RECOVERY' : phase);
  };
  gate('HOMOLOGATION');
  const key = publicKey();
  journal.save('lock.json', { pid: process.pid, approval_sha256: approvalSha });
  let tokens;
  try {
    tokens = await collectContinuationTokens({ deadline: window.cutoff - 25_000, onReady: url => console.log(url),
      onAccepted: () => journal.save('collection-receipt.json', { received_utc: new Date().toISOString(), pid: process.pid }) });
    const sessionIds = new Set();
    for (const [actor, id] of Object.entries(ACTORS)) {
      const claims = JSON.parse(Buffer.from(tokens[actor].split('.')[1], 'base64url').toString('utf8'));
      assert(claims.sub === id && claims.iss === ORIGIN + '/auth/v1' && claims.role === 'authenticated' && claims.aud === 'authenticated' &&
        Number.isSafeInteger(claims.exp) && claims.exp * 1000 > window.end + 30_000 && typeof claims.session_id === 'string' && claims.session_id,
      'TOKEN_IDENTITY_OR_EXPIRY');
      sessionIds.add(claims.session_id.toLowerCase());
    }
    assert.equal(sessionIds.size, 3, 'SESSIONS_NOT_INDEPENDENT');
    for (const [actor, id] of Object.entries(ACTORS)) {
      journal.save(`identity-${actor}-intent.json`, { actor });
      const response = await requestTestAuth({ method: 'GET', path: '/auth/v1/user', headers: { apikey: key, Authorization: 'Bearer ' + tokens[actor] },
        timeout: gate('HOMOLOGATION') });
      const passed = response.status === 200 && response.value?.id === id && response.value?.role === 'authenticated' && !response.value?.is_anonymous;
      journal.save(`identity-${actor}-result.json`, { actor, http: response.status, passed });
      assert(passed, 'IDENTITY_READ_FAILED');
    }
    journal.save('ready.json', { pid: process.pid, identities_confirmed: 3 });
    let reads = 0;
    const checkpoint = async (label, phase) => {
      assert(++reads <= (label === 'reconcile-only' ? 36 : 35), 'SQL_BUDGET_EXHAUSTED');
      const executionPhase = label === 'reconcile-only' ? 'RECONCILE' : phase;
      gate(executionPhase);
      const name = `SQL-${String(reads).padStart(2, '0')}`;
      const requestedUtc = new Date().toISOString();
      journal.save(`${name}-request.json`, { label, query_sha256: bundle.manifest.package_files['checkpoint-continuacao.sql'],
        requested_utc: requestedUtc });
      while (!journal.exists(`${name}-checkpoint.json`)) { gate(executionPhase); await delay(200); }
      const result = journal.read(`${name}-checkpoint.json`);
      requireCurrentCheckpoint(result);
      assert(Date.parse(result.observed_utc) >= Date.parse(requestedUtc), 'SQL_CHECKPOINT_PREDATES_REQUEST');
      return result;
    };
    const dispatch = async (actor, method, url, payload, phase) => {
      const response = await fetch(new URL(url, ORIGIN), { method, redirect: 'error', signal: AbortSignal.timeout(gate(phase)),
        headers: { apikey: key, Authorization: 'Bearer ' + tokens[actor], Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' },
        body: payload === undefined ? undefined : JSON.stringify(payload) });
      const value = await response.json().catch(() => null);
      return { http: response.status, value };
    };
    await executeContinuation({ ...bundle, checkpoint, journal, dispatch, gate });
    console.log(journal.read('closed.json').passed ? 'STAFF_CONTINUATION_PASS' : 'STAFF_CONTINUATION_RESTORED_AFTER_STOP');
  } finally {
    if (tokens) for (const actor of Object.keys(tokens)) delete tokens[actor];
    journal.save('ended.json', { pid: process.pid, utc: new Date().toISOString() });
  }
}

async function recordCheckpoint(manifestSha, name) {
  assert(/^SQL-(?:0[1-9]|[12]\d|3[0-6])$/.test(name), 'SQL_CHECKPOINT_NAME_SCOPE');
  const workspace = process.cwd();
  const { manifest, verify } = await loadContinuation(workspace, manifestSha);
  const dir = path.join(workspace, continuationJournalDir);
  const journal = openJournal(dir);
  const approval = journal.read('approval.json');
  const window = scopeApproval(approval, manifestSha);
  const request = journal.read(`${name}-request.json`);
  assert(journal.hash('approval.json') === journal.read('lock.json').approval_sha256 && !journal.exists('ended.json') &&
    (!journal.exists('stop.json') || request.label === 'reconcile-only') &&
    request.query_sha256 === manifest.package_files['checkpoint-continuacao.sql']);
  const phase = request.label === 'reconcile-only' || request.label.startsWith('RESTAURAR-') ? 'RECOVERY' : 'HOMOLOGATION';
  requestTimeout(window, phase);
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
    assert(raw.length <= 100_000, 'SQL_CHECKPOINT_INPUT_LIMIT');
  }
  const checkpoint = JSON.parse(raw);
  verify();
  requestTimeout(window, phase);
  requireCurrentCheckpoint(checkpoint);
  assert(Date.parse(checkpoint.observed_utc) >= Date.parse(request.requested_utc), 'SQL_CHECKPOINT_PREDATES_REQUEST');
  const file = `${name}-checkpoint.json`;
  assert(!journal.exists(file), 'SQL_CHECKPOINT_ALREADY_RECORDED');
  journal.save(`${file}.tmp`, checkpoint);
  fs.renameSync(path.join(dir, `${file}.tmp`), path.join(dir, file));
  console.log(`${name}_CHECKPOINT_RECORDED`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--checkpoint') {
      assert.equal(process.argv.length, 5);
      await recordCheckpoint(process.argv[3], process.argv[4]);
    } else {
      assert.equal(process.argv.length, 4);
      await main(process.argv[2], process.argv[3]);
    }
  }
  catch (error) {
    const code = /^[A-Z0-9_]{4,100}$/.test(error?.message ?? '') ? error.message : 'STAFF_CONTINUATION_BLOCKED';
    console.error(code);
    process.exitCode = 2;
  }
}
