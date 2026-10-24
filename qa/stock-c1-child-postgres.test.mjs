import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STOCK_ACTORS, STOCK_FINGERPRINTS } from './stock-journey-core.mjs';
import { C1_FIXTURE, C1_CHECKS, makeC1State, sealC1Checkpoint, c1Plan, c1Payload,
  c1AuditPayload, c1ExpectedAudit, verifyC1View } from './stock-c1-protocol.mjs';
import { createC1BrowserGuard } from './stock-c1-browser-guard.mjs';
import { validateC1ChildSecurity, canonicalSecurityDigest } from './stock-c1-child-security.mjs';

// Exact reviewed functions and synthetic rows in an isolated PostgreSQL container.
// No login, QA credentials, Supabase requests or original checkpoint is used.
const container = `nexalvo-c1-child-${process.pid}-${randomBytes(4).toString('hex')}`;
const captured = JSON.parse(readFileSync(new URL('./fixtures/stock-c-baseline.json', import.meta.url), 'utf8'));
const platform = readFileSync(new URL('../migrations/20261016_platform_admin_TEST.sql', import.meta.url), 'utf8');
const precision = readFileSync(new URL('../migrations/20261022_inventory_quantity_precision_TEST.sql', import.meta.url), 'utf8');
const fixture = C1_FIXTURE;
const manager = '33333333-cccc-4333-8333-333333333333';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let started = false;
const docker = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
const sql = input => docker(['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-Atq', '-v', 'ON_ERROR_STOP=1'], input).trim();
const quote = value => value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
const context = (actor = STOCK_ACTORS.A.owner) => `SET ROLE authenticated; SET request.jwt.claim.sub=${quote(actor)};`;
const currentView = () => JSON.parse(sql(`BEGIN READ ONLY;
  SELECT jsonb_build_object(
    'item',(SELECT to_jsonb(i) FROM public.inventory_items i WHERE id='${fixture.item}'),
    'locations',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.locations l),
    'stocks',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.inventory_stock s),
    'transactions',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.inventory_transactions t),
    'recipes','[]'::jsonb,'purchaseLines','[]'::jsonb,'waste','[]'::jsonb,
    'audit',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) FROM public.audit_logs a)); ROLLBACK;`));
const counts = () => JSON.parse(sql(`SELECT jsonb_build_object(
  'movements',(SELECT count(*) FROM public.inventory_transactions),
  'audits',(SELECT count(*) FROM public.audit_logs),
  'waste',(SELECT count(*) FROM public.waste_transactions),
  'financial',(SELECT count(*) FROM public.cash_flow));`));
