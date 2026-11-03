// Only new readiness-model behaviors. No old suites, DB, credentials or historical files.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,readdirSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {LocalJournal,LocalSession,ReadinessPrototype,LIMIT_MS,OPERATION_HASH,HISTORY,assertRealExecutionBlocked} from './protocol.mjs';
class ManualClock {
 w=1000000;m=0;timers=new Set();wall=()=>this.w;mono=()=>this.m;
 arm(fn,ms){const t={fn,at:this.m+ms};this.timers.add(t);return()=>this.timers.delete(t);}
 advance(ms){this.w+=ms;this.m+=ms;for(const t of [...this.timers])if(t.at<=this.m){this.timers.delete(t);t.fn();}}
}
function setup(plan={}){const dir=mkdtempSync(join(tmpdir(),'c2-readiness-local-')),journal=new LocalJournal(dir),session=new LocalSession(plan),clock=new ManualClock(),model=new ReadinessPrototype({journal,session,clock});return{dir,journal,session,clock,model};}
function ack(x,extra={}){return{scope:'LOCAL_SIMULATION_ONLY',operator_confirmed:true,proof_digest:x.model.proofDigest,operation_hash:OPERATION_HASH,history_acknowledged:HISTORY,review_decision:'SIMULATION_ONLY',window_at:x.clock.wall(),window_until:x.clock.wall()+60000,...extra};}
async function prepared(plan={}){const x=setup(plan);await x.model.authenticate();await x.model.ready(ack(x));return x;}
test('read proof alone does not declare operator ready or make forwarding possible',async()=>{
 const x=setup();await x.model.authenticate();assert.equal(x.model.state,'READ_PROVEN');assert.equal(x.session.probes,1);assert.equal(x.session.submissions,0);
 await assert.rejects(x.model.dispatchSynthetic(),/INVALID_PHASE/);assert.equal(x.model.state,'STOPPED');assert.equal(x.model.forwardAttempts,0);
});
test('readiness must bind proof, operation, prior consumed attempt and explicit window',async()=>{
 for(const patch of [{operator_confirmed:false},{proof_digest:'OTHER'},{operation_hash:'OTHER'},{history_acknowledged:'NONE'},{review_decision:'REAL'},{window_until:0}]){
  const x=setup();await x.model.authenticate();await assert.rejects(x.model.ready(ack(x,patch)));assert.equal(x.session.submissions,0);
 }
});
test('one local session traverses proof, ready, durable intent, recheck, reservation and confirmation in order',async()=>{
 const x=await prepared();assert.equal(await x.model.dispatchSynthetic(),'SIMULATION_CONFIRMED');assert.equal(x.session.probes,2);assert.equal(x.session.submissions,1);
 assert.deepEqual(x.journal.events.map(e=>e.type),['CREATED','SIMULATED_READ_PROOF','OPERATOR_DECLARED_READY','INTENT_DURABLE','SAME_SESSION_RECHECKED','FORWARD_RESERVED','SIMULATED_CONFIRMATION_OBSERVED','FINAL']);
 assert.equal(JSON.parse(readFileSync(join(x.dir,'intent.local-only.json'),'utf8')).history,HISTORY);assert.equal(x.model.forwardAttempts,1);
});
test('backend change after durable intent stops before forwarding',async()=>{
 const x=await prepared({backendChanges:true});await assert.rejects(x.model.dispatchSynthetic(),/BACKEND_OR_CHANNEL_CHANGED/);assert.equal(x.session.submissions,0);assert.equal(x.model.forwardAttempts,0);assert.equal(x.model.state,'STOPPED');
});
test('durable intent collision fails closed; no submission and existing bytes preserved',async()=>{
 const x=await prepared();const f=join(x.dir,'intent.local-only.json');writeFileSync(f,'LOCAL_EXISTING',{flag:'wx'});await assert.rejects(x.model.dispatchSynthetic());assert.equal(readFileSync(f,'utf8'),'LOCAL_EXISTING');assert.equal(x.session.submissions,0);
});
test('absolute 120s starts at model creation; authentication/readiness never restart it',async()=>{
 const x=setup();x.clock.advance(LIMIT_MS-10);await x.model.authenticate();const deadline=x.model.deadlineWall;await x.model.ready(ack(x,{window_until:x.clock.wall()+60000}));assert.equal(x.model.deadlineWall,deadline);
 x.clock.advance(10);await assert.rejects(x.model.dispatchSynthetic(),/TERMINAL_NO_REPLAY/);assert.equal(x.session.submissions,0);
});
test('exclusive window only shortens the absolute deadline',async()=>{
 const x=setup();await x.model.authenticate();await x.model.ready(ack(x,{window_until:x.clock.wall()+5}));x.clock.advance(5);assert.equal(x.model.state,'STOPPED');assert.equal(x.session.submissions,0);
});
test('deadline while waiting for initial proof closes the local session and rejects late progress',async()=>{
 const x=setup({waitAt:'proof'}),pending=x.model.authenticate();x.clock.advance(LIMIT_MS);await assert.rejects(pending,/ABSOLUTE_DEADLINE/);x.session.release();await Promise.resolve();assert.equal(x.model.state,'STOPPED');assert.equal(x.session.closed,true);assert.equal(x.model.proofDigest,null);
});
test('uncertain response consumes one forwarding reservation and replay is permanently blocked',async()=>{
 const x=await prepared({responseLost:true});await assert.rejects(x.model.dispatchSynthetic(),/SIMULATED_RESPONSE_LOST/);assert.equal(x.model.state,'UNCERTAIN');assert.equal(x.model.forwardAttempts,1);await assert.rejects(x.model.dispatchSynthetic(),/TERMINAL_NO_REPLAY/);assert.equal(x.session.submissions,1);assert.throws(()=>new LocalJournal(x.dir),/NO_RESUME/);
});
test('deadline after reservation rejects even a late correct confirmation without retry',async()=>{
 const x=await prepared({waitAt:'submission'}),pending=x.model.dispatchSynthetic();for(let i=0;i<8&&x.session.submissions===0;i++)await Promise.resolve();assert.equal(x.session.submissions,1);
 x.clock.advance(60000);await assert.rejects(pending,/ABSOLUTE_DEADLINE/);x.session.release();await Promise.resolve();assert.equal(x.model.state,'UNCERTAIN');assert.equal(x.model.forwardAttempts,1);assert.equal(x.journal.events.at(-1).state,'UNCERTAIN');
});
test('wrong receipt is uncertain; successful simulation also cannot be replayed',async()=>{
 const bad=await prepared({badReceipt:true});await assert.rejects(bad.model.dispatchSynthetic(),/SIMULATED_CONFIRMATION_REJECTED/);assert.equal(bad.model.state,'UNCERTAIN');
 const good=await prepared();await good.model.dispatchSynthetic();const files=readdirSync(good.dir);await assert.rejects(good.model.dispatchSynthetic(),/TERMINAL_NO_REPLAY/);assert.equal(good.session.submissions,1);assert.deepEqual(readdirSync(good.dir),files);
});
test('failure to persist final confirmation never yields confirmed state',async()=>{
 const x=await prepared();writeFileSync(join(x.dir,'007-FINAL.json'),'LOCAL_COLLISION',{flag:'wx'});await assert.rejects(x.model.dispatchSynthetic());assert.equal(x.model.state,'UNCERTAIN');assert.equal(x.model.forwardAttempts,1);assert.equal(x.session.submissions,1);
});
test('wall-clock regression stops instead of extending readiness',async()=>{
 const x=await prepared();x.clock.w--;await assert.rejects(x.model.dispatchSynthetic(),/CLOCK_REGRESSION/);assert.equal(x.session.submissions,0);
});
test('real execution remains unimplemented and historically blocked',()=>{
 assert.throws(assertRealExecutionBlocked,/REAL_EXECUTION_UNIMPLEMENTED_HISTORY_LOCK_PRESERVED/);
});
test('remaining time below the existing 30s admission margin cannot forward',async()=>{
 const x=await prepared();x.clock.advance(30001);await assert.rejects(x.model.dispatchSynthetic(),/INSUFFICIENT_HEADROOM/);assert.equal(x.session.submissions,0);assert.equal(x.model.forwardAttempts,0);
});
test('admission is checked again after durable intent persistence',async()=>{
 const x=await prepared();const write=x.journal.write.bind(x.journal);x.journal.write=(name,value)=>{write(name,value);if(name==='intent.local-only.json')x.clock.advance(30001);};
 await assert.rejects(x.model.dispatchSynthetic(),/INSUFFICIENT_HEADROOM/);assert.equal(x.session.submissions,0);assert.equal(x.model.forwardAttempts,0);
});
test('uncertain reservation persistence is conservative and cannot reopen the budget',async()=>{
 const x=await prepared();writeFileSync(join(x.dir,'forward-reservation.local-only.json'),'LOCAL_EXISTING',{flag:'wx'});await assert.rejects(x.model.dispatchSynthetic());assert.equal(x.model.state,'UNCERTAIN');assert.equal(x.model.forwardAttempts,1);assert.equal(x.session.submissions,0);await assert.rejects(x.model.dispatchSynthetic(),/TERMINAL_NO_REPLAY/);
});
