import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { closeSync, existsSync, openSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { terminalHttp } from '../supabase/functions/_shared/terminal-http.mjs';

const pgDir = process.env.NEXALVO_TEST_PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin' : '');
const pg = name => pgDir ? join(pgDir, name + (process.platform === 'win32' ? '.exe' : '')) : name;
const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('PG')));
const prefix = 'nexalvo-terminal-pg-';
const scratch = mkdtempSync(join(tmpdir(), prefix));
const data = join(scratch, 'data');
const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const contracts = JSON.parse(read('./fixtures/terminal-sale-contracts.json')).functions;
const migration = read('../supabase/migrations/20261111032959_terminal_online_TEST.sql');
const uuid = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const business = uuid(1), owner = uuid(2), location = uuid(3), product = uuid(4), ingredient = uuid(5);
const outsider = uuid(6), foreignBusiness = uuid(7), employee = uuid(8);
const appOrigin = 'http://127.0.0.1:5173';
const config = {
  supabaseUrl: 'https://msinksoilkluooxenecy.supabase.co', publicKey: 'local-public-fixture', serviceKey: 'local-service-fixture',
  stripeSecret: 'sk_test_x', stripeAccountId: 'acct_Lab', webhookSecret: 'whsec_x',
  allowedOrigins: appOrigin, allowCharges: true,
};
let port, started = false, stripe, actor;

