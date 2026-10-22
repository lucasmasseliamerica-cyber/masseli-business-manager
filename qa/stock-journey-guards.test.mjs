import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { STOCK_ACTORS, STOCK_FINGERPRINTS, STOCK_TABLES, stockConfiguration,
  validateStockCatalog, validateStockFixture, validateStockReadPath } from './stock-journey-core.mjs';
import { stockPreflight } from './stock-preflight-readonly.TEST.mjs';
import { STOCK_WASTE_READER_CONTRACT } from './stock-waste-reader-contract.mjs';
const item='11111111-aaaa-4111-8111-111111111111',src='22222222-bbbb-4222-8222-222222222222',dst='33333333-cccc-4333-8333-333333333333';
const env={QA_SUPABASE_URL:'https://msinksoilkluooxenecy.supabase.co',QA_SUPABASE_ANON_KEY:'sb_publishable_SIMULATED',
  QA_TWO_TENANT_A_EMAIL:'a@example.invalid',QA_TWO_TENANT_A_PASSWORD:'SIMULATED_A',QA_TWO_TENANT_B_EMAIL:'b@example.invalid',QA_TWO_TENANT_B_PASSWORD:'SIMULATED_B',
  QA_STOCK_ITEM_ID:item,QA_STOCK_SOURCE_LOCATION_ID:src,QA_STOCK_TARGET_LOCATION_ID:dst};
const fixture=()=>({item:{id:item,business_id:STOCK_ACTORS.A.business,name:'ZZ_QA_STOCK_C_LOCAL_EXCLUSIVE',active:true,supplier_id:null},
  locations:[src,dst].map((id,i)=>({id,business_id:STOCK_ACTORS.A.business,name:`ZZ_QA_STOCK_C_${i}`,active:true})),
  stocks:[src,dst].map((location_id,i)=>({id:`${i+4}4444444-dddd-4444-8444-444444444444`,inventory_item_id:item,location_id,qty:2,avg_cost_per_unit:0.1})),
  recipes:[],purchaseLines:[],transactions:[],waste:[]});
const catalog=()=>({project_ref_expected:'msinksoilkluooxenecy',mode:'READ_ONLY',captured_at:new Date().toISOString(),status:'PASS_MATCHED_HISTORICAL_CONTRACTS',
  functions:Object.entries(STOCK_FINGERPRINTS).map(([name,fingerprint])=>({name,fingerprint,present:true,anon_execute:false,authenticated_execute:name!=='fn_record_inventory_movement'})),
  tables:STOCK_TABLES.map(name=>({name,present:true,rls:true,anon_select:false})),public_schema:{anon_create:false,authenticated_create:false},
  waste_reader_contract:{...STOCK_WASTE_READER_CONTRACT.expected}});
