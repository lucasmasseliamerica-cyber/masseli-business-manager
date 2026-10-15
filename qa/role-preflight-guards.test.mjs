import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const names=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_ROLE_MANAGER_EMAIL','QA_ROLE_MANAGER_PASSWORD','QA_ROLE_EMPLOYEE_EMAIL','QA_ROLE_EMPLOYEE_PASSWORD'];
const complete=()=>Object.fromEntries(names.map(name=>[name,name==='QA_SUPABASE_URL'
 ?'https://msinksoilkluooxenecy.supabase.co':name==='QA_SUPABASE_ANON_KEY'?'sb_publishable_mock_public_qa_key':'mock-private-'+name]));
const bootstrap=`
const A='d627563b-2ce4-491d-8cf6-141ef28d0f63',B='3849b750-20f7-4929-8699-737a4e1983c8';
const actors={MANAGER:{id:'11111111-1111-4111-8111-111111111501',employee:'11111111-1111-4111-8111-111111111601'},EMPLOYEE:{id:'11111111-1111-4111-8111-111111111502',employee:'11111111-1111-4111-8111-111111111602'}};
const scenario=process.env.QA_ROLE_PREFLIGHT_SCENARIO;
globalThis.fetch=async(input,options={})=>{
 const url=new URL(input);if(url.hostname!=='msinksoilkluooxenecy.supabase.co')throw new Error('blocked');
 const auth=options.headers?.Authorization||'';
 const label=auth.endsWith('manager-token')?'MANAGER':auth.endsWith('employee-token')?'EMPLOYEE':null;
 const actor=actors[label];let status=200,value;
 if(url.pathname==='/auth/v1/token'){
  if(scenario==='auth-rejected')return {status:401,json:async()=>({message:'private'})};
  const body=JSON.parse(options.body);const manager=body.email===process.env.QA_ROLE_MANAGER_EMAIL;
  value={access_token:manager?'manager-token':'employee-token'};
 }else if(url.pathname==='/auth/v1/user')value={id:actor.id};
 else if(url.pathname==='/rest/v1/users'){
  const role=scenario==='swapped-role'&&label==='MANAGER'?'EMPLOYEE':label;
  value=[{id:actor.id,business_id:A,employee_id:actor.employee,role,active:scenario!=='inactive'}];
 }else if(url.pathname==='/rest/v1/rpc/current_business_id')value=A;
 else if(url.pathname==='/rest/v1/products'){
  const id=url.searchParams.get('id')?.slice(3);
  value=id==='9efafd84-7f17-4de9-9c9a-1b962ab3e0bc'?[{id,business_id:A,active:true}]
   :scenario==='foreign-product'?[{id,business_id:B}]:[];
 }else if(url.pathname==='/rest/v1/rpc/fn_read_employees_secure'){
  const business=url.searchParams.get('business_id')?.slice(3);const id=url.searchParams.get('id')?.slice(3);
  if(business===B)value=scenario==='foreign-employee'?[{id:'foreign',business_id:B}]:[];
  else if(id===actors.MANAGER.employee&&label==='EMPLOYEE')value=scenario==='salary-exposed'?[{id,hourly_rate:99}]:[];
  else value=[{id:actor.employee,business_id:A,hourly_rate:label==='MANAGER'?25:null}];
 }else if(url.pathname==='/rest/v1/rpc/fn_export_business_data')return {status:scenario==='export-allowed'?200:403,json:async()=>({})};
 else if(url.pathname==='/rest/v1/cash_flow'){
  const exact=url.searchParams.get('id');
  value=label==='MANAGER'?[{id:'11111111-1111-4111-8111-111111111701',business_id:A}]
   :scenario==='financial-exposed'&&exact?[{id:exact.slice(3),business_id:A}]:[];
 }else throw new Error('unexpected path');
 return {status,json:async()=>value};
};`;
const mockImport='data:text/javascript;charset=utf-8,'+encodeURIComponent(bootstrap);
function run(overrides={},scenario){
 const env={...process.env};for(const name of names)delete env[name];Object.assign(env,overrides);
 if(scenario)env.QA_ROLE_PREFLIGHT_SCENARIO=scenario;
 const args=scenario?['--import',mockImport,'qa/p0-role-preflight-readonly.TEST.mjs']:['qa/p0-role-preflight-readonly.TEST.mjs'];
 const result=spawnSync(process.execPath,args,{env,encoding:'utf8',timeout:5000});
 assert.equal(result.error,undefined);const output=result.stdout+result.stderr;
 for(const name of names)if(env[name])assert.ok(!output.includes(env[name]));
 assert.doesNotMatch(output,/mock-private|private/);return {status:result.status,output};
}

