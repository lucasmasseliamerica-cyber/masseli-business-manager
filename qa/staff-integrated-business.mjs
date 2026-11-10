import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ACTORS, ORIGIN } from './staff-integrated-auth.mjs';

export const MANIFEST = 'de56f442bf76ed402cdc2a83c629bfd7a59205bf43cbd882a807a1c0230bc94f';
export const ADDENDUM = '61ca25cce72fac16a224df507e0146667f3fcf1daa584d8d27fe659a16f491cb';
export const CHECKPOINT = 'f4b9aa823e4c33c1efc58af83fd79410b75dce26765ee764f116b81732da47f7';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// The window and receipt predicates are the reviewed business-window.mjs rules.
export function verifyWindow(w) {
  assert(w.project === 'msinksoilkluooxenecy' && w.manifest_sha256 === MANIFEST &&
    w.addendum_link_sha256 === ADDENDUM && w.checkpoint_sha256 === CHECKPOINT, 'WINDOW_BINDING_DRIFT');
  assert(w.no_other_staff_operations_or_TEST_DDL === true && w.Edge === 17 && w.PATCH === 4, 'EXCLUSIVITY_OR_BUDGET_MISSING');
  for (const value of [w.start_utc, w.cutoff_utc, w.end_utc]) {
    assert(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) &&
      new Date(value).toISOString() === value.replace('Z', '.000Z'), 'UTC_WINDOW_INVALID');
  }
  const start = Date.parse(w.start_utc), cutoff = Date.parse(w.cutoff_utc), end = Date.parse(w.end_utc);
  assert(cutoff > start && end - cutoff === 600000 && end - start <= 2700000, 'WINDOW_LIMIT_INVALID');
  return { start, cutoff, end };
}

export function requestTimeout(window, phase, now = Date.now()) {
  const end = phase === 'RECOVERY' ? window.end : window.cutoff;
  assert(now >= window.start && now + 25000 < end, 'WINDOW_MARGIN_REJECTED');
  return Math.min(20000, end - now - 5000);
}

function requireFreshCheckpoint(value) {
  const age = Date.now() - Date.parse(value);
  assert(Number.isFinite(age) && age >= 0 && age < 45000, 'CHECKPOINT_STALE_OR_FUTURE');
}

function uncertainMutationReceipt(status, passed, explicitUncertainty) {
  return explicitUncertainty === true || status >= 500 || status === 408 || (status >= 200 && status < 300 && !passed);
}

const readPaths = new Set(['/rest/v1/users', '/rest/v1/rpc/user_can', '/rest/v1/rpc/fn_read_employees_secure']);
const readStages = Object.freeze({
  owner: { after: null, count: 1 },
  baseline: { after: 'P4', count: 74 },
  grant: { after: 'G1', count: 3 },
  revoke: { after: 'G2', count: 2 },
});
const requiredRead = Object.freeze({ P1: 'owner', N1: 'baseline', N3: 'grant', N8: 'revoke' });

function cleanRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const field of ['id', 'business_id', 'role', 'employee_id', 'active', 'permission_overrides']) {
    if (Object.hasOwn(row, field)) out[field] = row[field];
  }
  if (Object.hasOwn(row, 'hourly_rate')) out.hourly_rate_visible = row.hourly_rate !== null;
  return out;
}

const matches = (row, expected) => Object.entries(expected).every(([k, v]) => JSON.stringify(row?.[k]) === JSON.stringify(v));

function approvedRow(step, checkpoint, plan) {
  const rows = step.method === 'PATCH' ? checkpoint.employees : checkpoint.profiles;
  const row = rows.find(r => r.id === step.target_id);
  const states = step.phase === 'RECOVERY'
    ? plan.steps.filter(s => s.target_id === step.target_id && s.method === step.method).flatMap(s => [s.before, s.expected_after])
    : [step.before];
  assert(row && states.some(state => matches(row, state)), 'TARGET_STATE_NOT_APPROVED');
  return row;
}

