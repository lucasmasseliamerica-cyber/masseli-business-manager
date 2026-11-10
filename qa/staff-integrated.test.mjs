import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { ACTORS, ORIGIN, PROJECT } from './staff-integrated-auth.mjs';
import { collectStaffInput } from './staff-integrated-input.mjs';
import { checkAuthScope, runIntegratedStaff } from './staff-integrated-run.mjs';
import { sha256 } from './staff-integrated-business.mjs';

const publicKey = 'sb_publishable_synthetic_fixture_000000';
const adminKey = 'sb_secret_synthetic_fixture_000000000000';
const owner = ACTORS.OWNER_A;
const end = Date.now() + 1_200_000;
const window = { start: Date.now() - 1000, cutoff: end - 600_000, end };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const tokens = Object.fromEntries(Object.entries(ACTORS).map(([actor, sub], i) => [actor,
  `${encode({ alg: 'HS256' })}.${encode({
    sub, iss: ORIGIN + '/auth/v1', aud: 'authenticated', role: 'authenticated',
    session_id: `11111111-2222-4333-8444-00000000000${i}`, exp: Math.floor(end / 1000) + 60,
  })}.fixture0`,
]));
const passwordInputs = { ADMIN: adminKey, OWNER_A: 'owner-fixture', MANAGER: 'manager-fixture', EMPLOYEE: 'employee-fixture' };

test('a manual possibly consumed MANAGER slot requires a separate POST grant; EMPLOYEE uses its existing slot', () => {
  const ledger = {
    project: PROJECT, manager: { manual_possibly_consumed: 1, manual_http_status: null, available_without_new_authorization: 0 },
    employee: { available_without_new_authorization: 1 },
  };
  const approval = {
    project: PROJECT, explicitly_authorized: true, stop_on_error_no_retry: true, no_account_changes: true,
    manager_additional_login: 1, employee_additional_login: 0, manager_existing_admin_get: 1, employee_existing_admin_get: 1,
    owner_mode: 'login', owner_additional_login: 1, owner_additional_admin_get: 1,
  };
  assert.doesNotThrow(() => checkAuthScope(approval, ledger));
  assert.throws(() => checkAuthScope({ ...approval, manager_additional_login: 0 }, ledger), /MEMBER_APPROVAL_SCOPE/);
  assert.throws(() => checkAuthScope({ ...approval, employee_additional_login: 1 }, ledger), /MEMBER_APPROVAL_SCOPE/);
  assert.throws(() => checkAuthScope({ ...approval, owner_additional_login: 0 }, ledger), /OWNER_APPROVAL_SCOPE/);
  assert.doesNotThrow(() => checkAuthScope({ ...approval, owner_mode: 'existing', owner_additional_login: 0, owner_additional_admin_get: 0 }, ledger));
});

test('loopback form masks and clears the fields, rejects another origin and accepts only the local submission', async () => {
  let reportUrl;
  const ready = new Promise(resolve => { reportUrl = resolve; });
  const collection = collectStaffInput({ ownerMode: 'existing', deadline: Date.now() + 15000, onReady: reportUrl });
  const url = await ready;
  const origin = new URL(url).origin;
  assert.equal(new URL(url).hostname, '127.0.0.1');
  const page = await fetch(url);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal((await page.text()).match(/type="password"/g).length, 4);
  const body = new URLSearchParams({ ...passwordInputs, OWNER_A: tokens.OWNER_A });
  const wrong = await fetch(url, { method: 'POST', headers: { Origin: 'http://127.0.0.1:1' }, body });
  assert.equal(wrong.status, 403);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(url);
    for (const [field, value] of body) await page.locator(`input[name=${field}]`).fill(value);
    await page.getByRole('button', { name: 'Confirmar coleta Auth' }).click();
    await page.getByText('Entrada recebida. Consulte o diário de execução.').waitFor();
    assert.deepEqual(await page.locator('input').evaluateAll(fields => fields.map(input => input.value)), ['', '', '', '']);
    assert.equal(page.url(), url);
    assert.deepEqual({ ...await collection }, { ...passwordInputs, OWNER_A: tokens.OWNER_A });
  } finally { await browser.close(); }
});

