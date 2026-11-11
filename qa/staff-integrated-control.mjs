import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MANIFEST, requestTimeout, sha256, verifyWindow } from './staff-integrated-business.mjs';
import { assertReadyProcess, executionRecords, openJournal, waitForResult } from './staff-integrated-run.mjs';

const root = process.cwd();
const journalPath = path.join(root, 'work/staff-user-service/business-run-20261107-0410');
const pkg = path.join(root, 'outputs/staff-business-homologation-review-20261104');
const journal = openJournal(journalPath);
const records = executionRecords(journal.read('staff-integrated-approval.json'));
const load = name => fs.readFileSync(path.join(pkg, name));
const same = (row, expected) => Object.entries(expected).every(([key, value]) => JSON.stringify(row?.[key]) === JSON.stringify(value));

function writeCommand(id, value) {
  const file = 'command-' + id + '.json';
  assertReadyProcess(journal, records);
  assert(!journal.exists('STOP.json') && !journal.exists('CLOSE.json') && !journal.exists('native-ended.json'), 'BATCH_CLOSED');
  assert(!journal.exists(file) && !journal.names().some(name =>
    /^command-[A-Za-z0-9_-]+\.json$/.test(name) && !journal.exists(name.slice(8, -5) + '-result.json')), 'PENDING_OR_REPEATED_COMMAND');
  journal.save(file + '.tmp', value);
  fs.renameSync(path.join(journalPath, file + '.tmp'), path.join(journalPath, file));
}

function checkExpected(plan, checkpoint, index) {
  const users = structuredClone(plan.actors);
  const employees = structuredClone(plan.existing_employees);
  for (const step of plan.steps.slice(0, index)) {
    if (step.method === 'POST' && step.expected_user_rows_updated === 1) users[step.target] = step.expected_after;
    if (step.method === 'PATCH') {
      const key = Object.keys(employees).find(key => employees[key].id === step.target_id);
      employees[key] = step.expected_after;
    }
  }
  for (const expected of Object.values(users)) assert(same(checkpoint.profiles.find(row => row.id === expected.id), expected), 'PROFILE_STATE_DRIFT');
  for (const expected of Object.values(employees)) assert(same(checkpoint.employees.find(row => row.id === expected.id), expected), 'EMPLOYEE_STATE_DRIFT');
}

function verifyCase(plan, step, result, before, after) {
  assert(result.passed && result.result_uncertain === false, 'CASE_RESULT_NOT_PASS');
  checkExpected(plan, after, plan.steps.indexOf(step) + 1);
  for (const table of ['profiles', 'employees']) {
    for (const row of before[table]) {
      const current = after[table].find(value => value.id === row.id);
      assert(current);
      const changed = (table === 'profiles' && step.expected_user_rows_updated === 1 ||
        table === 'employees' && step.expected_employee_rows_updated === 1) && row.id === step.target_id;
      if (!changed) assert.deepEqual(current, row, 'UNRELATED_ROW_OR_NEGATIVE_SIDE_EFFECT');
      else assert.notEqual(current.updated_at, row.updated_at, 'EXPECTED_UPDATE_NOT_PERSISTED');
    }
  }
  const oldIds = new Set(before.staff_audits.map(row => row.id));
  const newIds = new Set(after.staff_audits.map(row => row.id));
  for (const id of oldIds) assert(newIds.has(id), 'AUDIT_REMOVED');
  const delta = after.staff_audits.filter(row => !oldIds.has(row.id));
  assert.equal(delta.length, step.expected_audits_inserted, 'AUDIT_DELTA_MISMATCH');
  if (delta.length) {
    const audit = delta[0];
    assert.equal(audit.user_id, step.actor_id);
    assert.equal(audit.business_id, plan.business_A);
    assert.equal(audit.action, 'Staff User Updated');
    assert.equal(audit.role_snapshot, plan.actors[step.actor].role);
    assert.equal(audit.details, step.target_id + ' · ' + step.expected_after.role + ' · active=' + step.expected_after.active);
  }
  return delta.length;
}

function readPlan(plan, phase) {
  const reads = [];
  const add = (id, actor, path, expect) => reads.push({ id, actor, path, expect });
  const columns = 'id,business_id,role,active,employee_id,permission_overrides';
  const users = (actor, target, id, rows) => add(id, actor, '/rest/v1/users?select=' + columns + '&id=eq.' + plan.actors[target].id, { rows });
  if (phase === 'owner') {
    users('OWNER_A', 'OWNER_A', 'OWNER_A-self', 1);
  } else if (phase === 'baseline') {
    const snapshot = JSON.parse(load('estado-inicial-sanitizado.json'));
    const defaults = snapshot.detail.role_defaults;
    const keys = [...new Set(defaults.map(item => item.permission_key))];
    assert.equal(keys.length, 20);
    for (const actor of ['OWNER_A', 'MANAGER', 'EMPLOYEE']) {
      if (actor !== 'OWNER_A') users(actor, actor, actor + '-self', 1);
      for (const key of keys) {
        const allowed = actor === 'OWNER_A' || defaults.find(item => item.role === actor && item.permission_key === key).granted;
        add(actor + '-permission-' + key, actor, '/rest/v1/rpc/user_can?p_permission_key=' + encodeURIComponent(key), { boolean: allowed });
      }
      users(actor, actor === 'MANAGER' ? 'EMPLOYEE' : 'MANAGER', actor + '-other', actor === 'OWNER_A' ? 1 : 0);
      users(actor, 'OWNER_B', actor + '-foreign', 0);
      add(actor + '-salary', actor, '/rest/v1/rpc/fn_read_employees_secure?select=id,business_id,hourly_rate&id=eq.30000000-0000-4000-8000-000000000003', { rows: 1, salary_visible: actor !== 'EMPLOYEE' });
      add(actor + '-foreign-employee', actor, '/rest/v1/rpc/fn_read_employees_secure?select=id,business_id&business_id=eq.' + plan.business_B +
        '&id=eq.' + plan.employee_QA_B_read_only_canary, { rows: 0 });
    }
    assert.equal(reads.length, 74);
  } else if (phase === 'grant') {
    add('manager-permission-granted', 'MANAGER', '/rest/v1/rpc/user_can?p_permission_key=manageUsers', { boolean: true });
    users('MANAGER', 'EMPLOYEE', 'manager-sees-employee', 1);
    users('MANAGER', 'OWNER_B', 'manager-no-foreign', 0);
  } else if (phase === 'revoke') {
    add('manager-permission-revoked', 'MANAGER', '/rest/v1/rpc/user_can?p_permission_key=manageUsers', { boolean: false });
    users('MANAGER', 'EMPLOYEE', 'manager-no-other-after-revoke', 0);
  } else throw new Error('UNKNOWN_READ_STAGE');
  return reads;
}

