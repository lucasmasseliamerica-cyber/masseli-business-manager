import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

// Actual prepared SQL, disposable PostgreSQL only. No remote connection, Supabase credentials,
// ports or host volumes. The underlying creation RPC is a deliberately permissive local stub:
// these tests prove wrapper authorization/replay, not the deployed purchase lifecycle.
const container = `nexalvo-purchase-${process.pid}-${randomBytes(4).toString('hex')}`;
const migration = readFileSync(new URL('../migrations/20261012_purchase_order_idempotency_TEST.sql', import.meta.url), 'utf8');
const rollback = readFileSync(new URL('../migrations/20261012_purchase_order_idempotency_rollback_TEST.sql', import.meta.url), 'utf8');
const tenant = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const request = '44444444-4444-4444-8444-444444444444';
const signature = 'public.fn_create_purchase_order_idempotent(uuid,uuid,uuid,uuid,date,date,text,text,text,numeric,numeric,jsonb)';
let sequence = 0, started = false;
function docker(args, input) {
  return execFileSync('docker', args, { input, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
}
function sql(db, input) {
  return docker(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-Atq'], input).trim();
}
async function asyncSql(db, input) {
  const result = await promisify(execFile)('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-Atq', '-c', input], { encoding: 'utf8', timeout: 30000 });
  return result.stdout.trim();
}
async function waitFor(db, query) {
  for (let i = 0; i < 100; i++) {
    if (sql(db, query) === 't') return;
    await new Promise(r => setTimeout(r, 20));
  }
  assert.fail('Expected overlapping PostgreSQL sessions were not observed');
}
function fresh() {
  const db = `case_${++sequence}`;
  sql('postgres', `CREATE DATABASE ${db} TEMPLATE baseline;`);
  sql(db, migration);
  return db;
}
function call({ id = request, business = tenant, discount = 0, items = [] } = {}) {
  return `public.fn_create_purchase_order_idempotent(${id ? `'${id}'` : 'NULL'}::uuid,
    ${business ? `'${business}'` : 'NULL'}::uuid, NULL::uuid, NULL::uuid, DATE '2026-10-20',
    NULL::date, 'Draft', 'Other', NULL::text, ${discount}, 0, '${JSON.stringify(items)}'::jsonb)`;
}
function authenticated(db, statement, { uid = actor, business = tenant, permission = 'true' } = {}) {
  return sql(db, `SET ROLE authenticated; SET qa.actor = '${uid || ''}';
    SET qa.business = '${business || ''}'; SET qa.permission = '${permission}'; ${statement}`);
}
function denied(db, statement, options, message) {
  assert.throws(() => authenticated(db, statement, options), error => {
    assert.match(String(error.stderr), message); return true;
  });
  assert.equal(sql(db, 'SELECT count(*) FROM public.purchase_order_request_keys;'), '0');
  assert.equal(sql(db, 'SELECT count(*) FROM public.purchase_orders;'), '0');
}

before(async () => {
  docker(['run', '--rm', '--name', container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-d', 'postgres:17-alpine']);
  started = true;
  for (let i = 0; i < 100; i++) {
    try { docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); break; }
    catch { if (i === 99) throw new Error('DISPOSABLE_POSTGRES_NOT_READY'); await new Promise(r => setTimeout(r, 100)); }
  }
  sql('postgres', 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE DATABASE baseline;');
  sql('baseline', `
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('qa.actor', true), '')::uuid $$;
    CREATE FUNCTION public.current_business_id() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('qa.business', true), '')::uuid $$;
    CREATE FUNCTION public.user_can(text) RETURNS boolean LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('qa.permission', true), 'null')::boolean $$;
    CREATE TABLE public.businesses(id uuid PRIMARY KEY);
    INSERT INTO public.businesses VALUES ('${tenant}'), ('${other}');
    CREATE TABLE public.purchase_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses);
    CREATE FUNCTION public.fn_create_purchase_order(uuid,uuid,uuid,date,date,text,text,text,numeric,numeric,jsonb)
    RETURNS public.purchase_orders LANGUAGE plpgsql AS $$
    DECLARE result public.purchase_orders;
    BEGIN INSERT INTO public.purchase_orders(business_id) VALUES ($1) RETURNING * INTO result; RETURN result; END $$;
  `);
});
after(() => { if (started) docker(['stop', container]); });

for (const permission of ['null', 'false']) {
  test(`purchase wrapper rejects ${permission} permission before reserving a key or creating an order`, () => {
    const db = fresh();
    denied(db, `SELECT (${call()}).id;`, { permission }, /permission denied: managePurchases required/);
  });
}

test('purchase wrapper rejects missing identity, missing tenant, cross-tenant and missing request IDs', () => {
  for (const [args, session, error] of [
    [{}, { uid: null }, /authentication required/],
    [{ business: null }, { business: null }, /business_id mismatch/],
    [{ business: other }, {}, /business_id mismatch/],
    [{ id: null }, {}, /p_request_id is required/],
  ]) denied(fresh(), `SELECT (${call(args)}).id;`, session, error);
});

test('purchase replay returns the same order, rejects changed terms and preserves replay history', () => {
  const db = fresh();
  const first = authenticated(db, `SELECT (${call()}).id;`);
  assert.equal(authenticated(db, `SELECT (${call()}).id;`), first);
  assert.equal(sql(db, 'SELECT count(*) FROM public.purchase_orders;'), '1');
  assert.throws(() => authenticated(db, `SELECT (${call({ discount: 1 })}).id;`), e => /idempotency key reused/.test(String(e.stderr)));
  assert.throws(() => authenticated(db, `SELECT (${call({ items: [{ qty: 1 }] })}).id;`), e => /idempotency key reused/.test(String(e.stderr)));
  assert.throws(() => sql(db, rollback), e => /rollback refused: purchase idempotency request history exists/.test(String(e.stderr)));
  assert.equal(sql(db, 'SELECT count(*) FROM public.purchase_order_request_keys;'), '1');
  assert.equal(sql(db, 'SELECT count(*) FROM public.purchase_orders;'), '1');
});

test('purchase replay rechecks revoked permission before returning a previous order', () => {
  const db = fresh();
  authenticated(db, `SELECT (${call()}).id;`);
  for (const permission of ['null', 'false']) {
    assert.throws(() => authenticated(db, `SELECT (${call()}).id;`, { permission }), e => /permission denied/.test(String(e.stderr)));
  }
  assert.equal(sql(db, 'SELECT count(*) FROM public.purchase_orders;'), '1');
});

test('concurrent identical purchase requests overlap and serialize into exactly one order', async () => {
  const db = fresh();
  const setup = `BEGIN; SET ROLE authenticated; SET qa.actor='${actor}'; SET qa.business='${tenant}'; SET qa.permission='true';`;
  const first = asyncSql(db, `${setup} SET application_name='qa_purchase_first'; SELECT (${call()}).id; SELECT pg_sleep(2); COMMIT;`);
  await waitFor(db, "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='qa_purchase_first' AND wait_event='PgSleep');");
  const second = asyncSql(db, `${setup} SET application_name='qa_purchase_second'; SELECT (${call()}).id; COMMIT;`);
  await waitFor(db, "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='qa_purchase_second' AND wait_event_type='Lock');");
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.split('\n').find(line => /^[a-f0-9-]{36}$/.test(line)), b.split('\n').find(line => /^[a-f0-9-]{36}$/.test(line)));
  assert.equal(sql(db, 'SELECT count(*) FROM public.purchase_orders;'), '1');
  assert.equal(sql(db, 'SELECT count(*) FROM public.purchase_order_request_keys;'), '1');
});

test('purchase request data is private, anonymous execution denied, and empty rollback is reversible', () => {
  const db = fresh();
  assert.equal(sql(db, `SELECT has_function_privilege('anon','${signature}','EXECUTE');`), 'f');
  assert.equal(sql(db, `SELECT has_function_privilege('authenticated','${signature}','EXECUTE');`), 't');
  for (const role of ['anon', 'authenticated']) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      assert.equal(sql(db, `SELECT has_table_privilege('${role}','public.purchase_order_request_keys','${privilege}');`), 'f');
    }
  }
  assert.equal(sql(db, `SELECT relrowsecurity FROM pg_class WHERE oid='public.purchase_order_request_keys'::regclass;`), 't');
  sql(db, rollback);
  assert.equal(sql(db, `SELECT to_regprocedure('${signature}') IS NULL AND to_regclass('public.purchase_order_request_keys') IS NULL;`), 't');
  sql(db, migration);
  assert.equal(sql(db, `SELECT to_regprocedure('${signature}') IS NOT NULL;`), 't');
});