function command(name, args, input) {
  return execFileSync(pg(name), args, { encoding: 'utf8', input, env: pgEnv, timeout: 35000, windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
const psqlArgs = () => ['-X', '-w', '-Atq', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres'];
const sql = query => command('psql', psqlArgs(), query);
const q = value => value === null || value === undefined ? 'null' : `'${String(value).replaceAll("'", "''")}'`;
const jsonArg = value => q(JSON.stringify(value)) + '::jsonb';
const rpcSql = (name, args) => `set role service_role; select coalesce(to_jsonb(public.fn_terminal_${name}(${args.join(',')})), 'null'::jsonb);`;
const call = (name, ...args) => JSON.parse(sql(rpcSql(name, args)));

function control(args) {
  const log = openSync(join(scratch, 'pg-ctl.log'), 'a');
  try {
    execFileSync(pg('pg_ctl'), args, { env: pgEnv, timeout: 35000, windowsHide: true, stdio: ['ignore', log, log] });
  } finally { closeSync(log); }
}

before(async () => {
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  port = socket.address().port;
  await new Promise(resolveClose => socket.close(resolveClose));
  command('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8']);
  control(['-D', data, '-l', join(scratch, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
  started = true;
  sql(read('./fixtures/terminal-postgres.sql'));
  for (const fixture of contracts) {
    assert.equal(createHash('md5').update(fixture.definition).digest('hex'), fixture.fingerprint);
    const definition = Buffer.from(fixture.definition, 'utf8').toString('base64');
    sql(`do $fixture$ begin execute convert_from(decode('${definition}','base64'),'UTF8'); end $fixture$;`);
  }
  const installed = JSON.parse(sql(`select jsonb_object_agg(proname,md5(pg_get_functiondef(p.oid))) from pg_proc p
    where pronamespace='public'::regnamespace and proname in (${contracts.map(f => q(f.name)).join(',')});`));
  assert.deepEqual(installed, Object.fromEntries(contracts.map(f => [f.name, f.fingerprint])));
  sql(migration);
  sql(`insert into public.businesses values ('${business}','USD',true,7.25,'ACTIVE',false),('${foreignBusiness}','USD',false,0,'ACTIVE',false);
    insert into public.users values ('${owner}','${business}','OWNER','Owner',true,'{}'),('${outsider}','${foreignBusiness}','OWNER','Other',true,'{}'),
      ('${employee}','${business}','EMPLOYEE','Employee',true,'{}');
    insert into public.locations values ('${location}','${business}',true);
    insert into public.business_settings_lists values ('${business}','channel','In Store',true);
    insert into public.products values ('${product}','${business}','Synthetic item',5,true);
    insert into public.inventory_items values ('${ingredient}','${business}','Unit',true);
    insert into public.product_recipes values ('${product}','${ingredient}',0.250);
    insert into public.inventory_stock(inventory_item_id,location_id,qty,avg_cost_per_unit) values ('${ingredient}','${location}',10,0.1);
    insert into terminal_private.bindings values ('${location}','${business}','acct_Lab','tml_Lab','tmr_Lab','simulated_stripe_s700','wifi',2000,true);`);
});

beforeEach(() => {
  sql(`truncate terminal_private.events,terminal_private.sale_authorizations,terminal_private.attempts,
    public.sale_items,public.sales,public.inventory_transactions,public.cash_flow,public.audit_logs,public.business_counters;
    update public.inventory_stock set qty=10;
    update public.users set active=true;`);
  actor = owner;
  stripe = { calls: [], intent: null, readerStatus: 'online', action: null, loseCreate: false, loseProcess: false, decline: false, keepPending: false };
});

after(() => {
  if (started || existsSync(join(data, 'postmaster.pid'))) control(['-D', data, '-m', 'fast', '-w', 'stop']);
  assert.equal(dirname(resolve(scratch)), resolve(tmpdir()));
  assert(scratch.split(/[\\/]/).at(-1).startsWith(prefix));
  rmSync(scratch, { recursive: true, force: true });
});

function cart(overrides = {}) {
  return { action: 'start', sale_id: randomUUID(), operation_id: randomUUID(), location_id: location,
    items: [{ product_id: product, qty: 2 }], channel: 'In Store', fulfillment_status: 'Completed',
    expected_amount_minor: 965, discount_minor: 100, ...overrides };
}
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

async function fixtureFetch(url, options) {
  const path = new URL(url).pathname;
  if (url.startsWith(config.supabaseUrl + '/')) {
    if (path === '/auth/v1/user') {
      assert.equal(options.headers.apikey, config.publicKey);
      return reply({ id: actor, role: 'authenticated', is_anonymous: false });
    }
    assert.equal(options.headers.Authorization, `Bearer ${config.serviceKey}`);
    const a = JSON.parse(options.body), name = path.split('fn_terminal_')[1];
    const args = {
      context: () => [q(a.p_actor), q(a.p_location), q(a.p_operation)], reserve: () => [q(a.p_actor), jsonArg(a.p_request)],
      claim: () => [q(a.p_operation), q(a.p_stage)], observe: () => [q(a.p_operation), jsonArg(a.p_snapshot), String(a.p_reader_idle)],
      attempt: () => [q(a.p_operation)], finalize: () => [q(a.p_operation)],
      event: () => [q(a.p_operation), q(a.p_event), String(a.p_record)],
    };
    try { return reply(call(name, ...args[name]())); }
    catch (error) { return reply({ message: String(error.stderr).match(/ERROR:\s+(TERMINAL_[A-Z_]+)/)?.[1] ?? 'database fixture error' }, 400); }
  }
  assert(url.startsWith('https://api.stripe.com/v1/'));
  stripe.calls.push({ path, method: options.method, key: options.headers['Idempotency-Key'] });
  if (path === '/v1/account') return reply({ id: 'acct_Lab', country: 'US', charges_enabled: true });
  if (path === '/v1/terminal/locations/tml_Lab') return reply({ id: 'tml_Lab', livemode: false, address: { country: 'US' } });
  if (path === '/v1/terminal/readers/tmr_Lab') return reply({ id: 'tmr_Lab', livemode: false, location: 'tml_Lab',
    status: stripe.readerStatus, action: stripe.action, device_type: 'simulated_stripe_s700' });
  if (path === '/v1/payment_intents' && options.method === 'POST') {
    const params = options.body;
    const operation = params.get('metadata[operation_id]');
    const row = call('attempt', q(operation));
    assert(row.create_reserved_at && !row.payment_intent_id);
    stripe.intent = { id: 'pi_Lab', livemode: false, amount: Number(params.get('amount')), currency: 'usd', amount_received: 0,
      capture_method: params.get('capture_method'), payment_method_types: params.getAll('payment_method_types[]'), status: 'requires_payment_method',
      metadata: { business_id: params.get('metadata[business_id]'), sale_id: params.get('metadata[sale_id]'), operation_id: operation } };
    if (stripe.loseCreate) throw Error('synthetic response loss');
    return reply(stripe.intent);
  }
  if (path === '/v1/terminal/readers/tmr_Lab/process_payment_intent') {
    const row = call('attempt', q(stripe.intent.metadata.operation_id));
    assert(row.process_reserved_at && row.payment_intent_id === 'pi_Lab');
    assert.equal(options.body.get('payment_intent'), 'pi_Lab');
    if (stripe.decline) stripe.intent.last_payment_error = { code: 'card_declined' };
    else if (stripe.keepPending) stripe.action = { type: 'process_payment_intent', status: 'in_progress', process_payment_intent: { payment_intent: 'pi_Lab' } };
    else Object.assign(stripe.intent, { status: 'succeeded', amount_received: stripe.intent.amount });
    if (stripe.loseProcess) throw Error('synthetic response loss');
    return reply({ id: 'tmr_Lab' });
  }
  if (path === '/v1/payment_intents/pi_Lab' && options.method === 'GET') return reply(stripe.intent);
  if (path === '/v1/terminal/readers/tmr_Lab/cancel_action') { stripe.action = null; return reply({ id: 'tmr_Lab' }); }
  if (path === '/v1/payment_intents/pi_Lab/cancel') { stripe.intent.status = 'canceled'; return reply(stripe.intent); }
  throw Error('Unexpected fixture endpoint');
}

const handler = (options = {}) => terminalHttp({ ...config, ...options }, { fetchImpl: fixtureFetch });
async function request(input, handle = handler(), origin = appOrigin) {
  const res = await handle(new Request('https://fixture.invalid/terminal-payment', { method: 'POST', body: JSON.stringify(input),
    headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer synthetic.jwt.fixture' } }));
  return { http: res.status, body: await res.json() };
}
const follow = (data, action = 'status') => ({ action, location_id: data.location_id, operation_id: data.operation_id });
const writes = () => stripe.calls.filter(call => call.method === 'POST');
const counts = () => JSON.parse(sql(`select jsonb_build_object('sales',(select count(*) from sales),'items',(select count(*) from sale_items),
  'stock',(select qty from inventory_stock),'moves',(select count(*) from inventory_transactions),'ledger',(select count(*) from cash_flow),
  'audit',(select count(*) from audit_logs),'guards',(select count(*) from terminal_private.sale_authorizations));`));

test('approved payment uses a single durable reservation and a real atomic sale, even after restart and replay', async () => {
  const data = cart();
  assert.equal((await request(data)).body.state, 'approved');
  assert.equal((await request(follow(data), handler({ allowCharges: false }))).body.state, 'approved');
  assert.equal((await request(data)).body.state, 'approved');
  assert.equal(writes().length, 2);
  assert(writes().every(call => call.key.includes(data.operation_id)));
  assert.deepEqual(counts(), { sales: 1, items: 1, stock: 9.5, moves: 1, ledger: 1, audit: 1, guards: 0 });
  assert.equal(sql('select total from sales;'), '9.65');
});

test('unauthenticated, inactive, cross-company and wrong amount requests cannot reach Stripe writes', async () => {
  const data = cart();
  const withoutAuth = await handler()(new Request('https://fixture.invalid/terminal-payment', { method: 'POST',
    headers: { Origin: appOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }));
  assert.equal(withoutAuth.status, 401);
  assert.equal((await request(data, handler(), 'https://other.invalid')).http, 403);
  actor = outsider;
  assert.equal((await request(data)).http, 403);
  actor = employee;
  assert.equal((await request(data)).http, 403);
  actor = owner;
  sql(`update public.users set active=false where id='${owner}';`);
  assert.equal((await request(data)).http, 403);
  sql(`update public.users set active=true where id='${owner}';`);
  assert.equal((await request({ ...data, expected_amount_minor: 999 })).body.code, 'TERMINAL_QUOTE_CHANGED');
  assert.equal((await request({ ...data, items: [{ product_id: product, qty: 2, unit_price: 1 }] })).http, 400);
  assert.equal(writes().length, 0);
  assert.throws(() => sql(`set role authenticated; select public.fn_terminal_finalize('${data.operation_id}');`), /permission denied/);
});

test('the sale guard rejects manually labeled Stripe payments and preserves other payment methods', () => {
  const create = method => sql(`set role authenticated; set request.jwt.claim.sub = '${owner}';
    select (public.fn_create_sale('${randomUUID()}','${business}','${location}','In Store',${q(method)},null,null,0,0,null,'Completed',
    ${jsonArg([{ product_id: product, qty: 1, unit_price: 5 }])})).payment_method;`);
  assert.throws(() => create('Stripe Terminal'), /TERMINAL_SALE_REQUIRES_VERIFIED_PAYMENT/);
  assert.equal(create('Other'), 'Other');
  assert.throws(() => sql("update public.sales set payment_method='Stripe Terminal';"), /TERMINAL_SALE_REQUIRES_VERIFIED_PAYMENT/);
  assert.deepEqual(counts(), { sales: 1, items: 1, stock: 9.75, moves: 1, ledger: 1, audit: 1, guards: 0 });
});

test('reader offline prevents reservation and the same sale cannot be reserved twice concurrently', async () => {
  const data = cart();
  stripe.readerStatus = 'offline';
  assert.equal((await request(data)).body.code, 'READER_UNAVAILABLE');
  assert.equal(call('attempt', q(data.operation_id)), null);
  const concurrent = input => new Promise((resolve, reject) => {
    execFile(pg('psql'), [...psqlArgs(), '-c', rpcSql('reserve', [q(owner), jsonArg(input)])], { env: pgEnv, windowsHide: true },
      (err, stdout) => err ? reject(err) : resolve(JSON.parse(stdout.trim())));
  });
  const results = await Promise.all([concurrent(data), concurrent(data)]);
  assert.equal(results.filter(row => row.created).length, 1);
  assert.equal(writes().length, 0);
  assert.throws(() => call('reserve', q(owner), jsonArg({ ...data, operation_id: randomUUID() })), /TERMINAL_SALE_ALREADY_USED/);
});

test('a lost process response recovers the original intent, with no new charge', async () => {
  stripe.loseProcess = true;
  const data = cart();
  assert.equal((await request(data)).body.state, 'verifying');
  assert.equal(counts().sales, 0);
  assert.equal((await request(follow(data), handler())).body.state, 'approved');
  assert.equal(writes().length, 2);
  assert.equal(counts().ledger, 1);
});

test('commit failure rolls back all effects, then status finalizes only the same paid intent', async () => {
  sql(`create function public.qa_fail_ledger() returns trigger language plpgsql as $$begin raise exception 'synthetic commit failure'; end;$$;
    create trigger qa_fail_ledger before insert on public.cash_flow for each row execute function public.qa_fail_ledger();`);
  const data = cart();
  try {
    assert.equal((await request(data)).body.state, 'verifying');
    assert.deepEqual(counts(), { sales: 0, items: 0, stock: 10, moves: 0, ledger: 0, audit: 0, guards: 0 });
  } finally { sql('drop trigger qa_fail_ledger on public.cash_flow; drop function public.qa_fail_ledger();'); }
  assert.equal((await request(follow(data))).body.state, 'approved');
  assert.equal(writes().length, 2);
});

test('signed webhook binds a lost create response, and duplicate or old events cannot dispatch payment', async () => {
  stripe.loseCreate = true;
  const data = cart();
  const first = await request(data);
  assert.equal(first.body.state, 'verifying');
  assert.equal(first.body.can_cancel, false);
  const body = JSON.stringify({ id: 'evt_LabCreated', livemode: false, type: 'payment_intent.created', data: { object: stripe.intent } });
  const time = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', config.webhookSecret).update(`${time}.${body}`).digest('hex');
  const webhook = terminalHttp(config, { webhook: true, fetchImpl: fixtureFetch });
  const event = raw => new Request('https://fixture.invalid/webhook', { method: 'POST', body: raw,
    headers: { 'Content-Type': 'application/json', 'stripe-signature': `t=${time},v1=${signature}` } });
  assert.equal((await webhook(event(body + ' '))).status, 400);
  assert.equal((await webhook(event(body))).status, 200);
  const calls = stripe.calls.length;
  assert.equal((await webhook(event(body))).status, 200);
  assert.equal(stripe.calls.length, calls);
  assert.equal((await request(data)).body.can_cancel, true);
  assert.equal(writes().length, 1);
  assert.equal(counts().sales, 0);
});

test('decline and confirmed cancellation leave no paid sale or stock movement', async () => {
  stripe.decline = true;
  assert.equal((await request(cart())).body.state, 'declined');
  stripe.decline = false;
  stripe.keepPending = true;
  stripe.intent = null;
  const data = cart();
  // Distinct provider object for the second reservation in this scenario.
  sql('truncate terminal_private.attempts cascade;');
  assert.equal((await request(data)).body.state, 'verifying');
  assert.equal((await request(follow(data, 'cancel'))).body.state, 'canceled');
  assert.equal((await request(follow(data, 'cancel'))).body.state, 'canceled');
  assert.equal(writes().filter(call => call.path.endsWith('/cancel')).length, 1);
  assert.deepEqual(counts(), { sales: 0, items: 0, stock: 10, moves: 0, ledger: 0, audit: 0, guards: 0 });
});