function verifyReads(plan, expected, actual) {
  assert.equal(actual.results.length, expected.length);
  for (const [i, check] of expected.entries()) {
    const receipt = actual.results[i];
    assert.equal(receipt.id, check.id);
    assert.equal(receipt.status, 200);
    if (Object.hasOwn(check.expect, 'boolean')) assert.equal(receipt.value, check.expect.boolean);
    else {
      assert(Array.isArray(receipt.value));
      assert.equal(receipt.value.length, check.expect.rows);
      for (const row of receipt.value) assert.equal(row.business_id, plan.business_A);
      if (check.expect.rows && check.id.endsWith('-self')) assert.equal(receipt.value[0].id, plan.actors[check.actor].id);
      if (Object.hasOwn(check.expect, 'salary_visible')) assert.equal(receipt.value[0].hourly_rate_visible, check.expect.salary_visible);
    }
  }
}

async function main() {
  assert.equal(sha256(load('manifesto.json')), MANIFEST);
  const manifest = JSON.parse(load('manifesto.json'));
  for (const name of ['plano-operacoes.json', 'estado-inicial-sanitizado.json']) {
    const file = manifest.artifacts.find(item => item.path === name);
    assert(file && sha256(load(name)) === file.sha256_bytes, 'CONTROL_PACKAGE_DRIFT');
  }
  const plan = JSON.parse(load('plano-operacoes.json'));
  const window = verifyWindow(journal.read('staff-integrated-window.json'));
  const [mode, id, afterName, beforeName] = process.argv.slice(2);
  assert(typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id), 'CONTROL_ID_SCOPE');
  if (mode === 'prepare') {
    const step = plan.steps.find(item => item.id === id);
    assert(step);
    requestTimeout(window, step.phase);
    const checkpoint = journal.read(afterName);
    const age = Date.now() - Date.parse(checkpoint.observed_utc);
    assert(age >= 0 && age < 45000, 'CHECKPOINT_STALE_OR_FUTURE');
    checkExpected(plan, checkpoint, plan.steps.indexOf(step));
    writeCommand(id, { id, mode: 'case', checkpoint_file: afterName, checkpoint_sha256: journal.hash(afterName) });
    return { status: 'CASE_COMMAND_RESERVED', id };
  }
  if (mode === 'verify') {
    const step = plan.steps.find(item => item.id === id);
    assert(step);
    const result = journal.read(id + '-result.json');
    const audits = verifyCase(plan, step, result, journal.read(beforeName), journal.read(afterName));
    journal.save(id + '-ack.json', {
      id, passed: true, read_only_reconciled: true, forwarding_attempts: result.forwarding_attempts, audits_inserted: audits,
      checkpoint_before: beforeName, checkpoint_after: afterName, utc: new Date().toISOString(),
    });
    return { status: 'PASS_CASE_HTTP_STATE_AND_AUDIT', id, audits };
  }
  if (mode === 'reads') {
    requestTimeout(window, 'HOMOLOGATION');
    const reads = readPlan(plan, id);
    const name = 'reads-' + id;
    journal.save(name + '-expected.json', reads);
    writeCommand(name, { id: name, mode: 'reads', reads: reads.map(({ expect, ...request }) => request) });
    return { status: 'READ_STAGE_REQUESTED', phase: id, requests: reads.length };
  }
  if (mode === 'verify-reads') {
    const name = 'reads-' + id;
    const expected = readPlan(plan, id);
    assert.deepEqual(journal.read(name + '-expected.json'), expected);
    const actual = journal.read(name + '-result.json');
    verifyReads(plan, expected, actual);
    journal.save(name + '-ack.json', { stage: id, passed: true, checks: expected.length, GETs_total: actual.GETs, utc: new Date().toISOString() });
    return { status: 'PASS_AUTHENTICATED_READ_STAGE', phase: id, checks: expected.length };
  }
  if (mode === 'wait') {
    const name = id + '-result.json';
    const until = Date.now() + 24000;
    if (!await waitForResult(journal, records, name, until)) return { status: 'NO_RESULT', id };
    const result = journal.read(name);
    return result.mode === 'reads' ? { status: 'READ_RESULT_READY', id, count: result.results.length } : result;
  }
  throw new Error('CONTROL_MODE_DENIED');
}

try { console.log(JSON.stringify(await main())); }
catch { console.error('INTEGRATED_CONTROL_BLOCKED'); process.exitCode = 2; }
