import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SALE_HOST, SALE_ACTORS, SALE_FINGERPRINTS, SALE_INTERNAL_FUNCTIONS, SALE_TABLES, saleConfiguration, validateSaleCatalog,
  validateSaleFixture, validateSalePayload, assertSaleObserved, saleAuditQuery, assertSaleAudit, safeSaleReport } from './sale-journey-core.mjs';
import { saleJourney, recordSaleFailure, inspectCancelledSaleCheckpoint } from './sale-journey.TEST.mjs';

const product='11111111-1111-4111-8111-111111111111',location='22222222-2222-4222-8222-222222222222';
const item='33333333-3333-4333-8333-333333333333',sale='44444444-4444-4444-8444-444444444444';
const runId='55555555-5555-4555-8555-555555555555',business=SALE_ACTORS.A.business;
const env={QA_SALE_JOURNEY_AUTHORIZED:'TEST_ONLY_EXPLICIT',QA_SALE_EXCLUSIVE_WINDOW:'TEST_ONLY_EXCLUSIVE_WINDOW',
  QA_SUPABASE_URL:`https://${SALE_HOST}`,QA_SUPABASE_ANON_KEY:'sb_publishable_SIMULATED',
  QA_TWO_TENANT_A_EMAIL:'a@example.invalid',QA_TWO_TENANT_A_PASSWORD:'SIMULATED_A',
  QA_TWO_TENANT_B_EMAIL:'b@example.invalid',QA_TWO_TENANT_B_PASSWORD:'SIMULATED_B',QA_SALE_PRODUCT_ID:product,QA_SALE_LOCATION_ID:location};
function fixture(){
  const s={runId,product:{id:product,business_id:business,name:'ZZ_QA_SALE_EXCLUSIVE',active:true,price:0.5},
    location:{id:location,business_id:business,active:true},business:{id:business,currency:'USD',tax_enabled:true,tax_rate:7.25},
    recipes:[{product_id:product,inventory_item_id:item,qty_per_unit:0.25}],
    recipeUsage:[{product_id:product,inventory_item_id:item}],inventoryItems:[{id:item,business_id:business,name:'ZZ_QA_INGREDIENT',active:true}],
    stocks:[{id:'stock',inventory_item_id:item,location_id:location,qty:10,avg_cost_per_unit:0.2}],
    salesHistory:[],purchaseLines:[],lists:[{list_type:'payment_method',value:'Other',active:true},{list_type:'channel',value:'In Store',active:true}]};
  s.expected=validateSaleFixture(s);return s;
}
function payload(s){return{p_sale_id:sale,p_business_id:business,p_location_id:location,p_payment_method:'Other',p_channel:s.expected.channel,
  p_notes:s.expected.note,p_employee_id:null,p_customer_id:null,p_fulfillment_status:'Received',p_discount:s.expected.discount,p_tax:s.expected.tax,
  p_items:[{product_id:product,qty:1,unit_price:0.5}]};}
