import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SALE_HOST, SALE_ACTORS, SALE_FINGERPRINTS, SALE_INTERNAL_FUNCTIONS, SALE_TABLES, saleConfiguration, validateSaleCatalog,
  validateSaleFixture, validateSalePayload, assertSaleObserved, safeSaleReport } from './sale-journey-core.mjs';
import { saleJourney, recordSaleFailure } from './sale-journey.TEST.mjs';

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
    salesHistory:[],purchaseLines:[],lists:[{list_type:'payment_methods',value:'Other'},{list_type:'channels',value:'In Store'}]};
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
  assert.match(runner,/save\('SALE_FORWARD_PENDING'\)[\s\S]*?route.fetch/);
  assert.match(runner,/OVERLAPPING_SALE_MUTATION_FORBIDDEN/);assert.match(runner,/createForwards<2/);
  assert.match(runner,/req.postDataJSON\(\).p_sale_id===snapshot.saleId/);
  assert.match(runner,/REVERSAL_ALREADY_ATTEMPTED_RECONCILE_ONLY/);assert.match(runner,/CROSS_TENANT_PROBE_UNSETTLED/);
  assert.match(runner,/count===data.length/);assert.match(runner,/SECRET_IN_SALE_SNAPSHOT/);assert.match(runner,/RECOVERY_ONLY_NOT_FULL_HOMOLOGATION/);
  assert.doesNotMatch(runner,/method:\s*['"]DELETE|scope=global|storageState\(|tracing.start\(|screenshot\(/);
  const sql=readFileSync(new URL('./sql/sale_journey_preflight_readonly_TEST.sql',import.meta.url),'utf8').replace(/--[^\n]*/g,'');
  assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|CALL|DO|TRUNCATE)\b/i);
  assert.match(sql,/pg_get_functiondef/);assert.match(sql,/BLOCKED_CATALOG_DRIFT/);
});