export function createBusinessExecutor({ journal, plan, core, window, sessions, authProof, publicKey, verify, fetchRequest = fetch }) {
  assert(authProof.pid === process.pid && authProof.authenticatedReads === 3 && authProof.actorCount === 3 &&
    sessions.size === 3 && Object.keys(ACTORS).every(actor => sessions.has(actor)), 'SAME_PROCESS_SESSIONS_REQUIRED');
  let reads = authProof.authenticatedReads;
  const seen = new Set();

  const send = async (actor, method, url, body, phase = 'HOMOLOGATION') => {
    const parsed = new URL(url);
    assert(sessions.has(actor) && parsed.origin === ORIGIN && !parsed.username && !parsed.password && !parsed.hash, 'BUSINESS_ROUTE_SCOPE');
    if (method === 'GET') {
      assert(readPaths.has(parsed.pathname) && reads < 83, 'BUSINESS_READ_SCOPE');
      reads++;
    } else {
      assert(method === 'POST' && parsed.pathname === '/functions/v1/manage-staff-user' ||
        method === 'PATCH' && parsed.pathname === '/rest/v1/employees', 'BUSINESS_WRITE_SCOPE');
    }
    const response = await fetchRequest(url, {
      method, redirect: 'error', signal: AbortSignal.timeout(requestTimeout(window, phase)),
      headers: {
        apikey: publicKey, Authorization: 'Bearer ' + sessions.get(actor), Origin: 'http://127.0.0.1:5173',
        'Content-Type': 'application/json', ...(method === 'PATCH' ? { Prefer: 'return=representation' } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let value = null;
    try { value = await response.json(); } catch {}
    return { status: response.status, value };
  };

  async function readCommand(command) {
    const stage = command.id.slice('reads-'.length);
    const rule = Object.hasOwn(readStages, stage) && readStages[stage];
    assert(rule && command.id === 'reads-' + stage && command.reads.length === rule.count, 'READ_STAGE_SCOPE');
    assert(!rule.after || journal.exists(rule.after + '-ack.json'), 'READ_STAGE_ORDER');
    assert(!journal.exists(command.id + '-result.json'), 'READ_REPLAY_BLOCKED');
    const approved = journal.read(command.id + '-expected.json');
    assert.deepEqual(command.reads, approved.map(({ expect, ...request }) => request));
    const results = [];
    for (const item of command.reads) {
      assert(!journal.exists('STOP.json') && !journal.exists('CLOSE.json'), 'BATCH_STOPPED');
      const response = await send(item.actor, 'GET', ORIGIN + item.path);
      const value = Array.isArray(response.value) ? response.value.map(cleanRow) :
        typeof response.value === 'boolean' ? response.value : null;
      results.push({ id: item.id, status: response.status, value });
      if (response.status !== 200) break;
    }
    journal.save(command.id + '-result.json', { mode: 'reads', GETs: reads, results });
    assert(results.length === rule.count && results.every(row => row.status === 200), 'READ_STAGE_STOPPED');
  }

  async function caseCommand(command) {
    const index = plan.steps.findIndex(step => step.id === command.id);
    assert(index >= 0, 'UNKNOWN_CASE');
    const step = plan.steps[index];
    assert(!journal.exists(step.id + '-reservation.json') && !journal.exists(step.id + '-result.json') &&
      !journal.exists(step.id + '-intent.json'), 'REPLAY_BLOCKED');
    for (const prior of plan.steps.slice(0, index)) assert(journal.read(prior.id + '-ack.json').passed === true, 'PREVIOUS_CASE_NOT_ACKNOWLEDGED');
    if (requiredRead[step.id]) assert(journal.read('reads-' + requiredRead[step.id] + '-ack.json').passed === true, 'REQUIRED_READ_STAGE_MISSING');
    verify();
    requestTimeout(window, step.phase);
    const checkpoint = journal.read(command.checkpoint_file);
    requireFreshCheckpoint(checkpoint.observed_utc);
    assert.equal(journal.hash(command.checkpoint_file), command.checkpoint_sha256);
    const row = approvedRow(step, checkpoint, plan);
    if (step.phase === 'RECOVERY' && matches(row, step.expected_after)) {
      journal.save(step.id + '-result.json', { id: step.id, status: 'SKIPPED_ALREADY_BASELINE', forwarding_attempts: 0, passed: true, result_uncertain: false });
      return;
    }
    const body = structuredClone(step.payload);
    let url = ORIGIN + step.path;
    if (step.method === 'PATCH') {
      body.updated_at = new Date().toISOString();
      url += '?' + new URLSearchParams({ id: 'eq.' + step.target_id, business_id: 'eq.' + step.business_id, updated_at: 'eq.' + row.updated_at, select: 'id' });
    }
    const result = { id: step.id, method: step.method, actor: step.actor, forwarding_attempts: 0, passed: false, result_uncertain: false };
    journal.save(step.id + '-intent.json', {
      utc: new Date().toISOString(), manifest_sha256: MANIFEST, actor_id: step.actor_id, target_id: step.target_id,
      method: step.method, path: step.path, body_sha256: sha256(JSON.stringify(body)), body, checkpoint_sha256: command.checkpoint_sha256,
    });
    requestTimeout(window, step.phase);
    journal.save(step.id + '-reservation.json', { utc: new Date().toISOString(), forwarding_attempts: 1, remaining_case_budget: 0, no_replay: true });
    try {
      verify();
      requestTimeout(window, step.phase);
      requireFreshCheckpoint(checkpoint.observed_utc);
      assert(!journal.exists('STOP.json') && !journal.exists('CLOSE.json'), 'BATCH_STOPPED');
      result.forwarding_attempts = 1;
      result.utc = new Date().toISOString();
      const response = await send(step.actor, step.method, url, body, step.phase);
      result.http_status = response.status;
      result.public_code = typeof response.value?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(response.value.code) ? response.value.code : null;
      if (step.method === 'PATCH') {
        result.passed = response.status === 200 && Array.isArray(response.value) && response.value.length === 1 && response.value[0].id === step.target_id;
      } else if (step.expected_status === 200) {
        result.passed = response.status === 200 && response.value?.ok === true &&
          core.validStaffProfileReceipt(response.value.user, step.target_id, step.before.business_id, core.parseStaffRequest(step.payload));
      } else {
        result.passed = response.status === step.expected_status && result.public_code === step.expected_code;
      }
      if (uncertainMutationReceipt(response.status, result.passed, response.value?.reconciliation_required)) {
        result.result_uncertain = true;
        result.passed = false;
      }
    } catch {
      result.result_uncertain = result.forwarding_attempts === 1;
      result.error_code = 'TRANSPORT_OR_INTERNAL_STOP';
    }
    journal.save(step.id + '-result.json', result);
    if (!result.passed) journal.save('STOP.json', { case: step.id, uncertain: result.result_uncertain, utc: new Date().toISOString() });
  }

  return {
    async run() {
      journal.save('native-ready.json', {
        utc: new Date().toISOString(), pid: process.pid, same_process_auth_and_executor: true,
        three_independent_Auth_GETs_pass: true, GETs: reads, public_client_config_TEST_bound: true, credentials_saved: false,
      });
      try {
        while (Date.now() < window.end && !journal.exists('STOP.json') && !journal.exists('CLOSE.json')) {
          const names = journal.names().filter(name => /^command-[A-Za-z0-9_-]+\.json$/.test(name) && !seen.has(name));
          assert(names.length <= 1, 'MULTIPLE_PENDING_COMMANDS');
          for (const name of names) {
            seen.add(name);
            const command = journal.read(name);
            assert(name === 'command-' + command.id + '.json', 'COMMAND_FILE_SCOPE');
            if (command.mode === 'reads') await readCommand(command);
            else {
              assert(command.mode === 'case', 'COMMAND_MODE_DENIED');
              await caseCommand(command);
            }
          }
          await delay(250);
        }
      } finally {
        journal.save('native-ended.json', { utc: new Date().toISOString(), pid: process.pid, GETs: reads });
      }
    },
  };
}