test('missing bindings and unsafe target configuration are BLOCKED before network',()=>{
 let result=run({});assert.equal(result.status,2);assert.match(result.output,/CONFIG_MISSING/);
 result=run({...complete(),QA_SUPABASE_URL:'https://example.invalid/'});assert.equal(result.status,2);assert.match(result.output,/TARGET_CONFIG_INVALID/);
 result=run({...complete(),QA_SUPABASE_ANON_KEY:'sb_secret_mock'});assert.equal(result.status,2);assert.match(result.output,/PUBLIC_KEY_INVALID/);
});
test('rejected role credentials and invalid profile fixtures are BLOCKED',()=>{
 for(const [scenario,code] of [['auth-rejected','AUTH_REJECTED_MANAGER'],['swapped-role','PROFILE_BINDING_MANAGER'],['inactive','PROFILE_BINDING_MANAGER']]){
  const result=run(complete(),scenario);assert.equal(result.status,2);assert.match(result.output,new RegExp(code));
 }
});
test('cross-tenant product or employee exposure is FAIL',()=>{
 for(const [scenario,code] of [['foreign-product','ISOLATION_PRODUCT_MANAGER'],['foreign-employee','ISOLATION_EMPLOYEES_MANAGER']]){
  const result=run(complete(),scenario);assert.equal(result.status,1);assert.match(result.output,new RegExp(code));
 }
});
test('employee financial or salary exposure is FAIL',()=>{
 for(const [scenario,code] of [['financial-exposed','EMPLOYEE_FINANCIAL_EXPOSURE'],['salary-exposed','EMPLOYEE_SALARY_EXPOSURE']]){
  const result=run(complete(),scenario);assert.equal(result.status,1);assert.match(result.output,new RegExp(code));
 }
});
test('non-owner business export access is FAIL',()=>{
 const result=run(complete(),'export-allowed');assert.equal(result.status,1);assert.match(result.output,/OWNER_ONLY_EXPORT_MANAGER/);
});
test('valid independent MANAGER and EMPLOYEE fixtures pass read-only checks',()=>{
 const result=run(complete(),'valid');assert.equal(result.status,0);assert.match(result.output,/ROLE PREFLIGHT PASS \[OK\]/);
 assert.match(result.output,/MANAGER identity/);assert.match(result.output,/EMPLOYEE identity/);
});
test('standard CI does not request role secrets or execute the live role preflight',()=>{
 const workflow=readFileSync('.github/workflows/nexalvo-test.yml','utf8');
 assert.doesNotMatch(workflow,/QA_ROLE_(?:MANAGER|EMPLOYEE)_(?:EMAIL|PASSWORD)/);
 assert.doesNotMatch(workflow,/node\s+qa\/p0-role-preflight-readonly\.TEST\.mjs/);
});
test('manual role workflow is confined to QA branch, TEST environment and read-only runner',()=>{
 const workflow=readFileSync('.github/workflows/nexalvo-role-preflight.yml','utf8');
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/\bpush:/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/automation\/nexalvo-qa-actions'/);
 assert.match(workflow,/environment: nexalvo-test/);
 for(const name of names)assert.match(workflow,new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+':'));
 assert.match(workflow,/node qa\/p0-role-preflight-readonly\.TEST\.mjs/);
 assert.doesNotMatch(workflow,/purchase|migration|deploy/i);
});
