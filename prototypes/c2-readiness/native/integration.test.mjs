// Real PG17/native psql only. Never fallback to LocalSession or to a remote database.
import test,{before,after} from 'node:test';import assert from 'node:assert/strict';
import {existsSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';import {join} from 'node:path';
import {localCluster} from './cluster.mjs';import {NativeLocalSession} from './adapter.mjs';
import {LocalJournal,ReadinessPrototype,LIMIT_MS,MIN_HEADROOM_MS,assertRealExecutionBlocked} from '../protocol.mjs';
import {privateRun} from '../../../qa/stock-c2-seed-transport.mjs';
import {durableJSON,json,check,wait} from './common.mjs';
let cluster;const cases=[];
before(async()=>{
 check(process.env.C2_NATIVE_PG_BIN&&process.env.C2_NATIVE_OPENSSL,'NATIVE_TEST_DEPENDENCIES_REQUIRED');
 cluster=await localCluster({pgBin:process.env.C2_NATIVE_PG_BIN,openssl:process.env.C2_NATIVE_OPENSSL,artifacts:process.env.C2_NATIVE_ARTIFACTS});
});
after(()=>{if(cluster){cluster.stop();durableJSON(join(cluster.root,'native-integration-summary.json'),{scope:'NATIVE_DISPOSABLE_ONLY',cases,local_server_stopped:true,files_removed:0,operational_marker_created:false,operational_seed_loaded:false,supabase_connections:0,authentication:'certificate',limits:{absolute_ms:LIMIT_MS,minimum_margin_ms:MIN_HEADROOM_MS},version:cluster.manifest.version,psql_sha256:cluster.manifest.psql_sha256});console.log('NATIVE_SUMMARY_DIRECTORY='+cluster.root);}});
function setup(name,options={}){
 const directory=privateRun(cluster.root,'c2-readiness-local-'+name),journal=new LocalJournal(directory,{scope:'NATIVE_DISPOSABLE_ONLY'}),session=new NativeLocalSession({clusterRoot:cluster.root,directory,...options}),model=new ReadinessPrototype({journal,session});return{name,directory,journal,session,model};
}
async function finish(x){
 x.model.stopLocal('LOCAL_TEST_FINISHED');await x.session.waitClosed();
 const termination=json(join(x.directory,'native-termination.json'));
 assert.equal(termination.all_observed_children_ended,true);
 const eventNames=x.journal.events.map(e=>e.type),exposed=existsSync(join(x.directory,'dispatch.local.psql'));
 const proof={case:x.name,status:x.model.state,reason:x.model.reason,forward_reservations:x.model.forwardAttempts,submissions:x.session.submissions,psql_pid:x.session.nativePid,helper_pids:termination.helper_pids,all_children_ended:true,read_proofs:x.session.proofs.length,same_backend:x.session.proofs.length===2?x.session.proofs[0].backend_pid===x.session.proofs[1].backend_pid&&x.session.proofs[0].backend_start===x.session.proofs[1].backend_start:null,dispatch_exposed:exposed,password_prompt_observed:x.session.promptObserved,events:eventNames,artifacts_retained:true};cases.push(proof);durableJSON(join(x.directory,'native-case-result.json'),proof);return proof;
}
test('native certificate authentication/read-only proof precedes operator readiness; one backend commits synthetic TEMP data',async()=>{
 const x=setup('success');try{
  await x.model.authenticate();assert.equal(x.model.state,'READ_PROVEN');assert.equal(existsSync(join(x.directory,'operator-ack.local.json')),false);
  assert.equal(existsSync(join(x.directory,'dispatch.local.psql')),false);assert.equal(x.session.proofs[0].ssl,true);
  await x.model.ready(await x.session.operatorAcknowledgement());assert.equal(await x.model.dispatchSynthetic(),'NATIVE_SYNTHETIC_CONFIRMED');
  assert.equal(x.session.proofs.length,2);assert.deepEqual(x.session.proofs[0],x.session.proofs[1]);
  assert.equal(x.session.submissions,1);assert.equal(x.session.exitCode,0);const published=json(join(x.directory,'permit-published.local.json'));assert.ok(published.intent_sha256&&published.reservation_sha256);
 }finally{await finish(x);}
});
test('missing operator readiness terminates psql/helper with no intent, reservation or exposed operation',async()=>{
 const x=setup('operator-declines');try{await x.model.authenticate();await assert.rejects(x.session.operatorAcknowledgement(false));assert.equal(existsSync(join(x.directory,'intent.local-only.json')),false);assert.equal(existsSync(join(x.directory,'dispatch.local.psql')),false);}finally{const r=await finish(x);assert.equal(r.forward_reservations,0);assert.equal(r.dispatch_exposed,false);}
});
test('intent persistence collision prevents native recheck and exposure',async()=>{
 const x=setup('intent-collision');try{await x.model.authenticate();await x.model.ready(await x.session.operatorAcknowledgement());writeFileSync(join(x.directory,'intent.local-only.json'),'LOCAL_COLLISION',{flag:'wx'});await assert.rejects(x.model.dispatchSynthetic());assert.equal(x.session.proofs.length,1);assert.equal(existsSync(join(x.directory,'dispatch.local.psql')),false);}finally{const r=await finish(x);assert.equal(r.forward_reservations,0);}
});
test('reservation persistence failure consumes its conservative slot but cannot expose the native operation',async()=>{
 const x=setup('reservation-collision');try{await x.model.authenticate();await x.model.ready(await x.session.operatorAcknowledgement());writeFileSync(join(x.directory,'forward-reservation.local-only.json'),'LOCAL_COLLISION',{flag:'wx'});await assert.rejects(x.model.dispatchSynthetic());assert.equal(x.model.state,'UNCERTAIN');assert.equal(existsSync(join(x.directory,'dispatch.local.psql')),false);await assert.rejects(x.model.dispatchSynthetic(),/TERMINAL_NO_REPLAY/);}finally{const r=await finish(x);assert.equal(r.forward_reservations,1);assert.equal(r.dispatch_exposed,false);}
});
test('real TLS rejects untrusted CA before authenticated proof or readiness',async()=>{
 const x=setup('untrusted-ca',{fault:'wrong_ca'});try{await assert.rejects(x.model.authenticate());assert.equal(x.session.proofs.length,0);}finally{const r=await finish(x);assert.equal(r.forward_reservations,0);assert.equal(r.dispatch_exposed,false);}
});
test('real PostgreSQL rejects a CA-signed client with the wrong user subject',async()=>{
 const x=setup('wrong-client-subject',{fault:'wrong_client'});try{await assert.rejects(x.model.authenticate());assert.equal(x.session.proofs.length,0);}finally{const r=await finish(x);assert.equal(r.forward_reservations,0);assert.equal(r.dispatch_exposed,false);}
});
test('invalid/expired exclusive window cannot even construct a native session',()=>{
 const directory=privateRun(cluster.root,'c2-readiness-local-expired');assert.throws(()=>new NativeLocalSession({clusterRoot:cluster.root,directory,windowAt:Date.now()-1000,windowUntil:Date.now()-1}),/NATIVE_LOCAL_WINDOW_REQUIRED/);
});
test('native helper refuses a window shorter than the unchanged 30s admission margin',async()=>{
 const x=setup('short-window',{windowUntil:Date.now()+5000});try{await assert.rejects(async()=>{await x.model.authenticate();await x.model.ready(await x.session.operatorAcknowledgement());await x.model.dispatchSynthetic();});}finally{const r=await finish(x);assert.equal(r.forward_reservations,0);assert.equal(r.dispatch_exposed,false);}
});
test('external psql failure also terminates its observed readiness helper',async()=>{
 const x=setup('external-psql-exit'),started=Date.now();try{
  await x.model.authenticate();for(let i=0;i<100&&!existsSync(join(x.directory,'helper-intent.json'));i++)await wait(20);
  assert.ok(existsSync(join(x.directory,'helper-intent.json')));process.kill(x.session.nativePid,'SIGKILL');
  // A concurrent public READY may arrive; it cannot stand in for a live backend recheck.
  await assert.rejects(async()=>{await x.model.ready(await x.session.operatorAcknowledgement());await x.model.dispatchSynthetic();});
 }finally{const r=await finish(x);assert.equal(r.forward_reservations,0);assert.equal(r.dispatch_exposed,false);assert.ok(r.helper_pids.length>0);assert.ok(Date.now()-started<10000);}
});
test('native password prompt delay hits the unchanged absolute 120s before intent, reserve or exposure',{timeout:140000},async()=>{
 const x=setup('password-delay',{holdPasswordPrompt:true}),started=Date.now();try{
  await assert.rejects(x.model.authenticate(),/ABSOLUTE_DEADLINE/);assert.ok(Date.now()-started>=119000);assert.ok(Date.now()-started<125000);assert.equal(x.session.promptObserved,true);assert.equal(x.session.proofs.length,0);
  for(const name of ['operator-ack.local.json','intent.local-only.json','forward-reservation.local-only.json','dispatch.local.psql'])assert.equal(existsSync(join(x.directory,name)),false);
 }finally{const r=await finish(x);assert.equal(r.forward_reservations,0);assert.equal(r.dispatch_exposed,false);}
});
test('native local adapter does not implement or unlock an operational path',()=>{assert.throws(assertRealExecutionBlocked,/REAL_EXECUTION_UNIMPLEMENTED_HISTORY_LOCK_PRESERVED/);});
