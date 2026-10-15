import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const names=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'];
function run(overrides){
 const env={...process.env};for(const name of names)delete env[name];
 Object.assign(env,overrides);
 const result=spawnSync(process.execPath,['qa/p0-preflight-readonly.TEST.mjs'],{env,encoding:'utf8',timeout:5000});
 assert.equal(result.error,undefined,'Guard must exit before any network request');
 const output=result.stdout+result.stderr;
 for(const name of names){if(env[name])assert.ok(!output.includes(env[name]),'Guard output must not expose binding values');}
 return {status:result.status,output};
}
function complete(){
 return Object.fromEntries(names.map((name)=>[name,name==='QA_SUPABASE_URL'
  ?'https://msinksoilkluooxenecy.supabase.co'
  :name==='QA_SUPABASE_ANON_KEY'?'sb_publishable_mock_public_qa_key':'mock-private-value-'+name]));
}

const mockFetchBootstrap=`
const fixtures={
 A:{owner:'f37e9907-47c4-48bf-94b7-9a6fa5de1f88',business:'d627563b-2ce4-491d-8cf6-141ef28d0f63',product:'9efafd84-7f17-4de9-9c9a-1b962ab3e0bc',employee:'11111111-1111-4111-8111-111111111101',item:'11111111-1111-4111-8111-111111111201',sale:'11111111-1111-4111-8111-111111111301'},
 B:{owner:'88eddcda-d8b5-4474-b5d7-19860dd97fba',business:'3849b750-20f7-4929-8699-737a4e1983c8',product:'a4cac86d-038d-418e-b953-9a3605f2df18',employee:'11111111-1111-4111-8111-111111111102',item:'11111111-1111-4111-8111-111111111202',sale:'11111111-1111-4111-8111-111111111302'}
};
const fixed={suppliers:'f85b4931-6877-4664-969d-0ba59fe4feff',inventory_items:'bb80c25b-5fd0-4716-8460-82202a2d74a9',locations:'a3e4b2ed-eb00-4963-afd0-38c256aff87d'};
const scenario=process.env.QA_PREFLIGHT_MOCK_SCENARIO;
globalThis.fetch=async(input,options={})=>{
 const url=new URL(input);
 if(url.hostname!=='msinksoilkluooxenecy.supabase.co')throw new Error('blocked host');
 if(scenario==='network')throw new Error('private network detail');
 const authorization=options.headers?.Authorization||'';
 const label=authorization.endsWith('mock-token-a')?'A':authorization.endsWith('mock-token-b')?'B':null;
 const actor=label?fixtures[label]:null;
 const other=label?fixtures[label==='A'?'B':'A']:null;
 let status=200,value;
 if(url.pathname==='/auth/v1/token'){
  if(scenario==='auth-rejected')return {status:401,json:async()=>({message:'private response body'})};
  if(scenario==='service')return {status:503,json:async()=>({message:'private response body'})};
  const body=JSON.parse(options.body);value={access_token:body.email===process.env.QA_TWO_TENANT_A_EMAIL?'mock-token-a':'mock-token-b'};
 }else if(url.pathname==='/auth/v1/user')value={id:actor.owner};
 else if(url.pathname==='/rest/v1/users')value=[{id:actor.owner,business_id:actor.business,role:'OWNER',active:true}];
 else if(url.pathname==='/rest/v1/rpc/current_business_id')value=scenario==='wrong-business'?'00000000-0000-4000-8000-000000000000':actor.business;
 else if(url.pathname==='/rest/v1/products'){
  const id=url.searchParams.get('id')?.slice(3);value=scenario==='deny-all'||id!==actor.product?[]:[{id,business_id:actor.business,active:true}];
 }else if(['/rest/v1/suppliers','/rest/v1/inventory_items','/rest/v1/locations'].includes(url.pathname)){
  const table=url.pathname.slice('/rest/v1/'.length);value=label==='A'?[{id:fixed[table],business_id:fixtures.A.business,active:true}]:[];
 }else if(url.pathname==='/rest/v1/rpc/fn_read_employees_secure'){
  value=scenario==='missing-employee'?[]:[{id:actor.employee,business_id:actor.business}];
 }else if(url.pathname==='/rest/v1/employees'){
  if(scenario==='employees-grant')return {status:403,json:async()=>({message:'private permission body'})};
  const id=url.searchParams.get('id')?.slice(3);
  if(id===actor.employee)value=[{id,business_id:actor.business}];
  else if(scenario==='employee-exposed'&&id===other.employee)value=[{id,business_id:other.business}];
  else value=[];
 }else if(url.pathname==='/rest/v1/rpc/fn_read_sale_items_secure'){
  value=scenario==='missing-sale-item'?[]:[{id:actor.item,sale_id:actor.sale}];
 }else if(url.pathname==='/rest/v1/sales'){
  const id=url.searchParams.get('id')?.slice(3);value=id===actor.sale?[{id,business_id:actor.business}]:[];
 }else if(url.pathname==='/rest/v1/sale_items'){
  const id=url.searchParams.get('id')?.slice(3);
  if(id===actor.item)value=[{id,sale_id:actor.sale}];
  else if(scenario==='sale-item-exposed'&&id===other.item)value=[{id,sale_id:other.sale}];
  else value=[];
 }else if(url.pathname==='/rest/v1/rpc/fn_read_inventory_stock_secure')value=[{qty:1}];
 else if(url.pathname==='/rest/v1/purchase_orders'){
  const ownProbe=url.searchParams.has('business_id');value=ownProbe&&label==='A'&&scenario!=='zero-purchases'?[{id:'11111111-1111-4111-8111-111111111401',business_id:fixtures.A.business}]:[];
 }else throw new Error('unexpected private path');
 return {status,json:async()=>value};
};`;
const mockImport='data:text/javascript;charset=utf-8,'+encodeURIComponent(mockFetchBootstrap);
function runMock(scenario){
 const env={...process.env,...complete(),QA_PREFLIGHT_MOCK_SCENARIO:scenario};
 const result=spawnSync(process.execPath,['--import',mockImport,'qa/p0-preflight-readonly.TEST.mjs'],{env,encoding:'utf8',timeout:5000});
 assert.equal(result.error,undefined,'Mocked preflight must finish without external network');
 const output=result.stdout+result.stderr;
 for(const name of names)assert.ok(!output.includes(env[name]),'Mocked preflight output must not expose binding values');
 assert.doesNotMatch(output,/private response body|private network detail/);
 return {status:result.status,output};
}