function reset() {
  sql(`TRUNCATE public.inventory_transactions,public.waste_transactions,public.audit_logs,public.inventory_stock;
    INSERT INTO public.inventory_stock(inventory_item_id,location_id,qty,avg_cost_per_unit)
    VALUES('${fixture.item}','${fixture.source}',2,0.1),('${fixture.item}','${fixture.target}',2,0.1);`);
}
function createState(parent = false) {
  const { audit, ...snapshot } = currentView();
  const state = makeC1State(snapshot, audit, 'b'.repeat(40), 'c'.repeat(64), { at: Date.now(), until: Date.now() + 60000 });
  state.phase = parent ? 'PROBES_CONFIRMED' : 'SNAPSHOT';
  state.probes = parent ? [{ actor: 'B', status: 'DENIED' }, { actor: 'anon', status: 'DENIED' }] : [];
  for (const name of C1_CHECKS.slice(0, 8)) state.checks[name] = 'PASS';
  return state;
}
function invokeMovement(step, actor = STOCK_ACTORS.A.owner) {
  const p = step.payload;
  const args = step.rpc === 'fn_adjust_inventory_count'
    ? [p.p_business_id, p.p_inventory_item_id, p.p_location_id, p.p_new_qty, p.p_reason, p.p_notes]
    : [p.p_business_id, p.p_inventory_item_id, p.p_from_location_id, p.p_to_location_id, p.p_qty, p.p_notes];
  return JSON.parse(sql(context(actor) + `SELECT to_jsonb(public.${step.rpc}(${args.map(quote).join(',')}));`));
}
function prepareMovement(state, index) {
  const step = c1Plan(state)[index];
  c1Payload(state, step.rpc, step.payload);
  state.operations.push({ name: step.name, status: 'DISPATCHED', auditAttempted: false });
  state.pending = 'MOVEMENT'; state.phase = 'MOVEMENT_PENDING';
  return step;
}
function confirmMovement(state, index) {
  const step = c1Plan(state)[index], view = currentView();
  verifyC1View(state, view, index + 1, index);
  const note = step.rpc === 'fn_adjust_inventory_count' ? 'Reason: Physical Count — ' + step.payload.p_notes : step.payload.p_notes;
  Object.assign(state.operations.at(-1), { status: 'CONFIRMED', rows: view.transactions.filter(row => row.note === note) });
  state.confirmed = index + 1; state.pending = null; state.phase = 'MOVEMENT_CONFIRMED';
}
function prepareAudit(state) {
  const audit = c1ExpectedAudit(state, state.confirmed - 1);
  const payload = { p_action: audit.action.replace('Client: ', ''), p_details: audit.details };
  c1AuditPayload(state, payload); state.operations.at(-1).auditAttempted = true;
  state.pending = 'AUDIT'; state.phase = 'AUDIT_PENDING';
  return payload;
}
function invokeAudit(payload) {
  return JSON.parse(sql(context() + `SELECT to_jsonb(public.fn_write_audit(${quote(payload.p_action)},${quote(payload.p_details)}));`));
}
function mockRecoveryStore(state, bytes) {
  const digest = hash(Buffer.from(sealC1Checkpoint(state))), parentHash = hash(bytes);
  return { parentHash, load: () => ({ state: structuredClone(state), lineage: { parentHash }, childSha256: digest }),
    assertParentUnchanged: () => assert.equal(hash(bytes), parentHash) };
}
async function recover(store) {
  const { reconcileC1ChildReadonly } = await import('./stock-c1-child.TEST.mjs');
  return reconcileC1ChildReadonly(store, { view: async () => currentView() });
}

