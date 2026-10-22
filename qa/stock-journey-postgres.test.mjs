import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STOCK_ACTORS, STOCK_FINGERPRINTS, STOCK_PRECISION_TARGET_FINGERPRINT, validateStockCatalog } from './stock-journey-core.mjs';
import { C1_FIXTURE, makeC1State, c1Plan, c1Payload, verifyC1View, sealC1Checkpoint, c1AuditContract } from './stock-c1-protocol.mjs';
import { reconcileC1Readonly } from './stock-journey.TEST.mjs';

// Exact captured functions, synthetic profiles/rows, isolated PostgreSQL only. No Supabase access.
const container=`nexalvo-stock-c-${process.pid}-${randomBytes(4).toString('hex')}`;
const captured=JSON.parse(readFileSync(new URL('./fixtures/stock-c-baseline.json',import.meta.url),'utf8'));
const catalog=readFileSync(new URL('./sql/stock_journey_preflight_readonly_TEST.sql',import.meta.url),'utf8');
const fixtureQuery=readFileSync(new URL('./sql/stock_journey_fixtures_readonly_TEST.sql',import.meta.url),'utf8');
const nextPhases=readFileSync(new URL('./sql/next_phases_contracts_readonly_TEST.sql',import.meta.url),'utf8');
const precision=readFileSync(new URL('./sql/stock_quantity_precision_preflight_readonly_TEST.sql',import.meta.url),'utf8');
const patch=readFileSync(new URL('../migrations/20261022_inventory_quantity_precision_TEST.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../migrations/20261022_inventory_quantity_precision_rollback_TEST.sql',import.meta.url),'utf8');
const platform=readFileSync(new URL('../migrations/20261016_platform_admin_TEST.sql',import.meta.url),'utf8');
const hardening=readFileSync(new URL('../migrations/20261017_catalog_security_hardening_TEST.sql',import.meta.url),'utf8');
const id={a:STOCK_ACTORS.A.business,b:STOCK_ACTORS.B.business,
  owner:'11111111-aaaa-4111-8111-111111111111',other:'22222222-bbbb-4222-8222-222222222222',manager:'33333333-cccc-4333-8333-333333333333',
  item:'44444444-dddd-4444-8444-444444444444',src:'55555555-eeee-4555-8555-555555555555',dst:'66666666-ffff-4666-8666-666666666666'};
