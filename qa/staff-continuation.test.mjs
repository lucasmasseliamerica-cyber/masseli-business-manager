import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, test } from 'node:test';
import { collectContinuationTokens } from './staff-continuation-input.mjs';
import { continuationJournalDir, executeContinuation, loadContinuation, scopeApproval, validatePlan } from './staff-continuation.mjs';
import { openJournal } from './staff-integrated-run.mjs';

const root = process.env.NEXALVO_CONTINUATION_WORKSPACE;
const digest = process.env.NEXALVO_CONTINUATION_MANIFEST;
const fields = ['id', 'business_id', 'name', 'username', 'role', 'employee_id', 'active', 'permission_overrides'];

function syntheticRun(bundle, behavior = {}) {
  const { plan, baseline, business, defaults } = bundle;
  const state = structuredClone(baseline);
  state.role_defaults = structuredClone(defaults);
  state.staff_contracts = structuredClone(plan.staff_live_contracts);
  state.employee_link_conflicts = 0;
  const records = new Map();
  const calls = { posts: [], gets: [], sql: [] };
  const steps = [...plan.setup, ...plan.steps];
  const reads = Object.values(plan.authenticated_read_plan).flat();
  const save = (name, value) => {
    assert(!records.has(name), 'duplicate artifact');
    records.set(name, value);
  };
  const checkpoint = async label => {
    calls.sql.push(label);
    return { ...structuredClone(state), observed_utc: new Date().toISOString() };
  };
  const dispatch = async (actor, method, url, payload) => {
    if (method === 'GET') {
      const check = reads[calls.gets.length];
      assert.deepEqual([actor, url, payload], [check.actor, check.path, undefined]);
      calls.gets.push(check.id);
      if (Object.hasOwn(check.expect, 'boolean')) return { http: 200, value: check.expect.boolean };
      const id = new URL(url, 'https://test.invalid').searchParams.get('id').slice(3);
      if (check.expect.salary_state) return { http: 200, value: check.expect.salary_state === 'empty' ? [] :
        [{ id, business_id: business, hourly_rate: check.expect.salary_state === 'null' ? null : 1 }] };
      return { http: 200, value: check.expect.rows === 0 ? [] : [{ id, business_id: business,
        hourly_rate: check.expect.salary_visible === false ? null : 1 }] };
    }
    assert.equal(method, 'POST');
    const pending = [...steps, ...plan.recovery].find(step => !calls.posts.includes(step.id) &&
      records.has(step.id + '-reservation.json'));
    assert(pending);
    assert.deepEqual([actor, url, payload], [pending.actor, pending.path, pending.payload]);
    assert.equal(records.get('restore-budget.json').Edge_reserved_for_restoration, 2);
    assert(records.has(pending.id + '-intent.json'));
    calls.posts.push(pending.id);
    if (pending.id === behavior.uncertain) throw Error('simulated missing receipt');
    if (pending.id === behavior.denied) return { http: 403, value: { ok: false, code: 'STAFF_ACCESS_DENIED' } };
    if (pending.expected_status !== 200) return { http: pending.expected_status, value: { ok: false, code: pending.expected_code } };
    const target = state.profiles.find(profile => profile.id === pending.target_id);
    const actorRole = state.profiles.find(profile => profile.id === pending.actor_id).role;
    Object.assign(target, pending.expected_after, { updated_at: new Date(Date.now() + calls.posts.length).toISOString() });
    const original = baseline.profiles.find(profile => profile.id === pending.target_id);
    target.semantic_md5_excluding_updated_at = fields.every(field =>
      JSON.stringify(target[field]) === JSON.stringify(original[field])) ? original.semantic_md5_excluding_updated_at : 'synthetic-update';
    state.staff_audits.push({ id: 'synthetic-' + calls.posts.length, business_id: business, user_id: pending.actor_id,
      role_snapshot: actorRole, action: 'Staff User Updated', details: pending.target_id + ' · ' + target.role + ' · active=' + target.active,
      occurred_at: target.updated_at });
    return { http: 200, value: { ok: true, user: { ...target } } };
  };
  return { records, calls, state, run: () => executeContinuation({ ...bundle, checkpoint, dispatch, journal: { save }, gate() {} }) };
}

