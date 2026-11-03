import test from 'node:test';
import assert from 'node:assert/strict';
import { stockC2 } from './stock-c2-executor.mjs';
import { C2, C2_AUTHORITY, hash } from './stock-c2-protocol.mjs';
import { fixture, commitLoss, commitAudit } from './stock-c2-test-support.mjs';
function harness(){
  const b=fixture(),calls={client:0,reserve:0,save:0,runtime:0},sha='a'.repeat(40),now=Date.now();
  const env={QA_SUPABASE_URL:'https://msinksoilkluooxenecy.supabase.co',QA_SUPABASE_ANON_KEY:'sb_publishable_SYNTHETIC',QA_TWO_TENANT_A_EMAIL:'SYNTHETIC_A',QA_TWO_TENANT_A_PASSWORD:'SYNTHETIC_A',QA_TWO_TENANT_B_EMAIL:'SYNTHETIC_B',QA_TWO_TENANT_B_PASSWORD:'SYNTHETIC_B',QA_C2_VALIDATED_CODE_SHA:sha};
  const store={available:()=>{},load:()=>({state:{phase:'LOSS_INTENT',baseline:b,startedAt:0},semanticChecksum:'c'.repeat(64),bytesManifestSha256:'d'.repeat(64),fileHashes:[]}),reserve:()=>{calls.reserve++;},save:()=>{calls.save++;},assertCurrent:()=>{}};
  const d={git:(...args)=>args[0]==='branch'?'automation/nexalvo-qa-actions':args[0]==='rev-parse'?sha:'',read:()=>({captured_at:new Date(now).toISOString()}),catalog:()=>{},security:()=>({securityHash:'b'.repeat(64)}),openStore:()=>store,
    openClient:async()=>{calls.client++;return{isolation:async()=>{},view:async()=>structuredClone(b),close:async()=>{}};},prepareRuntime:async()=>{calls.runtime++;return{close:async()=>{}};},now:()=>now};
  return{b,calls,sha,env,d,store,now};
}
test('C2 preflight reads twice and returns only hashes; no reservation/runtime/write',async()=>{
  const h=harness(),r=await stockC2(h.env,['--preflight'],h.d);assert.equal(r.status,'PASS');assert.equal(r.baseline_sha256,hash(h.b));assert.deepEqual(h.calls,{client:1,reserve:0,save:0,runtime:0});
  assert.equal(r.full_homologation,false);assert.equal(r.stock_forward_attempts,0);assert.ok(!JSON.stringify(r).includes('SYNTHETIC'));
});
test('C2 execute rejects C1 authorization before authentication',async()=>{
  const h=harness();h.env.QA_C1_CHILD_EXECUTION_AUTHORIZED='TEST_ONLY_EXPLICIT_C1_CHILD_20261023';
  const r=await stockC2(h.env,['--execute'],h.d);assert.equal(r.status,'BLOCKED');assert.equal(h.calls.client,0);
});
test('C2 execute mismatch of approved baseline blocks before reserve or browser',async()=>{
  const h=harness();Object.assign(h.env,{QA_C2_EXECUTION_AUTHORIZED:C2_AUTHORITY,QA_C2_AUTHORIZED_CODE_SHA:h.sha,QA_C2_AUTHORIZED_BASELINE_SHA256:'d'.repeat(64),QA_C2_AUTHORIZED_FIXTURE_SHA256:hash(C2),QA_C2_EXCLUSIVE_WINDOW:'TEST_ONLY_C2_EXCLUSIVE_WINDOW',QA_C2_EXCLUSIVE_AT:new Date(h.now-1000).toISOString(),QA_C2_EXCLUSIVE_UNTIL:new Date(h.now+10000).toISOString()});
  const r=await stockC2(h.env,['--execute'],h.d);assert.equal(r.status,'BLOCKED');assert.equal(h.calls.reserve,0);assert.equal(h.calls.runtime,0);
});
test('C2 recovery has no authorization/window requirement, no save/reserve/runtime and no replay',async()=>{
  const h=harness();h.env.QA_C2_JOURNAL_SEMANTIC_CHECKSUM='c'.repeat(64);h.env.QA_C2_JOURNAL_BYTES_MANIFEST_SHA256='d'.repeat(64);
  const r=await stockC2(h.env,['--recover-readonly'],h.d);assert.equal(r.status,'PASS');assert.equal(r.observation.resume_allowed,false);assert.equal(h.calls.save,0);assert.equal(h.calls.reserve,0);assert.equal(h.calls.runtime,0);
});
for(const fault of ['security','read','isolation','journal'])test(`C2 failure ${fault} produces sanitized BLOCKED without reserve`,async()=>{
  const h=harness();const fail=()=>{throw Error('SYNTHETIC_PRIVATE_ERROR');};
  if(fault==='security')h.d.security=fail;if(fault==='read')h.d.read=fail;if(fault==='journal')h.store.available=fail;
  if(fault==='isolation')h.d.openClient=async()=>({isolation:fail,close:async()=>{}});
  const r=await stockC2(h.env,['--preflight'],h.d);assert.equal(r.status,'BLOCKED');assert.equal(h.calls.reserve,0);assert.ok(!JSON.stringify(r).includes('PRIVATE'));
});
test('C2 rechecks journal after runtime and session cleanup, downgrades a provisional PASS on tamper',async()=>{
  const h=harness();let v=structuredClone(h.b),changed=false;
  Object.assign(h.env,{QA_C2_EXECUTION_AUTHORIZED:C2_AUTHORITY,QA_C2_AUTHORIZED_CODE_SHA:h.sha,QA_C2_AUTHORIZED_BASELINE_SHA256:hash(h.b),QA_C2_AUTHORIZED_FIXTURE_SHA256:hash(C2),QA_C2_EXCLUSIVE_WINDOW:'TEST_ONLY_C2_EXCLUSIVE_WINDOW',QA_C2_EXCLUSIVE_AT:new Date(h.now-1000).toISOString(),QA_C2_EXCLUSIVE_UNTIL:new Date(h.now+60000).toISOString()});
  h.store.assertCurrent=()=>{if(changed)throw Error('SYNTHETIC_TAMPER');};
  h.d.openClient=async()=>({isolation:async()=>{},view:async()=>structuredClone(v),close:async()=>{changed=true;}});
  h.d.browser=async({state,save,report})=>{
    state.phase='LOSS_INTENT';state.intentAt=h.now;save();state.lossReceipt=commitLoss(v);state.movementReceipt=v.transactions[0];state.phase='LOSS_CONFIRMED';save();
    state.phase='AUDIT_INTENT';save();state.auditReceipt=commitAudit(v);state.phase='AUDIT_CONFIRMED';save();
    Object.assign(report,{stock_forward_attempts:1,audit_forward_attempts:1,ui_cycle:'PASS',persist_reload:'PASS',ui_history:'PASS'});
  };
  const r=await stockC2(h.env,['--execute'],h.d);assert.equal(r.status,'BLOCKED');assert.equal(r.code,'C2_FINAL_JOURNAL_CHANGED');assert.equal(r.full_homologation,false);
});
for(const which of ['catalog','security'])for(const phase of ['LOSS_INTENT','AUDIT_INTENT'])test(`F05 ${which} expires after durable ${phase}: no subsequent transport is admitted`,async()=>{
  const h=harness();let clock=h.now,validations=0,durable,attempts=0;
  h.d.now=()=>clock;
  h.d.read=path=>({captured_at:new Date((path===which?h.now-86400000+15000:h.now)).toISOString()});
  h.env.QA_C2_CATALOG_FILE='catalog';h.env.QA_C2_SECURITY_FILE='security';
  h.d.catalog=()=>{validations++;};h.d.security=()=>{validations++;return{securityHash:'b'.repeat(64)};};
  Object.assign(h.env,{QA_C2_EXECUTION_AUTHORIZED:C2_AUTHORITY,QA_C2_AUTHORIZED_CODE_SHA:h.sha,QA_C2_AUTHORIZED_BASELINE_SHA256:hash(h.b),QA_C2_AUTHORIZED_FIXTURE_SHA256:hash(C2),QA_C2_EXCLUSIVE_WINDOW:'TEST_ONLY_C2_EXCLUSIVE_WINDOW',QA_C2_EXCLUSIVE_AT:new Date(h.now-1000).toISOString(),QA_C2_EXCLUSIVE_UNTIL:new Date(h.now+60000).toISOString()});
  h.store.save=state=>{durable=structuredClone(state);if(state.phase===phase)clock=h.now+16000;};
  h.store.load=()=>({state:durable,semanticChecksum:'c'.repeat(64),bytesManifestSha256:'d'.repeat(64),fileHashes:[]});
  h.d.browser=async({state,save,gate,report})=>{
    gate({dispatch:true});state.phase='LOSS_INTENT';state.intentAt=clock;save();
    if(phase==='AUDIT_INTENT'){
      report.stock_forward_attempts++;const v=structuredClone(h.b);state.lossReceipt=commitLoss(v);state.movementReceipt=v.transactions[0];state.phase='LOSS_CONFIRMED';save();
      gate({dispatch:true});state.phase='AUDIT_INTENT';save();
    }
    attempts++;
  };
  const r=await stockC2(h.env,['--execute'],h.d);assert.equal(r.status,'BLOCKED');assert.equal(attempts,0);assert.equal(durable.phase,phase);assert.equal(r.stock_forward_attempts,phase==='LOSS_INTENT'?0:1);assert.equal(r.audit_forward_attempts,0);assert.ok(validations>=8);
});
test('F05 every authenticated client read-RPC receives freshness guard, no window required by readonly recovery',async()=>{
  const h=harness();let config,checks=0;h.d.catalog=()=>{checks++;};
  h.d.openClient=async c=>{config=c;return{isolation:async()=>{},view:async()=>{c.beforeReadRPC();return structuredClone(h.b);},close:async()=>{}};};
  const r=await stockC2(h.env,['--preflight'],h.d);assert.equal(r.status,'PASS');assert.ok(checks>=3);assert.ok(config.beforeReadRPC().timeoutMs>0);
});
