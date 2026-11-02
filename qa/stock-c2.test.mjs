import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { C2, C2_AUTHORITY, hash, validateC2Fixture, reconcileC2, recoveryC2, c2Window, c2Authorization, wastePayload, auditPayload } from './stock-c2-protocol.mjs';
import { createC2Guard } from './stock-c2-browser.mjs';
import { stockC2 } from './stock-c2-executor.mjs';
import { fixture, commitLoss, commitAudit } from './stock-c2-test-support.mjs';
const clone = structuredClone;
test('C2 fixture excludes C1/B, history, wrong cost and dependencies', () => {
  validateC2Fixture(fixture());
  for (const change of [v => v.item.id = '6ebfef52-f6c2-4561-b2ac-b3d4bfca1c5f',v => v.recipes.push({}),v => v.audit.push({}),v => v.stocks[0].qty=1.875,v => v.item.active=false,v => v.stocks[0].last_purchase_cost=null]) {
    const v=fixture();change(v);assert.throws(()=>validateC2Fixture(v));
  }
});
test('C2 reconciliation checks linkage, cardinality, tenant, costs, time and residuals',()=>{
  const b=fixture(),v=clone(b);commitLoss(v);commitAudit(v);const proof=reconcileC2(b,v,1,1,0);
  assert.equal(proof.final_quantity,1.875);assert.equal(proof.restored,false);
  for(const change of [v=>v.waste[0].inventory_transaction_id=C2.stock,v=>v.audit.push(clone(v.audit[0])),v=>v.stocks[0].avg_cost_per_unit=0.2,v=>v.transactions[0].created_by=C2.item,v=>v.waste[0].cost=0.02,v=>v.stocks[0].last_purchase_date='2026-11-02',v=>v.transactions[0].created_at='invalid']){
    const bad=clone(v);change(bad);assert.throws(()=>reconcileC2(b,bad,1,1,0));
  }
});
test('C2 independent authority, baseline/code/fixture binding and 20 minute window',()=>{
  const env={QA_C2_EXECUTION_AUTHORIZED:C2_AUTHORITY,QA_C2_AUTHORIZED_CODE_SHA:'a'.repeat(40),QA_C2_AUTHORIZED_BASELINE_SHA256:'b'.repeat(64),QA_C2_AUTHORIZED_FIXTURE_SHA256:hash(C2),QA_C2_EXCLUSIVE_WINDOW:'TEST_ONLY_C2_EXCLUSIVE_WINDOW',QA_C2_EXCLUSIVE_AT:new Date(1000).toISOString(),QA_C2_EXCLUSIVE_UNTIL:new Date(1201000).toISOString()};
  c2Authorization(env,'a'.repeat(40),'b'.repeat(64));c2Window(env,2000);
  assert.throws(()=>c2Window(env,1201000));assert.throws(()=>c2Window({...env,QA_C2_EXCLUSIVE_UNTIL:new Date(1201001).toISOString()},2000));
  assert.throws(()=>c2Authorization({...env,QA_C2_EXECUTION_AUTHORIZED:'TEST_ONLY_EXPLICIT_C1_CHILD_20261023'},'a'.repeat(40),'b'.repeat(64)));
});
function harness(fault) {
  const state={phase:'RESERVED',baseline:fixture(),startedAt:Date.now()-1},v=clone(state.baseline),report={stock_requests_forwarded:0,audit_requests_forwarded:0};
  let failures=0,saves=[],sent=[],expired=false;
  const guard=createC2Guard({state,save:()=>{saves.push(state.phase);if(fault==='fsync')throw Error('SYNTHETIC');if(fault==='expire')expired=true;},gate:()=>{if(expired)throw Error('EXPIRED');},view:async()=>clone(v),token:'SYNTHETIC_C2',report,onFailure:()=>failures++});
  const route=(rpc,payload)=>({request:()=>({url:()=>`https://msinksoilkluooxenecy.supabase.co/rest/v1/rpc/${rpc}`,method:()=> 'POST',headers:()=>({authorization:'Bearer SYNTHETIC_C2'}),postDataJSON:()=>payload}),abort:async()=>{},continue:async()=>assert.fail('no network continue'),fetch:async options=>{
    assert.equal(options.maxRetries,0);assert.equal(options.maxRedirects,0);assert.equal(saves.at(-1),rpc==='fn_record_waste'?'LOSS_INTENT':'AUDIT_INTENT');sent.push(rpc);
    const row=rpc==='fn_record_waste'?commitLoss(v):commitAudit(v);
    if(fault===rpc)throw Error('SYNTHETIC_RESPONSE_LOST');
    return {ok:()=>true,json:async()=>fault==='json'?Promise.reject(Error('JSON')):row};},fulfill:async()=>{}});
  return {state,v,report,saves,sent,guard,route,failures:()=>failures};
}
test('C2 guard fsync precedes forwarding; exactly loss then audit; no replay',async()=>{
  const h=harness();await h.guard(h.route('fn_record_waste',wastePayload()));await h.guard(h.route('fn_write_audit',auditPayload()));
  assert.deepEqual(h.sent,['fn_record_waste','fn_write_audit']);assert.equal(h.state.phase,'AUDIT_CONFIRMED');assert.equal(h.failures(),0);
  await h.guard(h.route('fn_record_waste',wastePayload()));assert.equal(h.sent.length,2);assert.equal(h.failures(),1);
});
for(const fault of ['fn_record_waste','fn_write_audit','fsync','expire','json'])test(`C2 fault ${fault}: no replay or compensation`,async()=>{
  const h=harness(fault);await h.guard(h.route('fn_record_waste',wastePayload()));await h.guard(h.route('fn_write_audit',auditPayload()));
  const count=fault==='fn_write_audit'?2:['fsync','expire'].includes(fault)?0:1;
  assert.equal(h.sent.length,count);assert.ok(h.failures()>0);const before=hash(h.state);
  const observation=recoveryC2(h.state,h.v);assert.equal(observation.resume_allowed,false);assert.equal(hash(h.state),before);
  await h.guard(h.route('fn_record_waste',wastePayload()));assert.equal(h.sent.length,count);
});
for(const rpc of ['fn_adjust_inventory_count','fn_transfer_inventory','fn_receive_manual_stock'])test(`C2 rejects ${rpc}`,async()=>{
  const h=harness();await h.guard(h.route(rpc,wastePayload()));assert.equal(h.sent.length,0);assert.equal(h.failures(),1);
});
test('C2 rejects payload drift before intent or network',async()=>{const h=harness();await h.guard(h.route('fn_record_waste',{...wastePayload(),p_qty:0.5}));assert.equal(h.sent.length,0);assert.equal(h.saves.length,0);});
test('C2 overlap stops first before forwarding after concurrent failure',async()=>{
  const h=harness();await Promise.all([h.guard(h.route('fn_record_waste',wastePayload())),h.guard(h.route('fn_record_waste',wastePayload()))]);assert.equal(h.sent.length,0);
});
test('C2 recovery observes loss without audit and never authorizes continuation',()=>{
  const state={phase:'LOSS_INTENT',baseline:fixture(),startedAt:0},v=clone(state.baseline);commitLoss(v);
  assert.equal(recoveryC2(state,v).audit_rows,0);assert.equal(recoveryC2(state,v).full_homologation,false);
  v.audit.push({});assert.throws(()=>recoveryC2(state,v));
});
test('C2 durable store reserves once, enforces transitions and detects changed bytes',()=>{
  const root=mkdtempSync(join(tmpdir(),'nexalvo-c2-offline-store-'));
  try{
    const script=`import {openC2Store,c2Directory} from './qa/stock-c2-store.mjs';import {fixture} from './qa/stock-c2-test-support.mjs';import {writeFileSync,readFileSync} from 'node:fs';import {join} from 'node:path';import assert from 'node:assert/strict';const s=openC2Store();s.available();const state={phase:'RESERVED',baseline:fixture(),sourceSha:'a'.repeat(40),reviewHash:'b'.repeat(64),window:{at:0,until:1},startedAt:0};s.reserve(state);assert.throws(()=>openC2Store().available());assert.throws(()=>openC2Store().save(state));state.phase='LOSS_INTENT';s.save(state);const original=readFileSync(join(c2Directory(),'1.json'));assert.equal(openC2Store().load().state.phase,'LOSS_INTENT');state.phase='AUDIT_INTENT';assert.throws(()=>s.save(state));writeFileSync(join(c2Directory(),'2.json'),'{',{mode:0o600});assert.throws(()=>s.load());assert.equal(s.load(true).partial_tail_retained,true);assert.equal(s.load(true).state.phase,'LOSS_INTENT');writeFileSync(join(c2Directory(),'1.json'),original.toString().replace('LOSS_INTENT','COMPLETE'));assert.throws(()=>s.load());console.log('OFFLINE_STORE_PASS');`;
    const out=execFileSync(process.execPath,['--input-type=module','-'],{input:script,env:{...process.env,TEMP:root,TMP:root,TMPDIR:root},encoding:'utf8',stdio:['pipe','pipe','pipe']});assert.match(out,/OFFLINE_STORE_PASS/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('C2 runner without explicit mode or C2 authority never authenticates',async()=>{
  let calls=0;const r=await stockC2({},[],{openClient:()=>{calls++;}});assert.equal(r.status,'BLOCKED');assert.equal(calls,0);
  const rr=await stockC2({QA_C2_VALIDATED_CODE_SHA:'a'.repeat(40)},['--execute'],{git:()=>'',openClient:()=>{calls++;}});assert.equal(rr.status,'BLOCKED');assert.equal(calls,0);
});