async function scenario(mode, ownerMode = 'login') {
  const entries = new Map(), trace = [];
  const businessId = 'synthetic-business', employeeId = 'synthetic-employee';
  const plan = {
    steps: [{
      id: 'P1', phase: 'SETUP', method: 'PATCH', path: '/rest/v1/employees', actor: 'OWNER_A', actor_id: owner,
      target_id: employeeId, business_id: businessId, before: { id: employeeId, active: false },
      expected_after: { id: employeeId, active: true }, payload: { active: true },
    }],
  };
  const reads = [{ id: 'OWNER_A-self', actor: 'OWNER_A', path: '/rest/v1/users?select=id&id=eq.' + owner }];
  const save = (name, data) => {
    assert(!entries.has(name));
    entries.set(name, structuredClone(data));
    if (name === 'native-ready.json') {
      entries.set('reads-owner-expected.json', reads.map(item => ({ ...item, expect: { rows: 1 } })));
      entries.set('command-reads-owner.json', { id: 'reads-owner', mode: 'reads', reads });
    }
    if (name === 'reads-owner-result.json') {
      entries.set('reads-owner-ack.json', { passed: true });
      const checkpoint = { observed_utc: new Date(Date.now() - 10).toISOString(), employees: [
        { id: employeeId, active: false, updated_at: '2026-11-01T00:00:00Z' },
      ] };
      entries.set('synthetic-checkpoint.json', checkpoint);
      entries.set('command-P1.json', {
        id: 'P1', mode: 'case', checkpoint_file: 'synthetic-checkpoint.json',
        checkpoint_sha256: sha256(JSON.stringify(checkpoint)),
      });
    }
    if (name === 'P1-result.json' && data.passed) {
      entries.set('P1-ack.json', { passed: true });
      entries.set('CLOSE.json', {});
    }
  };
  const journal = {
    save, exists: name => entries.has(name), names: () => [...entries.keys()],
    read: name => { assert(entries.has(name)); return entries.get(name); },
    hash: name => sha256(JSON.stringify(entries.get(name))),
  };
  const expiredOwner = tokens.OWNER_A.split('.');
  expiredOwner[1] = encode({ ...JSON.parse(Buffer.from(expiredOwner[1], 'base64url')), exp: Math.floor(Date.now() / 1000) - 1 });
  const inputs = { ...passwordInputs, ...(ownerMode === 'existing' ? { OWNER_A: mode === 'invalid-owner' ? expiredOwner.join('.') : tokens.OWNER_A } : {}) };
  const result = await runIntegratedStaff({
    journal, plan, core: {}, window, publicKey, ownerMode, verify() {},
    collect: async () => { trace.push(['COLLECT', process.pid]); return inputs; },
    authRequest: async request => {
      const { path, method, headers, body } = request;
      if (path.startsWith('/auth/v1/admin/users/')) {
        const id = path.split('/').at(-1);
        const actor = Object.keys(ACTORS).find(key => ACTORS[key] === id);
        trace.push(['ADMIN ' + actor, process.pid]);
        assert.equal(headers.apikey, adminKey);
        return { status: 200, value: { id, role: 'authenticated', email: actor + '@fixture.test', email_confirmed_at: 'fixture' } };
      }
      if (method === 'POST') {
        const actor = body.email.split('@')[0];
        trace.push(['LOGIN ' + actor, process.pid]);
        assert.equal(headers.apikey, publicKey);
        assert.equal(headers.Authorization, undefined);
        assert(entries.has(`integrated-auth-${actor}-login.reserve.json`));
        assert.equal(body.password, passwordInputs[actor]);
        if (actor === 'MANAGER' && mode === 'manager-timeout') throw new Error('synthetic transport failure');
        return { status: 200, value: { user: { id: ACTORS[actor] }, access_token: tokens[actor], refresh_token: 'fixture-refresh' } };
      }
      assert.equal(path, '/auth/v1/user');
      const actor = Object.keys(ACTORS).find(key => headers.Authorization === 'Bearer ' + tokens[key]);
      trace.push(['IDENTITY ' + actor, process.pid]);
      return { status: 200, value: { id: ACTORS[actor], role: 'authenticated' } };
    },
    businessRequest: async (url, options) => {
      trace.push(['BUSINESS ' + options.method, process.pid]);
      assert.equal(options.headers.Authorization, 'Bearer ' + tokens.OWNER_A);
      if (options.method === 'GET') return new Response(JSON.stringify([{ id: owner, business_id: businessId }]));
      assert.equal(new URL(url).pathname, '/rest/v1/employees');
      assert(entries.has('P1-reservation.json'));
      if (mode === 'business-timeout') throw new Error('synthetic response lost');
      return new Response(JSON.stringify([{ id: employeeId }]));
    },
  });
  assert.deepEqual(inputs, {});
  const evidence = JSON.stringify([...entries.values()]);
  assert.doesNotMatch(evidence, /fixture-refresh|fixture\.test|manager-fixture|sb_secret_|\.fixture0/);
  return { result, trace, entries };
}