test('missing bindings are BLOCKED without a passing skip',()=>{
 const result=run({});assert.equal(result.status,2);assert.match(result.output,/PREFLIGHT BLOCKED \[CONFIG_MISSING\]/);
});
test('wrong host, embedded credentials and nonstandard ports are BLOCKED before network',()=>{
 for(const url of ['https://mock-user:mock-pass@invalid.example/','https://msinksoilkluooxenecy.supabase.co:444/']){
  const result=run({...complete(),QA_SUPABASE_URL:url});assert.equal(result.status,2);assert.match(result.output,/TARGET_CONFIG_INVALID/);
  assert.doesNotMatch(result.output,/mock-user|mock-pass|:444/);
 }
});
test('privileged, opaque and wrong-project keys are BLOCKED before login',()=>{
 const jwt=(claims)=>['mock',Buffer.from(JSON.stringify(claims)).toString('base64url'),'mock'].join('.');
 for(const key of [' sb_secret_MOCK_NOT_REAL ','opaque-public-looking-key',jwt({role:'service_role',ref:'msinksoilkluooxenecy'}),jwt({role:'anon',ref:'wrong-project'})]){
  const result=run({...complete(),QA_SUPABASE_ANON_KEY:key});assert.equal(result.status,2);assert.match(result.output,/PUBLIC_KEY_INVALID/);
 }
});
test('network, rejected credentials and TEST service errors are classified BLOCKED',()=>{
 for(const [scenario,code] of [['network','NETWORK_LOGIN_A'],['auth-rejected','AUTH_REJECTED_A'],['service','SERVICE_UNAVAILABLE_LOGIN_A']]){
  const result=runMock(scenario);assert.equal(result.status,2);assert.match(result.output,new RegExp(code));
 }
});
test('missing positive fixtures are BLOCKED, never PASS',()=>{
 for(const [scenario,code] of [['deny-all','FIXTURE_PRODUCT_A'],['missing-employee','FIXTURE_EMPLOYEE_A'],['missing-sale-item','FIXTURE_SALE_ITEM_A'],['zero-purchases','FIXTURE_PURCHASE_A']]){
  const result=runMock(scenario);assert.equal(result.status,2);assert.match(result.output,new RegExp(code));assert.doesNotMatch(result.output,/PREFLIGHT PASS/);
 }
});
test('tenant mismatch and authenticated grant failure are FAIL',()=>{
 for(const [scenario,code] of [['wrong-business','TENANT_CONTEXT_MISMATCH_A'],['employees-grant','ENDPOINT_OR_PERMISSION_EMPLOYEE_DIRECT_A']]){
  const result=runMock(scenario);assert.equal(result.status,1);assert.match(result.output,new RegExp(code));
 }
});
test('cross-company employee and sale-item exposure are FAIL',()=>{
 for(const [scenario,code] of [['employee-exposed','ISOLATION_EMPLOYEES_A_TO_B'],['sale-item-exposed','ISOLATION_SALE_ITEMS_A_TO_B']]){
  const result=runMock(scenario);assert.equal(result.status,1);assert.match(result.output,new RegExp(code));
 }
});
test('valid non-vacuous fixtures, direct grants and isolation pass',()=>{
 const result=runMock('valid');assert.equal(result.status,0);assert.match(result.output,/PREFLIGHT PASS \[OK\]/);
 assert.match(result.output,/direct employee\/sale_items SELECT and cross-company denial/);
 assert.match(result.output,/existing OWNER A purchase is visible to A and denied to B/);
});