function observation(s,cancelled=false){
  return{sales:[{id:sale,business_id:business,location_id:location,payment_method:'Other',channel:s.expected.channel,notes:s.expected.note,
    status:cancelled?'cancelled':'completed',cancelled_at:cancelled?'2026-10-21T00:00:00Z':null,subtotal:0.5,discount:s.expected.discount,tax:s.expected.tax,total:s.expected.totalCents/100}],
    items:[{id:'line',sale_id:sale,product_id:product,qty:1,unit_price:0.5}],
    cash:[{id:'income',type:'income',business_id:business,location_id:location,sale_id:sale,payment_method:'Other',amount:s.expected.totalCents/100},
      ...(cancelled?[{id:'refund',type:'expense',category:'Sale Cancellation',business_id:business,location_id:location,sale_id:sale,payment_method:'Other',amount:s.expected.totalCents/100}]:[])],
    stocks:[{...s.stocks[0],qty:cancelled?10:9.75}],
    movements:[{id:'sale-movement',type:'SALE',inventory_item_id:item,business_id:business,location_id:location,sale_id:sale,qty_change:-0.25},
      ...(cancelled?[{id:'reversal',type:'REVERSAL',inventory_item_id:item,business_id:business,location_id:location,sale_id:null,related_transaction_id:'sale-movement',qty_change:0.25}]:[])]};
}
function cancelledExecution(){
  const snapshot=fixture();snapshot.business.tax_enabled=false;snapshot.stocks[0].qty=1;snapshot.stocks[0].avg_cost_per_unit=0.1;
  snapshot.expected=validateSaleFixture(snapshot);snapshot.saleId=sale;snapshot.salePayload=payload(snapshot);
  snapshot.schemaVersion=1;snapshot.scope='B_JOURNEY_TEST';snapshot.phase='REVERSAL_CONFIRMED';
  snapshot.pending=null;snapshot.writeUncertain=false;snapshot.reverseAttempted=true;
  const before=observation(snapshot),state=observation(snapshot,true);state.sales[0].order_no=1253;state.stocks[0].qty=1;
  snapshot.committedRows={items:before.items,cash:before.cash,movements:before.movements};
  const audit=[{id:'created',business_id:business,action:'Sale Created',details:'Order #1253 - 0.49'},
    {id:'cancelled',business_id:business,action:'Sale Cancelled',details:'Order #1253'},
    {id:'client-reversed',business_id:business,action:'Client: Sale Reversed',details:'Order #1253 · $0.49 · inventory restored'}];
  return {snapshot,state,audit};
}
test('B authorization never grants A/C/D/E, changes target, uses privileged credentials or shares identities',()=>{
  assert.equal(saleConfiguration(env).productId,product);
  for(const change of [{QA_SALE_JOURNEY_AUTHORIZED:''},{QA_SALE_EXCLUSIVE_WINDOW:''},{QA_SUPABASE_URL:'https://another.invalid'},
    {QA_SUPABASE_URL:`https://${SALE_HOST}/?x=1`},{QA_SUPABASE_ANON_KEY:'sb_secret_NOT_ALLOWED'},
    {QA_TWO_TENANT_A_PASSWORD:''},{QA_TWO_TENANT_B_EMAIL:env.QA_TWO_TENANT_A_EMAIL},{QA_SALE_PRODUCT_ID:'wrong'}]){
    assert.throws(()=>saleConfiguration({...env,...change}));
  }
});
test('B runner without secure configuration blocks before login, filesystem snapshot or mutations',async()=>{
  const report=await saleJourney({});assert.equal(report.code,'SALE_AUTHORIZATION_REQUIRED');assert.equal(report.status,'BLOCKED');
  assert.equal(report.create_requests_forwarded,0);assert.equal(report.reversal_requests_forwarded,0);assert.equal(report.restored,false);
});
test('failed read-only recovery or preflight never starts compensation; write recovery remains explicit',async()=>{
  let writes=0;
  for(const args of [['--reconcile-readonly','private-checkpoint'],['--preflight']]){
    const report={restored:false};
    await recordSaleFailure(new Error('private upstream error'),{report,args,snapshot:{writeUncertain:true},
      compensate:async()=>{writes++;},checkpoint:'private-checkpoint'});
    assert.equal(writes,0);assert.equal(report.status,'BLOCKED');
    assert.equal(report.code,'UNKNOWN_SALE_RESULT_REQUIRES_RECONCILIATION');
    assert.equal(report.recovery_checkpoint_retained,true);
    assert.doesNotMatch(JSON.stringify(report),/private upstream error|private-checkpoint/);
  }
  const report={restored:false};
  await recordSaleFailure(new Error('private error'),{report,args:['--recover'],snapshot:{writeUncertain:false},
    compensate:async()=>{writes++;report.restored=true;},checkpoint:'private-checkpoint'});
  assert.equal(writes,1);assert.equal(report.restored,true);assert.equal(report.status,'BLOCKED');
});
test('fresh SQL attestation is required and drift, public grants or incomplete RLS never become PASS',()=>{
  const catalog={project_ref_expected:SALE_HOST.split('.')[0],captured_at:new Date().toISOString(),status:'PASS_VERSIONED_CONTRACTS',
    functions:Object.entries(SALE_FINGERPRINTS).map(([name,fingerprint])=>({name,fingerprint,anon_execute:false,authenticated_execute:!SALE_INTERNAL_FUNCTIONS.has(name)})),
    tables:SALE_TABLES.map(name=>({name,present:true,rls:true,anon_select:false}))};
  assert.equal(validateSaleCatalog([{sale_journey_preflight:catalog}]),catalog);
  for(const change of [{captured_at:'2020-01-01'},{status:'BLOCKED_CATALOG_DRIFT'},
    {functions:catalog.functions.map((r,i)=>i? r:{...r,fingerprint:'changed'})},
    {functions:catalog.functions.map((r,i)=>i? r:{...r,anon_execute:true})},
    {functions:catalog.functions.map(r=>r.name==='current_business_id'?{...r,fingerprint:'cb88feae5114dab5ff53ad35319544d4'}:r)},
    {functions:catalog.functions.map(r=>r.name==='user_can'?{...r,fingerprint:'dda7b605c2b77befc9ec56f7af184103'}:r)},
    {functions:catalog.functions.map(r=>r.name==='user_can'?{...r,authenticated_execute:false}:r)},
    {functions:catalog.functions.map(r=>r.name==='fn_record_inventory_movement'?{...r,authenticated_execute:true}:r)},
    {tables:catalog.tables.map((r,i)=>i?r:{...r,rls:false})},{tables:catalog.tables.map(()=>catalog.tables[0])}])assert.throws(()=>validateSaleCatalog({...catalog,...change}));
});
test('eligible fixture has USD price/tax within one dollar, exclusive ingredients and no history',()=>{
  const s=fixture();assert.equal(s.expected.totalCents,53);assert.equal(s.expected.discount,0.01);assert.equal(s.expected.paymentMethod,'Other');
  const reportedFixture=fixture();reportedFixture.product.name='ZZ_QA_SALE_B_20261021_EXCLUSIVE';
  reportedFixture.stocks[0].qty=1;reportedFixture.stocks[0].avg_cost_per_unit=0.1;
  assert.equal(validateSaleFixture(reportedFixture).totalCents,53,'reported fixture remains within USD 1 with this synthetic tax');
  const invalid=[s=>s.business.currency='BRL',s=>s.product.price=1.01,s=>s.product.price=1,s=>s.product.active=false,
    s=>s.product.name='Commercial',s=>s.salesHistory.push({}),s=>s.purchaseLines.push({}),s=>s.recipes=[],
    s=>s.stocks[0].qty=0.25,s=>s.stocks[0].avg_cost_per_unit=NaN,s=>s.inventoryItems[0].name='Commercial ingredient',
    s=>s.recipeUsage.push({inventory_item_id:item,product_id:'another'}),s=>s.recipes[0].qty_per_unit=Infinity,
    s=>s.recipes[0].qty_per_unit=0.0001,s=>s.lists=[]];
  for(const change of invalid){const s=fixture();change(s);assert.throws(()=>validateSaleFixture(s));}
});
test('B settings accept the real singular types with active Other and an existing active channel',()=>{
  const s=fixture();
  s.lists.unshift({list_type:'channel',value:'Retired channel',active:false},{list_type:'channel',value:' ',active:true});
  const before=structuredClone(s);
  assert.deepEqual(validateSaleFixture(s),s.expected);
  assert.equal(s.expected.channel,'In Store');assert.equal(s.expected.paymentMethod,'Other');
  assert.deepEqual(s,before,'validation must not activate, rename or create settings');
});
test('B settings reject missing or inactive Other and never substitute another payment method or plural type',()=>{
  const reject=s=>assert.throws(()=>validateSaleFixture(s),e=>e.code==='EXISTING_OTHER_PAYMENT_AND_CHANNEL_REQUIRED');
  for(const active of [false,null,undefined,'true',1]){
    const s=fixture();s.lists[0].active=active;reject(s);
  }
  for(const value of ['Cash','Credit Card','other',' Other ',null]){
    const s=fixture();s.lists[0].value=value;reject(s);
  }
  const missing=fixture();missing.lists=missing.lists.filter(row=>row.list_type!=='payment_method');reject(missing);
  const plural=fixture();plural.lists[0].list_type='payment_methods';reject(plural);
});
test('B settings require a singular active channel with a nonempty string value',()=>{
  const reject=s=>assert.throws(()=>validateSaleFixture(s),e=>e.code==='EXISTING_OTHER_PAYMENT_AND_CHANNEL_REQUIRED');
  for(const active of [false,null,undefined,'true',1]){
    const s=fixture();s.lists[1].active=active;reject(s);
  }
  for(const value of ['', ' \t\n', null,undefined,0,[]]){
    const s=fixture();s.lists[1].value=value;reject(s);
  }
  const missing=fixture();missing.lists=missing.lists.filter(row=>row.list_type!=='channel');reject(missing);
  const plural=fixture();plural.lists[1].list_type='channels';reject(plural);
});
test('only one item, same ID, same full payload and Other payment can be forwarded',()=>{
  const s=fixture(),p=payload(s);validateSalePayload(p,s);s.saleId=p.p_sale_id;s.salePayload=structuredClone(p);
  assert.doesNotThrow(()=>validateSalePayload(structuredClone(p),s));
  for(const patch of [{p_sale_id:runId},{p_payment_method:'Credit Card'},{p_payment_method:'Cash'},
    {p_business_id:SALE_ACTORS.B.business},{p_customer_id:product},{p_discount:0},{p_tax:99},{p_notes:'changed'},
    {p_items:[{product_id:product,qty:2,unit_price:0.5}]},{p_items:[...p.p_items,...p.p_items]}])assert.throws(()=>validateSalePayload({...p,...patch},s));
});
test('read-after-commit proves one sale, one income and one recipe deduction',()=>{
  const s=fixture();s.saleId=sale;assert.doesNotThrow(()=>assertSaleObserved(observation(s),s));
  for(const change of [v=>v.sales=[],v=>v.items.push(v.items[0]),v=>v.cash.push(v.cash[0]),v=>v.cash[0].business_id=SALE_ACTORS.B.business,
    v=>v.stocks[0].qty=10,v=>v.stocks[0].avg_cost_per_unit=0,v=>v.movements[0].qty_change=-0.5,v=>v.sales[0].total=Infinity,
    v=>v.cash[0].amount+=0.001,v=>v.sales[0].subtotal+=0.001,v=>v.items[0].unit_price+=0.001]){
    const v=observation(s);change(v);assert.throws(()=>assertSaleObserved(v,s));
  }
});
test('reversal requires exact stock/cost and net-zero financial history, including parent-linked movements',()=>{
  const s=fixture();s.saleId=sale;assert.doesNotThrow(()=>assertSaleObserved(observation(s,true),s,true));
  for(const change of [v=>v.cash.pop(),v=>v.cash[1].amount=0,v=>v.stocks[0].avg_cost_per_unit=0.19,
    v=>v.movements[1].related_transaction_id='other',v=>v.movements.push(v.movements[1]),v=>v.sales[0].cancelled_at=null]){
    const v=observation(s,true);change(v);assert.throws(()=>assertSaleObserved(v,s,true));
  }
});
test('audit confirmation recognizes the three reported formats and requires independent server creation and cancellation',()=>{
  const {snapshot,audit}=cancelledExecution();
  assert.deepEqual(assertSaleAudit(audit,snapshot,1253),{created:1,cancelled:1,client_reversed:1});
  assert.deepEqual(assertSaleAudit(audit.slice(0,2),snapshot,'1253'),{created:1,cancelled:1,client_reversed:0});
});
test('audit confirmation rejects partial order numbers, wrong tenants/actions/amounts, missing logs and duplicates',()=>{
  const {snapshot,audit}=cancelledExecution();
  const invalid=[rows=>rows[1].details='Order #12530',rows=>rows[0].details='Order #12530 - 0.49',
    rows=>rows[2].details='Order #12530 · $0.49 · inventory restored',rows=>rows[1].details='Order #1253 ',
    rows=>rows[1].details='Order #1253 · extra',rows=>rows[0].details='prefix Order #1253 - 0.49',
    rows=>rows[0].details='Order #1253 - Infinity',rows=>rows[0].details='Order #1253 - 0.50',
    rows=>rows[2].details='Order #1253 · $0.50 · inventory restored',rows=>rows[1].business_id=SALE_ACTORS.B.business,
    rows=>rows[1].action='Client: Sale Cancelled',rows=>rows[2].action='Unrelated Action',
    rows=>rows.splice(1,1),rows=>rows[2]={...rows[0],id:'duplicate-created'},rows=>rows[2].id=rows[0].id,
    rows=>rows.push({...rows[2],id:'duplicate-client'})];
  for(const change of invalid){const rows=structuredClone(audit);change(rows);assert.throws(()=>assertSaleAudit(rows,snapshot,1253),e=>e.code==='SALE_AUDIT_NOT_CONFIRMED');}
});
test('audit REST query pins tenant/actions and exact or delimited order number, with no numeric-prefix wildcard',()=>{
  const url=new URL(saleAuditQuery(business,1253),env.QA_SUPABASE_URL);
  assert.equal(url.pathname,'/rest/v1/audit_logs');assert.equal(url.searchParams.get('business_id'),'eq.'+business);
  assert.ok(url.searchParams.get('select').split(',').includes('business_id'));
  assert.equal(url.searchParams.get('action'),'in.("Sale Created","Sale Cancelled","Client: Sale Reversed")');
  assert.equal(url.searchParams.get('or'),'(details.eq."Order #1253",details.like."Order #1253 - *",details.like."Order #1253 · *")');
  assert.equal(url.searchParams.get('limit'),'1000');
  for(const number of [0,-1,1253.5,'01253','1253*','1253"','1e3',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>saleAuditQuery(business,number));
  assert.throws(()=>saleAuditQuery('not-a-tenant',1253));
});
test('read-only recovery verifies the cancelled execution and preserves checkpoint bytes, phase, history and uncertainty flags',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'nexalvo-sale-inspection-unit-'));
  try{
    for(const pendingReverse of [false,true]){
      const {snapshot,state,audit}=cancelledExecution();
      if(pendingReverse){snapshot.pending='reverse';snapshot.writeUncertain=true;}
      const checkpoint=join(directory,'sale-recovery.json'),original=JSON.stringify(snapshot,null,2)+'\n';
      writeFileSync(checkpoint,original,{mode:0o600});const reads=[];
      const result=await inspectCancelledSaleCheckpoint({checkpoint,snapshot,
        preserveFixture:async()=>{reads.push('read-fixture');},readView:async()=>{reads.push('read-view');return state;},
        readAudit:async path=>{assert.equal(path,saleAuditQuery(business,1253));reads.push('read-audit');return audit;}});
      assert.deepEqual(reads,['read-fixture','read-view','read-audit']);
      assert.equal(result.restored,true);assert.equal(result.net_financial_cents,0);assert.equal(result.audit_entries_observed,3);
      assert.deepEqual(result.audit_summary,{created:1,cancelled:1,client_reversed:1});
      assert.equal(result.stock_before_sha256,result.stock_after_sha256);assert.equal(result.recovery_checkpoint_unchanged,true);
      assert.match(result.recovery_checkpoint_sha256,/^[a-f0-9]{64}$/);
      assert.equal(readFileSync(checkpoint,'utf8'),original);assert.equal(JSON.stringify(snapshot,null,2)+'\n',original);
      assert.equal(snapshot.phase,'REVERSAL_CONFIRMED');assert.equal(result.status,undefined,'inspection alone never approves the full journey');
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('read-only recovery fails closed on changed history, unbalanced effects or missing audits without changing its checkpoint or compensating',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'nexalvo-sale-inspection-unit-'));
  try{
    const invalid=[x=>x.state.items[0].product_name_snapshot='changed',x=>x.state.cash.push({...x.state.cash[0],id:'another-income'}),
      x=>x.state.stocks[0].qty=0.75,x=>x.state.stocks[0].avg_cost_per_unit=0.11,x=>x.audit.splice(1,1),
      x=>x.snapshot.pending='probe_reverse',x=>x.snapshot.committedRows=null];
    for(const change of invalid){
      const x=cancelledExecution();change(x);const checkpoint=join(directory,'sale-recovery.json'),original=JSON.stringify(x.snapshot);
      writeFileSync(checkpoint,original,{mode:0o600});let compensations=0;
      try{
        await inspectCancelledSaleCheckpoint({checkpoint,snapshot:x.snapshot,preserveFixture:async()=>{},readView:async()=>x.state,readAudit:async()=>x.audit});
        assert.fail('invalid inspection must block');
      }catch(error){
        assert.ok(error.code,'a fixed guard code is required');
        const report={restored:false};await recordSaleFailure(error,{report,args:['--reconcile-readonly'],snapshot:x.snapshot,
          compensate:async()=>{compensations++;},checkpoint});assert.equal(report.status,'BLOCKED');
      }
      assert.equal(compensations,0);assert.equal(readFileSync(checkpoint,'utf8'),original);
    }
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('public evidence excludes credentials and private references',()=>{
  assert.equal(safeSaleReport({status:'BLOCKED'}).status,'BLOCKED');
  for(const detail of ['Bearer TOKEN','a@example.invalid','sb_secret_ABC','https://example.invalid/?token=ABC'])assert.throws(()=>safeSaleReport({detail}));
});
test('Windows wrapper protects secrets, journal and the mutex without automatically granting other scopes',()=>{
  const ps=readFileSync(new URL('./Invoke-QaSaleJourney.ps1',import.meta.url),'utf8');
  assert.match(ps,/Read-Host[^\n]+-AsSecureString/);assert.match(ps,/ZeroFreeBSTR/);
  assert.match(ps,/SetAccessRuleProtection\(\$true, \$false\)/);assert.match(ps,/finally[\s\S]*SetEnvironmentVariable\(\$name, \$previous\[\$name\], 'Process'\)/);
  const name=ps.match(/New-Object System.Threading.Mutex\(\$false, '([^']+)'\)/)[1];
  assert.equal(name,'Local\\NEXALVOSaleJourneyTEST');assert.equal([...name].filter(c=>c==='\\').length,1);
  assert.doesNotMatch(ps,/QA_PHOTO_JOURNEY_AUTHORIZED|NEXALVO_PERSISTENT_QA_AUTHORIZED/);
  assert.doesNotMatch(ps,/^\s*(?:Start-Transcript|Tee-Object)\b/m);
  assert.match(ps,/UNFINISHED_SALE_CHECKPOINT_EXISTS/);assert.match(ps,/--reconcile-readonly/);
});
test('executor journals before forward, refuses ambiguous replay and compensates only its captured sale',()=>{
  const runner=readFileSync(new URL('./sale-journey.TEST.mjs',import.meta.url),'utf8');
  const settingsQuery=runner.match(/lists:await api\(`([^`]+)`\)/)[1].replace('${b}',business);
  const settingsUrl=new URL(settingsQuery,env.QA_SUPABASE_URL);
  assert.equal(settingsUrl.pathname,'/rest/v1/business_settings_lists');
  assert.ok(settingsUrl.searchParams.get('select').split(',').includes('active'),'REST projection must expose the active flag');
  assert.equal(settingsUrl.searchParams.get('active'),'eq.true');
  assert.equal(settingsUrl.searchParams.get('business_id'),'eq.'+business);
  assert.match(runner,/save\('SALE_FORWARD_PENDING'\)[\s\S]*?route.fetch/);
  assert.match(runner,/OVERLAPPING_SALE_MUTATION_FORBIDDEN/);assert.match(runner,/createForwards<2/);
  assert.match(runner,/req.postDataJSON\(\).p_sale_id===snapshot.saleId/);
  assert.match(runner,/REVERSAL_ALREADY_ATTEMPTED_RECONCILE_ONLY/);assert.match(runner,/CROSS_TENANT_PROBE_UNSETTLED/);
  assert.match(runner,/count===data.length/);assert.match(runner,/SECRET_IN_SALE_SNAPSHOT/);assert.match(runner,/RECOVERY_ONLY_NOT_FULL_HOMOLOGATION/);
  assert.match(runner,/READONLY_CHECKPOINT_WRITE_FORBIDDEN/);assert.match(runner,/READONLY_BUSINESS_WRITE_FORBIDDEN/);
  const readonlyBranch=runner.slice(runner.indexOf('if(readonlyRecovery){'),runner.indexOf('if(snapshot.writeUncertain)await reconcile();',runner.indexOf('if(readonlyRecovery){')));
  assert.match(readonlyBranch,/inspectCancelledSaleCheckpoint/);assert.match(readonlyBranch,/recovery_status='PASS'/);
  assert.doesNotMatch(readonlyBranch,/await compensate|await reconcile|save\(|report.status='PASS'/);
  assert.doesNotMatch(runner,/method:\s*['"]DELETE|scope=global|storageState\(|tracing.start\(|screenshot\(/);
  const sql=readFileSync(new URL('./sql/sale_journey_preflight_readonly_TEST.sql',import.meta.url),'utf8').replace(/--[^\n]*/g,'');
  assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO|TRUNCATE)\b/i);
  assert.match(sql,/pg_get_functiondef/);assert.match(sql,/BLOCKED_CATALOG_DRIFT/);
});