let started=false;
const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']});
const sql=input=>docker(['exec','-i',container,'psql','-X','-U','postgres','-Atq','-v','ON_ERROR_STOP=1'],input).trim();
const readonly=input=>JSON.parse(sql('BEGIN READ ONLY;\n'+input+'\nROLLBACK;'));
const context=(actor=id.owner)=>`SET ROLE authenticated; SET request.jwt.claim.sub='${actor}';`;
const call=(fn,args)=>`SELECT public.${fn}(${args});`;
const adjust=qty=>call('fn_adjust_inventory_count',`'${id.a}','${id.item}','${id.src}',${qty},'C SYNTHETIC COUNT','C LOCAL'`);
const transfer=(from=id.src,to=id.dst,qty=0.125)=>call('fn_transfer_inventory',`'${id.a}','${id.item}','${from}','${to}',${qty},'C LOCAL'`);
function reset(cost=0.1){
  sql(`TRUNCATE public.inventory_transactions,public.waste_transactions,public.inventory_stock;
    INSERT INTO public.inventory_stock(inventory_item_id,location_id,qty,avg_cost_per_unit)
    VALUES('${id.item}','${id.src}',2,0.1),('${id.item}','${id.dst}',2,${cost});`);
}
function balances(){return JSON.parse(sql(`SELECT jsonb_agg(jsonb_build_object('qty',qty,'cost',avg_cost_per_unit) ORDER BY location_id) FROM public.inventory_stock;`));}
function counts(){return JSON.parse(sql(`SELECT jsonb_build_object('stock',(SELECT count(*) FROM inventory_stock),'tx',(SELECT count(*) FROM inventory_transactions),'waste',(SELECT count(*) FROM waste_transactions));`));}
before(async()=>{
  docker(['run','--rm','--name',container,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','-d','postgres:17-alpine']);started=true;
  for(let i=0;i<100;i++){try{docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{if(i===99)throw Error('C_DISPOSABLE_POSTGRES_NOT_READY');await new Promise(r=>setTimeout(r,100));}}
  sql(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE public.businesses(id uuid PRIMARY KEY,platform_status text DEFAULT 'ACTIVE');
    CREATE TABLE public.users(id uuid PRIMARY KEY,business_id uuid,role text,active boolean,permission_overrides jsonb DEFAULT '{}');
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
    CREATE TABLE public.purchase_order_items(id uuid PRIMARY KEY,purchase_order_id uuid,inventory_item_id uuid,qty_ordered numeric,unit text,unit_cost numeric,received_qty numeric);
    CREATE TABLE public.product_recipes(id uuid PRIMARY KEY,inventory_item_id uuid);
    CREATE TABLE public.cash_flow(id uuid PRIMARY KEY);
    CREATE TABLE public.audit_logs(id uuid PRIMARY KEY);
    INSERT INTO public.businesses(id) VALUES('${id.a}'),('${id.b}');
    INSERT INTO public.users(id,business_id,role,active) VALUES('${id.owner}','${id.a}','OWNER',true),('${id.other}','${id.b}','OWNER',true),('${id.manager}','${id.a}','MANAGER',true);
    INSERT INTO public.inventory_items(id,business_id,name,unit,active) VALUES('${id.item}','${id.a}','SYNTHETIC C ITEM','kg',true);
    INSERT INTO public.locations VALUES('${id.src}','${id.a}','SYNTHETIC C SOURCE',true),('${id.dst}','${id.a}','SYNTHETIC C TARGET',true);`);
  for(const helper of ['current_business_id','user_can']){
    const match=platform.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${helper}\\([\\s\\S]*?\\$function\\$\\s*;`));assert.ok(match);sql(match[0]);
  }
  for(const f of captured.functions)sql(f.definition+';');
  sql(hardening.match(/CREATE OR REPLACE FUNCTION public\.fn_write_audit\([\s\S]*?\$function\$\s*;/)[0]);
  sql(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
    ${Object.keys(STOCK_FINGERPRINTS).filter(n=>n!=='fn_record_inventory_movement').map(n=>`GRANT EXECUTE ON FUNCTION public.${n} TO authenticated;`).join('\n')}
    GRANT EXECUTE ON FUNCTION public.fn_write_audit(text,text) TO authenticated;
    ${['inventory_items','inventory_stock','inventory_transactions','waste_transactions','locations','product_recipes','purchase_orders','purchase_order_items','cash_flow','audit_logs'].map(t=>`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`).join('\n')}`);
  reset();
});
after(()=>{if(started)docker(['stop',container]);});

test('C exact historical definitions and tenant helpers reproduce all nine fingerprints in READ ONLY catalog SQL',()=>{
  const before=counts();const report=readonly(catalog);
  assert.equal(report.status,'PASS_MATCHED_HISTORICAL_CONTRACTS');assert.equal(report.functions.length,9);validateStockCatalog(report);
  c1AuditContract(report);
  sql('GRANT EXECUTE ON FUNCTION public.fn_write_audit(text,text) TO anon;');
  assert.throws(()=>c1AuditContract(readonly(catalog)));
  sql('REVOKE EXECUTE ON FUNCTION public.fn_write_audit(text,text) FROM anon;');
  const discovery=readonly(nextPhases);assert.equal(discovery.functions.length,12);assert.equal(discovery.persistent_authorized,false);
  for(const f of report.functions)assert.equal(f.fingerprint,STOCK_FINGERPRINTS[f.name],f.name);
  sql('GRANT SELECT(id) ON public.inventory_items TO anon;');
  assert.equal(readonly(catalog).status,'BLOCKED_CATALOG_DRIFT');
  sql('REVOKE SELECT(id) ON public.inventory_items FROM anon;');
  assert.equal(readonly(precision).status,'READY_FOR_REVIEW_NOT_AUTHORIZED');assert.deepEqual(counts(),before);
});
test('C fixture discovery SQL accepts only new C rows without recipe purchase waste or movement history',()=>{
  reset();assert.equal(readonly(fixtureQuery).eligible_count,0);
  sql("UPDATE public.inventory_items SET name='ZZ_QA_STOCK_C_LOCAL_EXCLUSIVE'; UPDATE public.locations SET name='ZZ_QA_STOCK_C_'||upper(replace(id::text,'-',''));");
  assert.equal(readonly(fixtureQuery).eligible_count,1);
  sql(`INSERT INTO public.product_recipes VALUES(gen_random_uuid(),'${id.item}');`);
  assert.equal(readonly(fixtureQuery).eligible_count,0);
  sql('TRUNCATE public.product_recipes;');
  sql(context()+adjust(2.125));assert.equal(readonly(fixtureQuery).eligible_count,0);
});
test('C captured functions execute count waste and two-way transfer with restored quantity/cost and retained waste history',()=>{
  reset();
  sql(context()+adjust(2.125)+call('fn_record_waste',`'${id.a}','${id.item}','${id.src}',0.125,'C LOCAL LOSS','C LOCAL'`)+transfer()+transfer(id.dst,id.src));
  assert.deepEqual(balances(),[{qty:2,cost:0.1},{qty:2,cost:0.1}]);
  assert.deepEqual(counts(),{stock:2,tx:6,waste:1});
  assert.equal(Number(sql('SELECT sum(qty_change) FROM public.inventory_transactions;')),0);
  assert.equal(Number(sql('SELECT count(*) FROM public.cash_flow;')),0);
});
test('C unequal average costs prove reverse transfer alone cannot restore the snapshot',()=>{
  reset(0.2);sql(context()+transfer(id.src,id.dst,0.5)+transfer(id.dst,id.src,0.5));
  assert.deepEqual(balances(),[{qty:2,cost:0.12},{qty:2,cost:0.18}]);
  assert.deepEqual(counts(),{stock:2,tx:4,waste:0});
});
test('C tenant permission NULL nonfinite overdraw and anon/internal guards preserve the ledger',()=>{
  reset();const before=counts();
  for(const command of [context(id.other)+adjust(3),context(id.manager)+adjust(3),context()+adjust("'NaN'"),context()+adjust("'Infinity'"),context()+adjust('NULL'),
    context()+transfer(id.src,id.dst,99),context()+transfer(id.src,id.src),
    "SET ROLE anon;"+adjust(3),context()+call('fn_record_inventory_movement',`'${id.a}','${id.item}','${id.src}','ADJUSTMENT',1,0.1,NULL,NULL,NULL,'LOCAL',true`)])assert.throws(()=>sql(command));
  assert.deepEqual(counts(),before);assert.deepEqual(balances(),[{qty:2,cost:0.1},{qty:2,cost:0.1}]);
});
test('C opposite transfers overlap waiting on UUID-ordered locks and finish without deadlock or lost quantity',async()=>{
  reset();
  const args=['exec','-i',container,'psql','-X','-U','postgres','-Atq','-v','ON_ERROR_STOP=1'];
  function client(statement){const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',v=>output+=v);child.stderr.resume();
    const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve(output):reject(Error('C_LOCAL_SQL_CLIENT_FAILED')));});child.stdin.end(statement);return done;}
  const first=client(`BEGIN;${context()}${transfer()}SELECT pg_sleep(1.5);COMMIT;`);
  let held=false;
  for(let i=0;i<40;i++){held=Number(sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep';"))>0;if(held)break;await new Promise(r=>setTimeout(r,25));}
  assert.ok(held,'first synthetic transfer must hold its locks');
  const second=client(`SET application_name='C_SECOND'; SET statement_timeout='5s';${context()}${transfer(id.dst,id.src)}`);
  let waiting=false;
  for(let i=0;i<40;i++){waiting=Number(sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='C_SECOND' AND wait_event_type='Lock';"))>0;if(waiting)break;await new Promise(r=>setTimeout(r,25));}
  await Promise.all([first,second]);assert.ok(waiting,'real PostgreSQL lock overlap required');
  assert.deepEqual(balances(),[{qty:2,cost:0.1},{qty:2,cost:0.1}]);assert.equal(counts().tx,4);
});
test('C precision bug reproduced, explicit patch rejects sub-milliquantities atomically and rollback restores exact function/ACL',()=>{
  reset();sql(context()+adjust(2.0001));
  assert.equal(Number(sql('SELECT qty FROM inventory_stock ORDER BY location_id LIMIT 1;')),2);
  assert.equal(Number(sql('SELECT sum(qty_change) FROM inventory_transactions;')),0.0001,'legacy ledger disagrees with rounded stock');
  assert.throws(()=>sql(patch),'unapproved patch must not execute');
  const acl=sql("SELECT proacl::text FROM pg_proc WHERE proname='fn_record_inventory_movement';");
  const before=counts();sql("SET nexalvo.stock_precision_authorized='msinksoilkluooxenecy:APPLY_EXPLICIT';"+patch);
  const after=readonly(catalog);assert.equal(after.status,'PASS_MATCHED_HISTORICAL_CONTRACTS');validateStockCatalog(after);
  assert.equal(after.functions.find(f=>f.name==='fn_record_inventory_movement').fingerprint,STOCK_PRECISION_TARGET_FINGERPRINT);
  assert.equal(readonly(precision).status,'ALREADY_APPLIED_DO_NOT_REAPPLY');
  assert.throws(()=>sql(context()+adjust(2.0001)));assert.deepEqual(counts(),before);
  sql(context()+adjust(2.125));assert.equal(Number(sql('SELECT qty FROM inventory_stock ORDER BY location_id LIMIT 1;')),2.125);
  const beforeRollback=counts();
  sql("SET nexalvo.stock_precision_authorized='msinksoilkluooxenecy:ROLLBACK_EXPLICIT';"+rollback);
  assert.equal(readonly(catalog).functions.find(f=>f.name==='fn_record_inventory_movement').fingerprint,STOCK_FINGERPRINTS.fn_record_inventory_movement);
  assert.equal(sql("SELECT proacl::text FROM pg_proc WHERE proname='fn_record_inventory_movement';"),acl);
  assert.deepEqual(counts(),beforeRollback);
});

test('C1 exact patched SQL proves six linked movements and read-only reconciliation after a lost response without replay', async()=>{
  reset();
  sql("SET nexalvo.stock_precision_authorized='msinksoilkluooxenecy:APPLY_EXPLICIT';"+patch);
  // Synthetic isolated database only. UUIDs mirror the authorized scope, never Supabase data.
  sql(`UPDATE users SET id='${STOCK_ACTORS.A.owner}' WHERE id='${id.owner}';
    UPDATE inventory_items SET id='${C1_FIXTURE.item}',name='${C1_FIXTURE.name}' WHERE id='${id.item}';
    UPDATE locations SET id='${C1_FIXTURE.source}',name='${C1_FIXTURE.sourceName}' WHERE id='${id.src}';
    UPDATE locations SET id='${C1_FIXTURE.target}',name='${C1_FIXTURE.targetName}' WHERE id='${id.dst}';
    UPDATE inventory_stock SET inventory_item_id='${C1_FIXTURE.item}',location_id=CASE WHEN location_id='${id.src}' THEN '${C1_FIXTURE.source}'::uuid ELSE '${C1_FIXTURE.target}'::uuid END;`);
  const view=()=>JSON.parse(sql(`SELECT jsonb_build_object(
    'item',(SELECT to_jsonb(i) FROM inventory_items i),'locations',(SELECT jsonb_agg(to_jsonb(l)) FROM locations l),
    'stocks',(SELECT jsonb_agg(to_jsonb(s)) FROM inventory_stock s),
    'transactions',(SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM inventory_transactions t),
    'recipes','[]'::jsonb,'purchaseLines','[]'::jsonb,'waste','[]'::jsonb,'audit','[]'::jsonb);`));
  const {audit,...fixture}=view();
  const state=makeC1State(fixture,audit,'a'.repeat(40),'b'.repeat(64),{at:Date.now(),until:Date.now()+60000});
  const directory=mkdtempSync(join(tmpdir(),'nexalvo-stock-c1-local-pg-')),file=join(directory,'stock-recovery.json');
  try {
    for(const [i,step] of c1Plan(state).entries()){
      if(i===0)c1Payload(state,step.rpc,step.payload);
      state.operations.push({name:step.name,status:'DISPATCHED',auditAttempted:false});state.pending='MOVEMENT';
      const p=step.payload,quote=value=>`'${String(value).replaceAll("'","''")}'`;
      const args=step.rpc==='fn_adjust_inventory_count'
        ? [p.p_business_id,p.p_inventory_item_id,p.p_location_id,p.p_new_qty,p.p_reason,p.p_notes]
        : [p.p_business_id,p.p_inventory_item_id,p.p_from_location_id,p.p_to_location_id,p.p_qty,p.p_notes];
      sql(context(STOCK_ACTORS.A.owner)+call(step.rpc,args.map(quote).join(',')));
      const observed=view();verifyC1View(state,observed,i+1,0);
      if(i===0){
        writeFileSync(file,sealC1Checkpoint(state),{mode:0o600});const bytes=readFileSync(file),before=counts();
        const proof=await reconcileC1Readonly(file,{view:async()=>view()});
        assert.equal(proof.reconciliation.stage,1);assert.equal(proof.stock_requests_forwarded,0);assert.equal(proof.full_homologation,false);
        assert.ok(readFileSync(file).equals(bytes));assert.deepEqual(counts(),before);
        assert.throws(()=>c1Payload(state,step.rpc,step.payload),'unknown response never permits replay');
      }
      const note=step.rpc==='fn_adjust_inventory_count'?'Reason: Physical Count — '+p.p_notes:p.p_notes;
      Object.assign(state.operations.at(-1),{status:'CONFIRMED',rows:observed.transactions.filter(r=>r.note===note)});
      state.confirmed=i+1;state.pending=null;
    }
    assert.equal(verifyC1View(state,view(),4,0).stock_restored,true);
    assert.equal(counts().tx,6);assert.equal(counts().waste,0);
    assert.equal(Number(sql('SELECT sum(qty_change) FROM inventory_transactions;')),0);
    assert.equal(Number(sql('SELECT count(*) FROM cash_flow;')),0);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