before(async () => {
  docker(['run', '--rm', '--name', container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-d', 'postgres:17-alpine']); started = true;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); break; }
    catch { if (attempt === 99) throw Error('C1_CHILD_DISPOSABLE_POSTGRES_NOT_READY'); await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE public.businesses(id uuid PRIMARY KEY,platform_status text DEFAULT 'ACTIVE');
    CREATE TABLE public.users(id uuid PRIMARY KEY,business_id uuid,role text,active boolean,permission_overrides jsonb DEFAULT '{}',name text DEFAULT 'SYNTHETIC CHILD USER');
    CREATE TABLE public.role_default_permissions(role text,permission_key text,granted boolean);
    CREATE TABLE public.inventory_items(id uuid PRIMARY KEY,business_id uuid,name text,unit text,active boolean DEFAULT true,supplier_id uuid);
    CREATE TABLE public.locations(id uuid PRIMARY KEY,business_id uuid,name text,active boolean DEFAULT true);
    CREATE TABLE public.inventory_stock(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),inventory_item_id uuid,location_id uuid,
      qty numeric NOT NULL DEFAULT 0,avg_cost_per_unit numeric NOT NULL DEFAULT 0,last_purchase_cost numeric,last_purchase_date timestamptz,
      created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),UNIQUE(inventory_item_id,location_id));
    CREATE TABLE public.inventory_transactions(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,business_id uuid,inventory_item_id uuid,location_id uuid,type text,
      qty_change numeric,unit text,unit_cost numeric,total_cost numeric,sale_id uuid,purchase_order_id uuid,related_transaction_id uuid,
      prev_avg_cost numeric,new_avg_cost numeric,note text,created_by uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE public.waste_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid,inventory_item_id uuid,location_id uuid,qty numeric,unit text,
      reason text,cost numeric,notes text,inventory_transaction_id uuid,created_by uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE public.purchase_orders(id uuid PRIMARY KEY,business_id uuid);
    CREATE TABLE public.purchase_order_items(id uuid PRIMARY KEY,purchase_order_id uuid,inventory_item_id uuid,qty_ordered numeric(18,3),unit text,unit_cost numeric(18,4),received_qty numeric(18,3));
    CREATE TABLE public.product_recipes(id uuid PRIMARY KEY,inventory_item_id uuid);
    CREATE TABLE public.cash_flow(id uuid PRIMARY KEY);
    CREATE TABLE public.audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid,user_id uuid,
      user_name_snapshot text,role_snapshot text,action text,details text,created_at timestamptz DEFAULT now());
    INSERT INTO public.businesses(id) VALUES('${STOCK_ACTORS.A.business}'),('${STOCK_ACTORS.B.business}');
    INSERT INTO public.users(id,business_id,role,active) VALUES('${STOCK_ACTORS.A.owner}','${STOCK_ACTORS.A.business}','OWNER',true),
      ('${STOCK_ACTORS.B.owner}','${STOCK_ACTORS.B.business}','OWNER',true),('${manager}','${STOCK_ACTORS.A.business}','MANAGER',true);
    INSERT INTO public.inventory_items(id,business_id,name,unit,active) VALUES('${fixture.item}','${STOCK_ACTORS.A.business}','${fixture.name}','unit',true);
    INSERT INTO public.locations VALUES('${fixture.source}','${STOCK_ACTORS.A.business}','${fixture.sourceName}',true),
      ('${fixture.target}','${STOCK_ACTORS.A.business}','${fixture.targetName}',true);`);
  for (const name of ['current_business_id', 'user_can', 'fn_write_audit', 'fn_session_access_status']) {
    const definition = platform.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$\\s*;`));
    assert.ok(definition); sql(definition[0]);
  }
  for (const fn of captured.functions) sql(fn.definition + ';');
  sql(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated;
    ${Object.keys(STOCK_FINGERPRINTS).filter(name => name !== 'fn_record_inventory_movement').map(name => `GRANT EXECUTE ON FUNCTION public.${name} TO authenticated;`).join('\n')}
    GRANT EXECUTE ON FUNCTION public.fn_write_audit(text,text),public.fn_read_waste_transactions_secure(),public.fn_session_access_status() TO authenticated;
    ${['businesses', 'users', 'role_default_permissions', 'inventory_items', 'inventory_stock', 'inventory_transactions', 'waste_transactions',
      'locations', 'product_recipes', 'purchase_orders', 'purchase_order_items', 'cash_flow', 'audit_logs'].map(name => `ALTER TABLE public.${name} ENABLE ROW LEVEL SECURITY;`).join('\n')}`);
  reset();
  sql("SET nexalvo.stock_precision_authorized='msinksoilkluooxenecy:APPLY_EXPLICIT';" + precision);
});
after(() => { if (started) docker(['stop', container]); });

test('C1 child disposable PostgreSQL completes exactly four operations, six linked movements and four audits without altering its synthetic parent', async () => {
  reset(); const parent = createState(true), parentBytes = Buffer.from(sealC1Checkpoint(parent));
  const directory = mkdtempSync(join(tmpdir(), 'nexalvo-stock-c1-child-pg-'));
  const parentFile = join(directory, 'stock-recovery.json'); writeFileSync(parentFile, parentBytes, { mode: 0o600 });
  let store, reserved = false;
  try {
    const { openC1ChildStore } = await import('./stock-c1-child-store.mjs');
    store = openC1ChildStore({ parentFile, parentSha256: hash(parentBytes), env: { QA_C1_CHILD_EXECUTION_AUTHORIZED: 'TEST_ONLY_EXPLICIT_C1_CHILD_20261023' } });
    const state = createState(); state.phase = 'SNAPSHOT'; store.reserve(state, 'd'.repeat(64)); reserved = true;
    for (const index of [0, 1, 2, 3]) {
      const step = prepareMovement(state, index); store.save(state.phase);
      invokeMovement(step); confirmMovement(state, index); store.save(state.phase);
      const payload = prepareAudit(state); store.save(state.phase);
      const row = invokeAudit(payload); verifyC1View(state, currentView(), index + 1);
      state.operations.at(-1).auditRow = row; state.pending = null; state.phase = 'AUDIT_CONFIRMED'; store.save(state.phase);
    }
    const proof = verifyC1View(state, currentView(), 4);
    assert.equal(proof.stock_restored, true); assert.equal(proof.movement_rows, 6); assert.equal(proof.audit_rows_added, 4);
    assert.deepEqual(counts(), { movements: 6, audits: 4, waste: 0, financial: 0 });
    assert.equal(Number(sql('SELECT sum(qty_change) FROM public.inventory_transactions;')), 0);
    assert.equal(Number(sql("SELECT count(*) FROM public.inventory_transactions WHERE type='TRANSFER_IN' AND related_transaction_id IS NOT NULL;")), 2);
    assert.ok(readFileSync(parentFile).equals(parentBytes)); store.assertParentUnchanged();
    assert.throws(() => store.assertUnreserved());
    assert.throws(() => c1Payload(state, c1Plan(state)[0].rpc, c1Plan(state)[0].payload), /C1_REPLAY_OR_OUT_OF_SCOPE_WRITE/);
    const before = counts(), childBefore = readFileSync(store.childFile);
    const report = await recover(store);
    assert.equal(report.reconciliation.stage, 4); assert.equal(report.restored, true); assert.equal(report.full_homologation, false);
    assert.equal(report.resume_allowed, false); assert.deepEqual(counts(), before);
    assert.ok(readFileSync(store.childFile).equals(childBefore)); assert.ok(readFileSync(parentFile).equals(parentBytes));
  } finally {
    // Only this test's synthetic files, never a real checkpoint or another reservation.
    if (reserved) for (const file of [store.childFile, store.childFile + '.next', store.reservationFile]) if (existsSync(file)) unlinkSync(file);
    rmSync(directory, { recursive: true, force: true });
  }
});

test('C1 child read-only recovery proves a committed movement after its response is lost, without replay or invented audit', async () => {
  reset(); const state = createState(), parentBytes = Buffer.from(sealC1Checkpoint(state));
  const step = prepareMovement(state, 0); invokeMovement(step);
  const before = counts(), report = await recover(mockRecoveryStore(state, parentBytes));
  assert.equal(report.reconciliation.stage, 1); assert.equal(report.reconciliation.movement_rows, 1);
  assert.equal(report.reconciliation.audit_rows_added, 0); assert.equal(report.pending_intent_retained, true);
  assert.equal(report.full_homologation, false); assert.equal(report.resume_allowed, false);
  assert.equal(report.stock_requests_forwarded, 0); assert.equal(report.audit_requests_forwarded, 0);
  assert.equal(state.pending, 'MOVEMENT'); assert.deepEqual(counts(), before);
  assert.throws(() => c1Payload(state, step.rpc, step.payload), /C1_REPLAY_OR_OUT_OF_SCOPE_WRITE/);
});

for (const committed of [false, true]) test(`C1 child read-only recovery retains audit intent when audit commit=${committed} and never resends it`, async () => {
  reset(); const state = createState(), parentBytes = Buffer.from(sealC1Checkpoint(state));
  invokeMovement(prepareMovement(state, 0)); confirmMovement(state, 0);
  const payload = prepareAudit(state); if (committed) invokeAudit(payload);
  const before = counts(), report = await recover(mockRecoveryStore(state, parentBytes));
  assert.equal(report.reconciliation.stage, 1); assert.equal(report.reconciliation.audit_rows_added, committed ? 1 : 0);
  assert.equal(report.pending_intent_retained, true); assert.equal(report.resume_allowed, false); assert.equal(report.full_homologation, false);
  assert.equal(report.audit_requests_forwarded, 0); assert.deepEqual(counts(), before);
  assert.throws(() => c1AuditPayload(state, payload), /C1_AUDIT_REPLAY_FORBIDDEN|C1_AUDIT_WITHOUT_CONFIRMED_MOVEMENT/);
});

test('C1 child cannot infer rollback from an empty read after dispatched intent, or accept an extra committed movement', async () => {
  reset(); const state = createState(), parentBytes = Buffer.from(sealC1Checkpoint(state));
  const step = prepareMovement(state, 0), before = counts();
  await assert.rejects(recover(mockRecoveryStore(state, parentBytes))); assert.deepEqual(counts(), before);
  invokeMovement(step);
  sql(`INSERT INTO public.inventory_transactions SELECT gen_random_uuid(),business_id,inventory_item_id,location_id,type,qty_change,unit,unit_cost,total_cost,sale_id,purchase_order_id,related_transaction_id,prev_avg_cost,new_avg_cost,note,created_by,created_at FROM public.inventory_transactions LIMIT 1;`);
  const duplicated = counts(); await assert.rejects(recover(mockRecoveryStore(state, parentBytes))); assert.deepEqual(counts(), duplicated);
});

test('C1 child local SQL authorization and finite quantity guards reject forbidden callers without ledger or financial effects', () => {
  reset(); const state = createState(), step = c1Plan(state)[0], before = counts();
  for (const actor of [STOCK_ACTORS.B.owner, manager, '']) assert.throws(() => invokeMovement(step, actor));
  for (const quantity of ['NaN', 'Infinity', '-Infinity', null, 2.0001]) {
    const changed = structuredClone(step); changed.payload.p_new_qty = quantity; assert.throws(() => invokeMovement(changed));
  }
  assert.throws(() => sql(`SET ROLE anon; SELECT public.fn_adjust_inventory_count('${STOCK_ACTORS.A.business}','${fixture.item}','${fixture.source}',2.125,'Physical Count','SYNTHETIC DENIED');`));
  assert.deepEqual(counts(), before); verifyC1View(state, currentView(), 0);
});

test('C1 child actual dispatcher never reaches local SQL when durable movement intent fails', async () => {
  reset(); const state = createState(), before = counts(), errors = [];
  let forwarded = 0;
  const step = c1Plan(state)[0], token = 'SYNTHETIC_LOCAL_SESSION';
  const guard = createC1BrowserGuard({ local: 'http://127.0.0.1:4189', state, readView: async () => currentView(),
    save: () => { throw Error('SYNTHETIC_SAVE_FAILED'); }, windowGate: () => {}, counters: { stock_requests_forwarded: 0, audit_requests_forwarded: 0 },
    authorizedToken: token, onFailure: error => errors.push(error.code) });
  await guard({ request: () => ({ url: () => `https://msinksoilkluooxenecy.supabase.co/rest/v1/rpc/${step.rpc}`,
    method: () => 'POST', headers: () => ({ authorization: `Bearer ${token}` }), postDataJSON: () => step.payload }),
    fetch: async () => { forwarded++; invokeMovement(step); throw Error('MUST_NOT_FORWARD'); }, abort: async () => {} });
  assert.equal(forwarded, 0); assert.equal(errors.length, 1); assert.deepEqual(counts(), before);
});

