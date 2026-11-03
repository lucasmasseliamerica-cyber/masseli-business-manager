// Corrected-boundary regressions. No remote network or real checkpoints.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createC2Guard} from './stock-c2-browser.mjs';
import {c2ReadDecision} from './stock-c2-read-policy.mjs';
import {c2DispatchBudget,c2CaptureDeadline} from './stock-c2-admission.mjs';
import {fixture,commitLoss} from './stock-c2-test-support.mjs';
import {recoveryC2,wastePayload} from './stock-c2-protocol.mjs';
const origin='https://msinksoilkluooxenecy.supabase.co';
for(const method of ['GET','HEAD','OPTIONS'])test(`F01 blocks Edge Functions and unreviewed RPCs for ${method}`,async()=>{
  for(const path of ['/functions/v1/SYNTHETIC_UNREVIEWED','/rest/v1/rpc/unreviewed','/rest/v1/unreviewed']){
    let continued=0,aborted=0,failed=0;
    const g=createC2Guard({state:{},save:()=>assert.fail(),gate:()=>assert.fail(),view:()=>assert.fail(),report:{},onFailure:()=>failed++});
    await g({request:()=>({url:()=>origin+path,method:()=>method}),continue:async()=>continued++,abort:async()=>aborted++});
    assert.equal(continued,0);assert.equal(aborted,1);assert.equal(failed,1);
  }
});
test('F01 exact readers, arguments, projections and auxiliary denials',()=>{
  assert.equal(c2ReadDecision(new URL(origin+'/rest/v1/rpc/fn_read_inventory_stock_secure?select=*&inventory_item_id=eq.475ae0c8-5a4b-45a2-ad74-1a450e553cb0'),'GET'),'ALLOW');
  assert.equal(c2ReadDecision(new URL(origin+'/rest/v1/products'),'GET'),'DENY_AUXILIARY');
  for(const p of ['/rest/v1/users?select=unreviewed(*)','/rest/v1/rpc/current_business_id?p_arbitrary=eq.x','/rest/v1/rpc/fn_read_inventory_stock_secure?p_qty=eq.1'])assert.throws(()=>c2ReadDecision(new URL(origin+p),'GET'));
});
test('F01 reviewed path cannot select an unreviewed schema through profile headers',async()=>{
  for(const name of ['accept-profile','content-profile']){
    let failure=0;const guard=createC2Guard({state:{},report:{},gate:()=>assert.fail(),onFailure:()=>failure++});
    await guard({request:()=>({url:()=>origin+'/rest/v1/users',method:()=> 'GET',headers:()=>({[name]:'unreviewed'})}),abort:async()=>{},continue:()=>assert.fail(),fetch:()=>assert.fail()});
    assert.equal(failure,1);
  }
});
test('F01/F05 checks freshness before GET RPC and POST status helper',async()=>{
  for(const [method,path] of [['GET','fn_read_inventory_stock_secure'],['POST','fn_session_access_status']]){
    let continued=0,checks=0;const g=createC2Guard({state:{},gate:()=>{checks++;throw Error('EXPIRED');},report:{},onFailure:()=>{}});
    await g({request:()=>({url:()=>origin+'/rest/v1/rpc/'+path,method:()=>method,postDataJSON:()=>({})}),continue:async()=>continued++,abort:async()=>{}});
    assert.equal(continued,0);assert.equal(checks,1);
  }
});
test('F02 every allowed browser read uses its freshly admitted timeout, with no redirect or retry',async()=>{
  for(const [method,path] of [['GET','/rest/v1/rpc/fn_read_inventory_stock_secure'],['HEAD','/rest/v1/users'],['POST','/rest/v1/rpc/fn_session_access_status'],['OPTIONS','/rest/v1/rpc/fn_record_waste']]){
    let checks=0,sends=0,fulfilled=0;
    const guard=createC2Guard({state:{},report:{},gate:options=>{assert.equal(options.dispatch,true);checks++;return{timeoutMs:5100};},onFailure:()=>assert.fail('reviewed read must succeed')});
    await guard({request:()=>({url:()=>origin+path,method:()=>method,postDataJSON:()=>({})}),continue:()=>assert.fail('unbounded read'),abort:()=>assert.fail('reviewed read rejected'),
      fetch:async options=>{sends++;assert.deepEqual(options,{timeout:5100,maxRetries:0,maxRedirects:0});return{};},fulfill:async()=>fulfilled++});
    assert.equal(checks,1);assert.equal(sends,1);assert.equal(fulfilled,1);
  }
});
test('F02 bounded timeout, 5s settlement margin and minimum 10s dispatch admission',()=>{
  assert.equal(c2DispatchBudget({until:30000},50000,0).timeoutMs,20000);
  assert.equal(c2DispatchBudget({until:18000},50000,0).timeoutMs,13000);
  assert.equal(c2DispatchBudget({until:50000},10000,0).timeoutMs,5000);
  assert.throws(()=>c2DispatchBudget({until:9999},50000,0));assert.throws(()=>c2DispatchBudget({until:0},50000,0));
});
function transport(fault){
  const state={phase:'RESERVED',baseline:fixture(),startedAt:0},v=structuredClone(state.baseline),report={stock_forward_attempts:0,audit_forward_attempts:0};
  let now=0,sends=0,saves=0;const until=30000;
  const g=createC2Guard({state,view:async()=>structuredClone(v),token:'SYNTHETIC',report,save:()=>{saves++;if(fault==='after-intent')now=until;},gate:({dispatch=false}={})=>dispatch?c2DispatchBudget({until},60000,now):{},onFailure:()=>{}});
  const route={request:()=>({url:()=>origin+'/rest/v1/rpc/fn_record_waste',method:()=> 'POST',headers:()=>({authorization:'Bearer SYNTHETIC'}),postDataJSON:wastePayload}),fetch:async opts=>{sends++;assert.equal(opts.maxRetries,0);assert.equal(opts.timeout,20000);commitLoss(v);throw Error('TIMEOUT_AFTER_COMMIT');},abort:async()=>{}};
  return{state,v,report,g,route,saves:()=>saves,sends:()=>sends,setNow:v=>{now=v;}};
}
test('F02 insufficient margin before intent and expiry after fsync stop dispatch',async()=>{
  const h=transport();h.setNow(29999);await h.g(h.route);assert.equal(h.saves(),0);assert.equal(h.sends(),0);
  const f=transport('after-intent');await f.g(f.route);assert.equal(f.state.phase,'LOSS_INTENT');assert.equal(f.report.stock_forward_attempts,0);assert.equal(f.sends(),0);
});
test('F02 loss transport receives 7s rather than fixed 20s when 12s remain',async()=>{
  const h=transport();h.setNow(18000);let sends=0;
  h.route.fetch=async options=>{sends++;assert.deepEqual(options,{timeout:7000,maxRetries:0,maxRedirects:0});throw Error('SYNTHETIC_UNKNOWN');};
  await h.g(h.route);assert.equal(sends,1);assert.equal(h.report.stock_forward_attempts,1);assert.equal(h.state.phase,'LOSS_INTENT');
});
test('F02/F04 timeout after commit consumes attempt, blocks replay, only permits observation',async()=>{
  const h=transport();await h.g(h.route);await h.g(h.route);assert.equal(h.sends(),1);assert.equal(h.report.stock_forward_attempts,1);assert.equal(h.state.phase,'LOSS_INTENT');
  const before=JSON.stringify(h.state),proof=recoveryC2(h.state,h.v);assert.equal(proof.loss_rows,1);assert.equal(proof.audit_rows,0);assert.equal(proof.resume_allowed,false);assert.equal(JSON.stringify(h.state),before);
});
test('F05 earliest joint deadline, malformed capture cannot renew admission',()=>{
  const t=Date.parse('2026-11-02T12:00:00Z');assert.equal(c2CaptureDeadline({captured_at:new Date(t).toISOString()},{captured_at:new Date(t+60000).toISOString()}),t+86400000);assert.throws(()=>c2CaptureDeadline({},{}));
});
test('F03 separate semantic checksum and raw byte hashes; reformatting fails byte-manifest guard',()=>{
  const root=mkdtempSync(join(tmpdir(),'nexalvo-c2-review-private-'));
  try{
    const script=`import{openC2Store,c2Directory}from'./qa/stock-c2-store.mjs';import{fixture}from'./qa/stock-c2-test-support.mjs';import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import assert from'node:assert/strict';import{createHash}from'node:crypto';const s=openC2Store();s.reserve({phase:'RESERVED',baseline:fixture(),sourceSha:'a'.repeat(40),reviewHash:'b'.repeat(64),window:{at:0,until:1},startedAt:0});const p=join(c2Directory(),'0.json'),before=s.load();assert.equal(before.fileHashes[0].sha256,createHash('sha256').update(readFileSync(p)).digest('hex'));writeFileSync(p,JSON.stringify(JSON.parse(readFileSync(p,'utf8')),null,2));const after=s.load();assert.equal(after.semanticChecksum,before.semanticChecksum);assert.notEqual(after.bytesManifestSha256,before.bytesManifestSha256);assert.throws(()=>s.assertCurrent());console.log('SEPARATE_HASHES_PASS');`;
    assert.match(execFileSync(process.execPath,['--input-type=module','-'],{input:script,env:{...process.env,TEMP:root,TMP:root,TMPDIR:root},encoding:'utf8',stdio:['pipe','pipe','pipe']}),/SEPARATE_HASHES_PASS/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('reviewed seed SQL byte hashes remain unchanged; same-session driver includes each script exactly once without reconnect',()=>{
  for(const [file,expected] of [['stock-c2-provision-review.sql','6ec2dc2fada7d69f1561b2848c29a11d647aa79c6ada6068ad26f0aa71b90635'],['stock-c2-provision-reconcile-readonly.sql','304361cbf214905fdd0511af9f33764606187008ea42f45524149e4878ab1fb6']]){
    assert.equal(createHash('sha256').update(readFileSync(new URL(file,import.meta.url))).digest('hex'),expected);
  }
  const driver=readFileSync(new URL('stock-c2-seed-same-session.psql',import.meta.url),'utf8');
  assert.equal((driver.match(/^\\ir stock-c2-provision-review.sql$/gm)||[]).length,1);
  assert.equal((driver.match(/^\\ir stock-c2-provision-reconcile-readonly.sql$/gm)||[]).length,1);
  assert.ok(!/^\\(?:connect|c\s|gexec|watch|!)/m.test(driver));assert.match(driver,/\\set ON_ERROR_STOP on/);
  assert.match(driver,/c2_before_backend_start/);assert.match(driver,/C2_SEED_POSTCOMMIT_SESSION_UNCONFIRMED_NO_REPLAY/);
  assert.ok(!driver.includes('QA_C2_EXECUTION_AUTHORIZED'));
});