test('the same PID collects, authenticates and sends the first business case without re-reading Auth', async () => {
  const { result, trace, entries } = await scenario('pass');
  assert.equal(result.passed, true);
  assert.deepEqual(new Set(trace.map(item => item[1])), new Set([process.pid]));
  assert.deepEqual(trace.map(item => item[0]), [
    'COLLECT', 'ADMIN OWNER_A', 'LOGIN OWNER_A', 'IDENTITY OWNER_A', 'ADMIN MANAGER', 'ADMIN EMPLOYEE',
    'LOGIN MANAGER', 'IDENTITY MANAGER', 'LOGIN EMPLOYEE', 'IDENTITY EMPLOYEE', 'BUSINESS GET', 'BUSINESS PATCH',
  ]);
  assert.equal(entries.get('native-ready.json').GETs, 3);
  assert.equal(entries.get('native-ended.json').GETs, 4);
  assert.equal(entries.get('P1-result.json').forwarding_attempts, 1);
});

test('existing OWNER avoids an Auth login; a rejected local OWNER blocks all requests', async () => {
  const accepted = await scenario('pass', 'existing');
  assert.equal(accepted.result.passed, true);
  assert(!accepted.trace.some(([step]) => step === 'LOGIN OWNER_A' || step === 'ADMIN OWNER_A'));
  const denied = await scenario('invalid-owner', 'existing');
  assert.equal(denied.result.passed, false);
  assert.deepEqual(denied.trace.map(([step]) => step), ['COLLECT']);
  assert(!denied.entries.has('native-ready.json'));
});

test('a possibly dispatched MANAGER login stops EMPLOYEE and the business executor', async () => {
  const { result, trace, entries } = await scenario('manager-timeout');
  assert.equal(result.passed, false);
  assert.equal(entries.get('integrated-auth-MANAGER-login.result.json').result_uncertain, true);
  assert.equal(entries.get('integrated-auth-MANAGER-login.result.json').http_status, null);
  assert(!trace.some(([step]) => step === 'LOGIN EMPLOYEE' || step.startsWith('BUSINESS')));
  assert(!entries.has('native-ready.json'));
});

test('a reserved business request with a lost response stops the single process without a replay', async () => {
  const { result, trace, entries } = await scenario('business-timeout');
  assert.equal(result.passed, false);
  assert.equal(entries.get('P1-result.json').forwarding_attempts, 1);
  assert.equal(entries.get('P1-result.json').result_uncertain, true);
  assert.equal(entries.get('STOP.json').case, 'P1');
  assert.equal(trace.filter(([step]) => step === 'BUSINESS PATCH').length, 1);
  assert(!entries.has('P1-ack.json'));
});