test('C preflight has no persistent mode and missing credentials or unsupported arguments perform no network calls',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error('MUST_NOT_REACH_NETWORK');};
  assert.equal((await stockPreflight({},[],fetcher)).code,'C_SECURE_QA_CREDENTIALS_REQUIRED');
  assert.equal((await stockPreflight(env,['--apply'],fetcher)).code,'C_READONLY_MODE_ONLY');assert.equal(calls,0);
});
test('C rejects production, service keys, duplicate identities and unspecified or duplicate fixture IDs',()=>{
  for(const patch of [{QA_SUPABASE_URL:'https://OTHER_PROJECT.supabase.co'},{QA_SUPABASE_ANON_KEY:'sb_secret_SIMULATED'},
    {QA_TWO_TENANT_B_EMAIL:' A@example.invalid '},{QA_STOCK_ITEM_ID:''},{QA_STOCK_TARGET_LOCATION_ID:src}])assert.throws(()=>stockConfiguration({...env,...patch}));
});
test('C catalog expiry drift overloaded RPCs NULL grants and column/schema privileges cannot become PASS',()=>{
  validateStockCatalog(catalog());
  for(const change of [c=>c.captured_at='2000-01-01',c=>c.functions.push(c.functions[0]),c=>c.functions[0].anon_execute=null,
    c=>c.functions[0].fingerprint='changed',c=>c.tables[0].rls=false,c=>c.tables[0].anon_select=true,c=>c.public_schema.authenticated_create=true,
    c=>delete c.waste_reader_contract,c=>c.waste_reader_contract.body_sha256='a'.repeat(64),c=>c.waste_reader_contract.anon_execute=true]){
    const c=catalog();change(c);assert.throws(()=>validateStockCatalog(c));
  }
});
test('C requires independent unused fixtures and equal finite average costs without reusing sale B ingredients',()=>{
  assert.equal(validateStockFixture(fixture()).persistentAuthorized,false);
  for(const change of [s=>s.item.name='ZZ_QA_SALE_B_20261021_EXCLUSIVE',s=>s.item.active=false,s=>s.item.business_id=STOCK_ACTORS.B.business,
    s=>s.locations[1].active=false,s=>s.locations[1].id=src,s=>s.locations[0].name='Commercial location',s=>s.transactions.push({id:'historical'}),
    s=>s.recipes.push({product_id:'old'}),s=>s.purchaseLines.push({id:'old'}),s=>s.waste.push({id:'old'}),s=>s.stocks[1].avg_cost_per_unit=0.2,
    s=>s.stocks[1].avg_cost_per_unit=null,s=>s.stocks[0].qty=NaN,s=>s.stocks[0].qty=2.0001,s=>s.stocks.push(s.stocks[0])]){
    const s=fixture();change(s);assert.throws(()=>validateStockFixture(s));
  }
});
test('C read transport cannot reach a mutating RPC, outside host or credentials embedded in URL',()=>{
  for(const path of ['/rest/v1/rpc/fn_transfer_inventory','/rest/v1/rpc/fn_adjust_inventory_count','/rest/v1/rpc/fn_record_waste',
    '/rest/v1/waste_transactions?select=*','https://other.invalid/rest/v1/inventory_items','https://x:y@msinksoilkluooxenecy.supabase.co/rest/v1/inventory_items'])assert.throws(()=>validateStockReadPath(path));
});
test('stock helpers preserve quantity/cost precision and reject excess fractions before user RPCs',()=>{
  const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');const a=source.indexOf('const roundStockQty =');const b=source.indexOf('function validateInventoryCatalogDraft',a);
  const context=vm.createContext({Number,Math});vm.runInContext(source.slice(a,b)+';globalThis.qty=roundStockQty;globalThis.precise=hasStockPrecision;',context);
  assert.equal(context.qty(0.125),0.125);assert.equal(context.qty(2.126),2.126);assert.equal(context.precise(0.125),true);
  assert.equal(context.precise(0.1251),false);assert.equal(context.precise(Infinity),false);assert.equal(context.precise(0.1234,4),true);assert.equal(context.precise(0.12345,4),false);
});

for(const fault of ['none','cross_tenant','incomplete'])test(`SIMULATED C read-only preflight ${fault} never calls stock writers or leaks sessions`,async()=>{
  const directory=mkdtempSync(join(tmpdir(),'nexalvo-c-unit-'));const file=join(directory,'catalog.json');writeFileSync(file,JSON.stringify(catalog()));
  const s=fixture(),requests=[];
  const fetcher=async(input,options)=>{
    const url=new URL(input);requests.push({path:url.pathname,method:options.method});
    const actor=options.headers.Authorization?.endsWith('_B')?'B':'A';
    const json=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-range':`*/${Array.isArray(data)?data.length:0}`,'content-type':'application/json'}});
    if(url.pathname==='/auth/v1/token'){const actor=JSON.parse(options.body).email.startsWith('a')?'A':'B';return json({access_token:'SIMULATED_SESSION_'+actor});}
    if(url.pathname==='/auth/v1/logout'){assert.equal(url.searchParams.get('scope'),'local');return json({});}
    assert.equal(options.method,'GET');
    if(url.pathname==='/auth/v1/user')return json({id:STOCK_ACTORS[actor].owner});
    if(url.pathname==='/rest/v1/users')return json([{id:STOCK_ACTORS[actor].owner,business_id:STOCK_ACTORS[actor].business,role:'OWNER',active:true}]);
    if(url.pathname.endsWith('/current_business_id'))return json(STOCK_ACTORS[actor].business);
    if(url.pathname.endsWith('/user_can'))return json(true);
    if(!options.headers.Authorization||actor==='B')return json(fault==='cross_tenant'?[{id:item}]:[]);
    if(url.pathname.endsWith('/inventory_items'))return json([s.item]);
    if(url.pathname.endsWith('/locations'))return json(s.locations);
    if(url.pathname.endsWith('/fn_read_inventory_stock_secure'))return fault==='incomplete'?new Response('[]',{headers:{'content-range':'*/2'}}):json(s.stocks);
    return json([]);
  };
  try{
    const report=await stockPreflight({...env,QA_STOCK_CATALOG_FILE:file},[],fetcher);
    assert.equal(report.status,fault==='none'?'PASS':'BLOCKED');assert.equal(report.persistent_authorized,false);
    assert.ok(requests.every(r=>r.method==='GET'||['/auth/v1/token','/auth/v1/logout'].includes(r.path)));
    assert.equal(report.stock_mutations,0);assert.equal(report.checkpoints_modified,0);
    assert.doesNotMatch(JSON.stringify(report),/SIMULATED_SESSION_|example\.invalid|Bearer|11111111-aaaa/);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
