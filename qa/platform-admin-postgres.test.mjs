import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Real PostgreSQL execution, entirely local: no ports, volumes, external networking or credentials.
// The actual migration/preflights/rollback are executed byte-for-byte, including fingerprint guards.
const container = `nexalvo-platform-${process.pid}-${randomBytes(4).toString('hex')}`;
const selected = '11111111-1111-4111-8111-111111111111';
const legacy = '22222222-2222-4222-8222-222222222222';
const business = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('migrations/20261016_platform_admin_TEST.sql');
const rollback = read('migrations/20261016_platform_admin_rollback_TEST.sql');
const preflight = read('qa/sql/platform_admin_cutover_preflight_readonly_TEST.sql');
const postflight = read('qa/sql/platform_admin_single_authority_preflight_readonly_TEST.sql');
let started = false;
let sequence = 0;

function docker(args, input, timeout = 30000) {
  return execFileSync('docker', args, { input, encoding: 'utf8', timeout, stdio: ['pipe', 'pipe', 'pipe'] });
}
function sql(db, text) {
  return docker(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-Atq'], text).trim();
}
function json(db, text) { return JSON.parse(sql(db, text)); }
function fresh() {
  const name = `case_${++sequence}`;
  sql('postgres', `CREATE DATABASE ${name} TEMPLATE baseline;`);
  return name;
}
function identities(db) {
  return sql(db, `SELECT md5((SELECT jsonb_agg(to_jsonb(a) ORDER BY id)::text FROM auth.users a)
    || (SELECT jsonb_agg(to_jsonb(u) ORDER BY id)::text FROM public.users u));`);
}
function refused(db, text, state) {
  assert.throws(() => sql(db, text), error => {
    assert.match(String(error.stderr), new RegExp(state));
    return true;
  });
}

before(async () => {
  docker(['run', '--rm', '--name', container, '--network', 'none',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-d', 'postgres:17-alpine'], undefined, 120000);
  started = true;
  for (let i = 0; i < 60; i++) {
    // The image's initdb server uses a socket only and then shuts down. Wait for the final TCP
    // listener inside the network-isolated container, not that temporary bootstrap process.
    try { docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); break; }
    catch { if (i === 59) throw new Error('DISPOSABLE_POSTGRES_NOT_READY'); await new Promise(r => setTimeout(r, 200)); }
  }
  assert.match(sql('postgres', 'SHOW server_version;'), /^17\./);
  sql('postgres', 'CREATE DATABASE baseline;');
  sql('baseline', read('qa/fixtures/platform-admin-baseline.sql'));
});
after(() => { if (started) docker(['stop', container]); });

test('distinct EMPLOYEE SUPERADMIN and legacy OWNER pass exact baselines, cutover and all postchecks', () => {
  const db = fresh();
  const original = identities(db);
  const pre = json(db, preflight);
  assert.equal(pre.status, 'PASS_READY_FOR_ATOMIC_CUTOVER');
  assert.equal(pre.passed, 12);
  assert.equal(pre.failed, 0);
  sql(db, migration);
  const post = json(db, postflight);
  assert.equal(post.status, 'PASS_SINGLE_SIGNED_AUTHORITY');
  assert.equal(post.passed, 20);
  assert.equal(post.failed, 0);
  const runtime = json(db, read('qa/sql/platform_admin_runtime_preflight_readonly_TEST.sql'));
  assert.equal(runtime.passed, 3);
  assert.equal(identities(db), original, 'Auth identities, all metadata and tenant profiles remain byte-identical');
  assert.deepEqual(json(db, `SELECT jsonb_build_object('distinct',actor_user_id <> legacy_operator_user_id,
    'new_role',actor_tenant_role,'old_role',legacy_tenant_role,'different_businesses',actor_business_id <> legacy_business_id,
    'active',authority_state='ACTIVE') FROM nexalvo_private.platform_authority_cutover;`),
  { distinct: true, new_role: 'EMPLOYEE', old_role: 'OWNER', different_businesses: true, active: true });
});

test('only the recorded SUPERADMIN can read globally; tenant permissions and business RLS stay separate', () => {
  const db = fresh(); sql(db, migration);
  assert.equal(sql(db, `SET ROLE service_role; SELECT count(*) FROM public.fn_platform_admin_list_businesses('${selected}');`), '2');
  for (const actor of [legacy, '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555']) {
    refused(db, `SET ROLE service_role; SELECT * FROM public.fn_platform_admin_list_businesses('${actor}');`, '42501');
  }
  refused(db, `SET ROLE authenticated; SET request.jwt.claim.sub='${legacy}'; SELECT public.fn_platform_access();`, '42501');
  refused(db, `SET ROLE authenticated; SET request.jwt.claim.sub='${selected}'; SELECT * FROM public.fn_platform_admin_list_businesses('${selected}');`, '42501');
  assert.deepEqual(json(db, `SET ROLE authenticated; SET request.jwt.claim.sub='${selected}';
    SELECT jsonb_build_object('tenant_businesses',(SELECT count(*) FROM public.businesses),
      'manage_users',public.user_can('manageUsers'),'view_financials',public.user_can('viewFinancials'));`),
  { tenant_businesses: 1, manage_users: false, view_financials: false });
});

test('self suspension is denied before any request or financial/commercial effect', () => {
  const db = fresh(); sql(db, migration);
  refused(db, `SET ROLE service_role; SELECT public.fn_platform_admin_execute(
    '66666666-6666-4666-8666-666666666666','${selected}','update_business_status','${business}','SUSPENDED');`, '42501');
  assert.equal(sql(db, 'SELECT count(*) FROM nexalvo_private.platform_admin_requests;'), '0');
  assert.equal(sql(db, 'SELECT count(*) FROM nexalvo_private.platform_admin_audit_logs;'), '0');
  assert.equal(sql(db, `SELECT platform_status FROM public.businesses WHERE id='${business}';`), 'ACTIVE');
});

test('a global SUPERADMIN claim does not grant tenant salary access or expand the employee facade', () => {
  const db = fresh(); sql(db, migration);
  refused(db, `SET ROLE authenticated; SET request.jwt.claim.sub='${selected}'; SELECT hourly_rate FROM public.employees;`, '42501');
  assert.deepEqual(json(db, `SET ROLE authenticated; SET request.jwt.claim.sub='${selected}';
    SELECT jsonb_build_object('visible_employees',count(*),'unmasked_salaries',count(hourly_rate))
    FROM public.fn_read_employees_secure();`), { visible_employees: 1, unmasked_salaries: 0 });
});

test('a later additional claim cannot become a second global authority outside the recorded identity', () => {
  const db = fresh(); sql(db, migration);
  const other = '55555555-5555-4555-8555-555555555555';
  sql(db, `UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data || '{"nexalvo_platform_role":"SUPERADMIN"}' WHERE id='${other}';`);
  refused(db, `SET ROLE service_role; SELECT * FROM public.fn_platform_admin_list_businesses('${other}');`, '42501');
  assert.equal(json(db, postflight).status, 'BLOCKED_AUTHORITY_CUTOVER');
});

test('rollback preserves the chosen claim/EMPLOYEE profile and restores only the recorded old OWNER', () => {
  const db = fresh(); const original = identities(db); sql(db, migration); sql(db, rollback);
  assert.equal(identities(db), original);
  assert.equal(sql(db, 'SELECT count(*) FROM nexalvo_platform.operators WHERE active;'), '1');
  assert.equal(sql(db, `SET ROLE authenticated; SET request.jwt.claim.sub='${legacy}'; SELECT public.fn_platform_access();`), 't');
  assert.equal(sql(db, `SET ROLE authenticated; SET request.jwt.claim.sub='${selected}'; SELECT public.fn_platform_access();`), 'f');
  assert.deepEqual(json(db, `SELECT jsonb_build_object('state',authority_state,'timestamp',rolled_back_at IS NOT NULL,
    'new_rpc_absent',to_regprocedure('public.fn_platform_admin_list_businesses(uuid)') IS NULL)
    FROM nexalvo_private.platform_authority_cutover;`), { state: 'ROLLED_BACK', timestamp: true, new_rpc_absent: true });
  assert.equal(sql(db, "SELECT has_table_privilege('authenticated','nexalvo_private.platform_authority_cutover','SELECT');"), 'f');
  assert.equal(sql(db, 'SELECT count(*) FROM nexalvo_platform.access_audit;'), '3',
    'the actual legacy audit trigger preserves initial, retirement and restoration events');
  const again = json(db, preflight);
  assert.equal(again.status, 'BLOCKED_AUTHORITY_CUTOVER', 'preserved recovery history prevents blind reapplication');
});

test('a second signed identity blocks the preflight and migration without any DDL effects', () => {
  const db = fresh();
  sql(db, `UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data || '{"nexalvo_platform_role":"SUPERADMIN"}' WHERE id='33333333-3333-4333-8333-333333333333';`);
  assert.equal(json(db, preflight).status, 'BLOCKED_AUTHORITY_CUTOVER');
  refused(db, migration, 'P0001');
  assert.equal(sql(db, "SELECT to_regnamespace('nexalvo_private') IS NULL;"), 't');
  assert.equal(sql(db, 'SELECT count(*) FROM nexalvo_platform.operators WHERE active;'), '1');
});

test('assigning the claim to the legacy OWNER instead does not bypass independent identity validation', () => {
  const db = fresh();
  sql(db, `UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data-'nexalvo_platform_role';
    UPDATE auth.users SET raw_app_meta_data=raw_app_meta_data || '{"nexalvo_platform_role":"SUPERADMIN"}' WHERE id='${legacy}';`);
  const pre = json(db, preflight);
  assert.equal(pre.status, 'BLOCKED_AUTHORITY_CUTOVER');
  assert.equal(pre.checks.find(c => c.name === 'independent_authority_identities_valid').passed, false);
  refused(db, migration, 'P0001');
});

test('inactive legacy profile blocks recovery eligibility independently of a valid SUPERADMIN', () => {
  const db = fresh(); sql(db, `UPDATE public.users SET active=false WHERE id='${legacy}';`);
  assert.equal(json(db, preflight).checks.find(c => c.name === 'independent_authority_identities_valid').passed, false);
  refused(db, migration, 'P0001');
});

test('a missing baseline function cannot disappear from the 12 checks or pass through SQL NULL', () => {
  const db = fresh(); sql(db, 'DROP FUNCTION public.fn_write_audit(text,text);');
  const pre = json(db, preflight);
  assert.equal(pre.checks.length, 12);
  assert.equal(pre.status, 'BLOCKED_AUTHORITY_CUTOVER');
  assert.equal(pre.failed, 1);
  refused(db, migration, 'P0001');
});

test('a new RPC collision is rejected again inside the migration, not only by external preflight', () => {
  const db = fresh();
  sql(db, 'CREATE FUNCTION public.fn_platform_admin_unreviewed() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;');
  assert.equal(json(db, preflight).status, 'BLOCKED_AUTHORITY_CUTOVER');
  refused(db, migration, 'P0001');
  assert.equal(sql(db, "SELECT to_regnamespace('nexalvo_private') IS NULL;"), 't');
});

test('a restoration-grant drift also blocks the migration before any cutover writes', () => {
  const db = fresh(); sql(db, 'REVOKE UPDATE ON public.businesses FROM authenticated;');
  assert.equal(json(db, preflight).status, 'BLOCKED_AUTHORITY_CUTOVER');
  refused(db, migration, 'P0001');
  assert.equal(sql(db, "SELECT to_regnamespace('nexalvo_private') IS NULL;"), 't');
});

test('migration failure during legacy retirement rolls back every newly prepared object and grant', () => {
  const db = fresh();
  sql(db, 'ALTER TABLE nexalvo_platform.operators ADD CONSTRAINT local_failure CHECK (active);');
  assert.equal(json(db, preflight).passed, 12);
  refused(db, migration, '23514');
  assert.equal(sql(db, "SELECT to_regnamespace('nexalvo_private') IS NULL;"), 't');
  assert.equal(sql(db, `SET ROLE authenticated; SET request.jwt.claim.sub='${legacy}'; SELECT public.fn_platform_access();`), 't');
});

test('rollback failure during legacy restoration restores the new authority atomically', () => {
  const db = fresh(); sql(db, migration);
  sql(db, 'ALTER TABLE nexalvo_platform.operators ADD CONSTRAINT local_failure CHECK (NOT active);');
  refused(db, rollback, '23514');
  assert.equal(sql(db, "SELECT authority_state FROM nexalvo_private.platform_authority_cutover;"), 'ACTIVE');
  assert.equal(json(db, postflight).passed, 20);
  assert.equal(sql(db, `SET ROLE service_role; SELECT count(*) FROM public.fn_platform_admin_list_businesses('${selected}');`), '2');
});

test('rollback preserves history by refusing even a pending administrative request', () => {
  const db = fresh(); sql(db, migration);
  sql(db, `INSERT INTO nexalvo_private.platform_admin_requests(request_id,actor_user_id,operation,business_id)
    VALUES('66666666-6666-4666-8666-666666666666','${selected}','revoke_license','${business}');`);
  refused(db, rollback, 'P0001');
  assert.equal(sql(db, 'SELECT count(*) FROM nexalvo_private.platform_admin_requests;'), '1');
  assert.equal(sql(db, "SELECT authority_state FROM nexalvo_private.platform_authority_cutover;"), 'ACTIVE');
});

test('rollback refuses altered legacy code rather than restoring a changed global endpoint', () => {
  const db = fresh(); sql(db, migration);
  sql(db, "CREATE OR REPLACE FUNCTION nexalvo_platform.has_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS 'SELECT true';");
  refused(db, rollback, 'P0001');
  assert.equal(sql(db, 'SELECT count(*) FROM nexalvo_platform.operators WHERE active;'), '0');
  assert.equal(sql(db, "SELECT authority_state FROM nexalvo_private.platform_authority_cutover;"), 'ACTIVE');
});