test('C1 child security and purchase precision catalog SQL execute under READ ONLY against real PostgreSQL metadata', () => {
  const before = counts();
  const securitySQL = readFileSync(new URL('./sql/stock_c1_child_security_readonly_TEST.sql', import.meta.url), 'utf8');
  const purchaseSQL = readFileSync(new URL('./sql/purchase_precision_contracts_readonly_TEST.sql', import.meta.url), 'utf8');
  const security = JSON.parse(sql('BEGIN READ ONLY;\n' + securitySQL + '\nROLLBACK;'));
  const purchase = JSON.parse(sql('BEGIN READ ONLY;\n' + purchaseSQL + '\nROLLBACK;'));
  assert.equal(security.mode, 'READ_ONLY'); assert.equal(security.project_ref_expected, 'msinksoilkluooxenecy');
  assert.equal(security.functions.length, 12); assert.equal(security.tables.length, 13);
  assert.equal(sql(context() + 'BEGIN READ ONLY; SELECT public.fn_session_access_status(); ROLLBACK;'), 'ACTIVE');
  assert.throws(() => sql('SET ROLE anon; BEGIN READ ONLY; SELECT public.fn_session_access_status(); ROLLBACK;'));
  assert.deepEqual(security.triggers, []); assert.equal(security.counts.triggers, 0);
  const reviewedDigest = canonicalSecurityDigest(security);
  // The synthetic schema/functions above are the reviewed source for this local case.
  // Computing a digest alone is not approval of an unknown deployed catalog.
  const validated = validateC1ChildSecurity(security, reviewedDigest);
  assert.equal(validated.execution_authorized, false); assert.equal(validated.structural_checks_passed, true);
  const changedReturn = structuredClone(security);
  changedReturn.functions.find(row => row.name === 'fn_write_audit').return_type = 'text';
  assert.throws(() => validateC1ChildSecurity(changedReturn, canonicalSecurityDigest(changedReturn)), /C1_CHILD_SECURITY_FUNCTION_DRIFT/);
  try {
    sql(`CREATE FUNCTION public.fn_c1_child_synthetic_trigger() RETURNS trigger LANGUAGE plpgsql
      AS $$BEGIN RETURN NEW; END;$$;
      REVOKE ALL ON FUNCTION public.fn_c1_child_synthetic_trigger() FROM PUBLIC,anon,authenticated;
      CREATE TRIGGER c1_child_synthetic_trigger BEFORE UPDATE ON public.inventory_items
      FOR EACH ROW EXECUTE FUNCTION public.fn_c1_child_synthetic_trigger();`);
    const triggered = JSON.parse(sql('BEGIN READ ONLY;\n' + securitySQL + '\nROLLBACK;'));
    assert.equal(triggered.counts.triggers, 1); assert.equal(triggered.triggers.length, 1);
    assert.equal(triggered.triggers[0].table_name, 'inventory_items');
    assert.equal(triggered.triggers[0].function_name, 'fn_c1_child_synthetic_trigger');
    assert.equal(triggered.triggers[0].function_security_definer, false);
    const triggeredDigest = canonicalSecurityDigest(triggered);
    assert.notEqual(triggeredDigest, reviewedDigest);
    assert.throws(() => validateC1ChildSecurity(triggered, reviewedDigest), /C1_CHILD_SECURITY_REVIEWED_DIGEST_MISMATCH/);
    const triggerReview = validateC1ChildSecurity(triggered, triggeredDigest);
    assert.equal(triggerReview.execution_authorized, false);
    assert.ok(triggerReview.conditional_review_findings.some(row => row.code === 'TRIGGER_DEFINITION_REQUIRES_CONTEXT_REVIEW'));
    sql(`CREATE OR REPLACE FUNCTION public.fn_c1_child_synthetic_trigger() RETURNS trigger LANGUAGE plpgsql
      AS $$BEGIN PERFORM 1; RETURN NEW; END;$$;`);
    const changedBody = JSON.parse(sql('BEGIN READ ONLY;\n' + securitySQL + '\nROLLBACK;'));
    assert.equal(changedBody.triggers[0].definition, triggered.triggers[0].definition);
    assert.notEqual(changedBody.triggers[0].function_body_sha256, triggered.triggers[0].function_body_sha256);
    assert.notEqual(changedBody.triggers[0].function_fingerprint, triggered.triggers[0].function_fingerprint);
    assert.throws(() => validateC1ChildSecurity(changedBody, triggeredDigest), /C1_CHILD_SECURITY_REVIEWED_DIGEST_MISMATCH/);
  } finally {
    sql('DROP TRIGGER IF EXISTS c1_child_synthetic_trigger ON public.inventory_items; DROP FUNCTION IF EXISTS public.fn_c1_child_synthetic_trigger();');
  }
  assert.equal(purchase.mode, 'READ_ONLY'); assert.equal(purchase.project_ref_expected, 'msinksoilkluooxenecy');
  assert.ok(JSON.stringify(purchase).includes('numeric(18,3)'));
  assert.ok(JSON.stringify(purchase).includes('received_qty'));
  assert.deepEqual(counts(), before);
});