test('coleta mascarada só devolve 204 após gravar o recibo sanitizado', async () => {
  let ready, accepted = 0;
  const urlReady = new Promise(resolve => { ready = resolve; });
  const collecting = collectContinuationTokens({ deadline: Date.now() + 5000, onReady: ready, onAccepted: () => accepted++ });
  const url = await urlReady;
  const origin = new URL(url).origin;
  const html = await (await fetch(url)).text();
  assert.equal((html.match(/type="password"/g) ?? []).length, 3);
  const tokens = { OWNER_A: 'abc.def.ghi', MANAGER: 'abc.def.xyz', EMPLOYEE: 'abc.def.tuv' };
  const request = { method: 'POST', headers: { Origin: 'https://other.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify(tokens) };
  assert.equal((await fetch(url, request)).status, 403);
  assert.equal(accepted, 0);
  request.headers.Origin = origin;
  assert.equal((await fetch(url, request)).status, 204);
  assert.equal(accepted, 1);
  assert.deepEqual(await collecting, tokens);
});

test('salary review: corrected predicates run on the restored eight-audit checkpoint', {
  skip: !root || !process.env.NEXALVO_SALARY_REVIEW_MANIFEST,
}, async () => {
  const data = await loadContinuation(root, process.env.NEXALVO_SALARY_REVIEW_MANIFEST, { salaryRevision: true });
  const run = syntheticRun(data);
  await run.run();
  assert.equal(run.calls.posts.length, 17);
  assert.equal(run.calls.sql.length, 35);
  assert.equal(run.calls.gets.length, 34);
  assert.equal(run.records.get('closed.json').audits, 17);
  assert.deepEqual([...run.records.values()].filter(value => value.salary_indicator).map(value => [value.id, value.salary_indicator]),
    [['MANAGER-salary','exposed'],['MANAGER-salary-unrelated','empty'],['EMPLOYEE-salary','null'],['EMPLOYEE-salary-unrelated','empty']]);
  assert([...run.records.values()].filter(value => value.salary_indicator).every(value => !Object.hasOwn(value, 'hourly_rate')));
});

describe('pacote exato, sem acesso remoto', { skip: !root || !digest }, () => {
  const bundle = () => loadContinuation(root, digest);

  test('vincula os 23 recibos e bloqueia filtro ou UUID ausente', async () => {
    const { plan, baseline, defaults } = await bundle();
    const original = JSON.parse(fs.readFileSync(path.join(root, 'outputs/staff-business-homologation-review-20261104/plano-operacoes.json')));
    const { readPlan } = await import(pathToFileURL(path.join(root,
      'outputs/staff-permissions-continuation-review-20261111/controlador-leituras-candidato.mjs')).href);
    const missing = { ...original };
    delete missing.business_B_canary;
    assert.throws(() => validatePlan(plan, missing, defaults, readPlan, baseline), /REQUIRED_PLAN_UUID/);
    assert.throws(() => validatePlan(plan, { ...original, business_B_canary: original.business_A }, defaults, readPlan, baseline),
      /COMPANY_SCOPE_COLLISION/);
    assert.throws(() => validatePlan(plan, original, defaults.slice(1), readPlan, baseline), /PERMISSION_DEFAULTS_COUNT/);
    const invalid = structuredClone(plan);
    const check = invalid.authenticated_read_plan.baseline.find(row => row.id === 'OWNER_A-foreign-employee');
    check.path = check.path.replace(original.business_B_canary, 'undefined');
    assert.throws(() => validatePlan(invalid, original, defaults, readPlan, baseline), /READ_PLAN_DRIFT/);
    await assert.rejects(loadContinuation(root, 'f'.repeat(64)), /EXECUTOR_MANIFEST_DRIFT/);
  });

  test('exige o complemento e reserva dez minutos para restauração', async () => {
    const { plan } = await bundle();
    const approval = { project: plan.project, manifest_sha256: digest, exclusive_confirmed: true,
      additional_scope_confirmed: true, stop_on_uncertainty_no_retry: true,
      start_utc: '2026-11-11T21:00:00Z', cutoff_utc: '2026-11-11T21:35:00Z', end_utc: '2026-11-11T21:45:00Z',
      budget: { Edge_original_cases: 13, Edge_additional: 4, Edge_restore_reserved: 2, PATCH: 0,
        GET_authenticated_additional: 4, GET_authenticated_total: 59, SQL_read_only: 36 } };
    assert.equal(scopeApproval(approval, digest).end - scopeApproval(approval, digest).cutoff, 600_000);
    assert.throws(() => scopeApproval({ ...approval, additional_scope_confirmed: false }, digest), /CONTINUATION_APPROVAL_REQUIRED/);
    assert.throws(() => scopeApproval({ ...approval, budget: { ...approval.budget, Edge_restore_reserved: 0 } }, digest));
    assert.throws(() => scopeApproval({ ...approval, cutoff_utc: '2026-11-11T21:41:00Z' }, digest), /CONTINUATION_WINDOW_SCOPE/);
  });

  test('CLI de checkpoint exige pedido e lock, aceita uma entrega e bloqueia repetição', async () => {
    const data = await bundle();
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'nexalvo-staff-continuation-'));
    try {
      const pkg = 'outputs/staff-permissions-continuation-review-20261111';
      const files = [...Object.keys(data.manifest.history_files), ...['manifesto-executor.json',
        ...Object.keys(data.manifest.package_files)].map(name => path.join(pkg, name))];
      for (const file of files) {
        const target = path.join(scratch, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(root, file), target);
      }
      const journalPath = path.join(scratch, continuationJournalDir);
      fs.mkdirSync(journalPath, { recursive: true });
      const journal = openJournal(journalPath);
      const now = Date.now();
      const utc = offset => new Date(now + offset).toISOString().replace(/\.\d{3}Z$/, 'Z');
      journal.save('approval.json', { project: data.plan.project, manifest_sha256: digest, exclusive_confirmed: true,
        additional_scope_confirmed: true, stop_on_uncertainty_no_retry: true,
        start_utc: utc(-60_000), cutoff_utc: utc(1_200_000), end_utc: utc(1_800_000),
        budget: { Edge_original_cases: 13, Edge_additional: 4, Edge_restore_reserved: 2, PATCH: 0,
          GET_authenticated_additional: 4, GET_authenticated_total: 59, SQL_read_only: 36 } });
      journal.save('lock.json', { approval_sha256: journal.hash('approval.json') });
      const invoke = () => spawnSync(process.execPath, [fileURLToPath(new URL('./staff-continuation.mjs', import.meta.url)),
        '--checkpoint', digest, 'SQL-01'], { cwd: scratch, encoding: 'utf8', input: JSON.stringify({ ...data.baseline,
        observed_utc: new Date().toISOString() }) });
      assert.equal(invoke().status, 2);
      journal.save('SQL-01-request.json', { label: 'admission', requested_utc: utc(-1000),
        query_sha256: data.manifest.package_files['checkpoint-continuacao.sql'] });
      assert.equal(invoke().stdout.trim(), 'SQL-01_CHECKPOINT_RECORDED');
      assert.equal(invoke().stderr.trim(), 'SQL_CHECKPOINT_ALREADY_RECORDED');
      assert(journal.exists('SQL-01-checkpoint.json'));
    } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  });

  test('percurso completo confirma 17 Edge, 56 GET, 35 SQL e volta ao estado inicial', async () => {
    const data = await bundle();
    const run = syntheticRun(data);
    await run.run();
    assert.deepEqual(run.calls.posts, [...data.plan.setup, ...data.plan.steps, ...data.plan.recovery].map(step => step.id));
    assert.equal(run.calls.gets.length, 56);
    assert.equal(run.calls.sql.length, 35);
    assert.deepEqual(run.records.get('closed.json'), { passed: true, restored: true, audits: 13, permission_GETs: 56 });
    assert.deepEqual(run.state.employees, data.baseline.employees);
  });

  test('recusa determinada preserva o prefixo confirmado e permite apenas restauração prevista', async () => {
    const run = syntheticRun(await bundle(), { denied: 'N3' });
    await run.run();
    assert.deepEqual(run.calls.posts.slice(-3), ['N3', 'RESTAURAR-E', 'RESTAURAR-M']);
    assert.equal(run.records.get('closed.json').passed, false);
    assert.equal(run.records.get('closed.json').restored, true);
  });

  test('perda de recibo interrompe todos os envios, inclusive restauração', async () => {
    const run = syntheticRun(await bundle(), { uncertain: 'N4' });
    await assert.rejects(run.run(), /CONTINUATION_RESULT_UNCERTAIN/);
    assert.equal(run.calls.posts.at(-1), 'N4');
    assert.equal(run.calls.sql.at(-1), 'reconcile-only');
    assert.equal(run.records.get('stop.json').result_uncertain, true);
    assert(!run.records.has('closed.json'));
  });
});
