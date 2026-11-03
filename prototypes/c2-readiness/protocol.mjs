// Shared local controller: simulator or owned native disposable adapter; no operational path.
import {openSync,writeFileSync,fsyncSync,closeSync,readdirSync,lstatSync} from 'node:fs';
import {join,basename,resolve} from 'node:path';
import {createHash} from 'node:crypto';
export const LIMIT_MS=120000;
export const MIN_HEADROOM_MS=30000;
export const OPERATION_HASH=digest({operation:'LOCAL_SYNTHETIC_NO_SQL'});
export const HISTORY='SINGLE_ATTEMPT_CONSUMED_UNCONFIRMED_NO_RETRY';
function fail(code){throw Object.assign(new Error(code),{code});}
function requireThat(ok,code){if(!ok)fail(code);}
export function digest(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
export function assertRealExecutionBlocked(){fail('REAL_EXECUTION_UNIMPLEMENTED_HISTORY_LOCK_PRESERVED');}
// Trusted local native implementation must enforce owned loopback/cluster/TLS itself.
// This boundary never authorizes an operational or Supabase adapter.
export class NativeDisposableBoundary {}

export class LocalJournal {
 #sequence=0;#sealed=false;#events=[];
 constructor(directory,{scope='LOCAL_SIMULATION_ONLY'}={}){
  requireThat(['LOCAL_SIMULATION_ONLY','NATIVE_DISPOSABLE_ONLY'].includes(scope),'LOCAL_SCOPE_REQUIRED');
  this.directory=resolve(directory);
  requireThat(basename(this.directory).startsWith('c2-readiness-local-')&&!lstatSync(this.directory).isSymbolicLink()&&readdirSync(this.directory).length===0,'LOCAL_EMPTY_DIRECTORY_REQUIRED_NO_RESUME');
  this.write('store.local-only.json',{scope,real_execution:false});
 }
 write(name,value){
  requireThat(!this.#sealed,'LOCAL_JOURNAL_SEALED');
  const fd=openSync(join(this.directory,name),'wx',0o600);
  try{writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 }
 event(type,fields={}){const value={type,...fields};this.write(`${String(this.#sequence++).padStart(3,'0')}-${type}.json`,value);this.#events.push(value);}
 finish(state,reason){this.event('FINAL',{state,reason});this.#sealed=true;}
 get events(){return structuredClone(this.#events);}
}

// Fault plans affect this in-memory simulator only. It cannot receive SQL or a host.
export class LocalSession {
 probes=0;submissions=0;closed=false;#plan;#release;
 constructor(plan={}){this.#plan=Object.freeze({...plan});}
 #identity(){return {scope:'SIMULATED_ONLY',channel:'ONE_LOCAL_CHANNEL',backend_pid:this.#plan.backendChanges&&this.probes>1?8:7,backend_start:'SIMULATED_START',project:'SIMULATED_TEST',tls:'SIMULATED_VERIFY_FULL',read_only:true};}
 async #wait(stage){if(this.#plan.waitAt===stage)await new Promise(r=>{this.#release=r;});}
 release(){this.#release?.();}
 async readProof(){this.probes++;await this.#wait('proof');return this.#identity();}
 async simulateSubmission(){
  this.submissions++;await this.#wait('submission');if(this.#plan.responseLost)fail('SIMULATED_RESPONSE_LOST');
  return {backend:this.#identity(),operation_hash:this.#plan.badReceipt?'MISMATCH':OPERATION_HASH,command_tag:'COMMIT',postconditions:true};
 }
 close(){this.closed=true;}
}
export class RealClock {
 wall=()=>Date.now();mono=()=>Number(process.hrtime.bigint()/1000000n);
 arm(callback,ms){const t=setTimeout(callback,ms);t.unref();return()=>clearTimeout(t);}
}

export class ReadinessPrototype {
 #journal;#session;#clock;#cancel;#stopped;#rejectStop;#busy=false;#terminal=false;#reserved=false;#proof;#ready;#lastWall;#lastMono;#native;#scope;#operationHash;
 state='CREATED';reason=null;proofDigest=null;deadlineWall;deadlineMono;
 constructor({journal,session,clock=new RealClock()}){
  this.#native=session instanceof NativeDisposableBoundary;
  requireThat(this.#native||(session instanceof LocalSession&&Object.getPrototypeOf(session)===LocalSession.prototype),'LOCAL_SIMULATOR_REQUIRED');
  this.#scope=this.#native?'NATIVE_DISPOSABLE_ONLY':'LOCAL_SIMULATION_ONLY';this.#operationHash=this.#native?session.operationHash:OPERATION_HASH;
  this.#journal=journal;this.#session=session;this.#clock=clock;
  this.#lastWall=clock.wall();this.#lastMono=clock.mono();this.deadlineWall=this.#lastWall+LIMIT_MS;this.deadlineMono=this.#lastMono+LIMIT_MS;
  if(this.#native){this.deadlineWall=Math.min(this.deadlineWall,session.windowUntil);this.deadlineMono=Math.min(this.deadlineMono,this.#lastMono+session.windowUntil-this.#lastWall);session.bindTiming(this.deadlineWall,this.deadlineMono);}
  this.#stopped=new Promise((_,reject)=>{this.#rejectStop=reject;});this.#stopped.catch(()=>{});
  journal.event('CREATED',{scope:this.#scope,deadline_wall:this.deadlineWall,limit_ms:LIMIT_MS});this.#arm();
 }
 #arm(){this.#cancel?.();this.#cancel=this.#clock.arm(()=>this.#stop('ABSOLUTE_DEADLINE'),Math.max(0,Math.min(this.deadlineWall-this.#clock.wall(),this.deadlineMono-this.#clock.mono())));}
 #checkpoint(){
  requireThat(!this.#terminal,'TERMINAL_NO_REPLAY');
  const w=this.#clock.wall(),m=this.#clock.mono();
  requireThat(w>=this.#lastWall&&m>=this.#lastMono,'CLOCK_REGRESSION');this.#lastWall=w;this.#lastMono=m;
  requireThat(w<this.deadlineWall&&m<this.deadlineMono,'ABSOLUTE_DEADLINE');
 }
 #admit(){this.#checkpoint();requireThat(Math.min(this.deadlineWall-this.#clock.wall(),this.deadlineMono-this.#clock.mono())>=MIN_HEADROOM_MS,'INSUFFICIENT_HEADROOM');}
 #stop(code){
  if(this.#terminal)return;this.#terminal=true;this.reason=code;this.state=this.#reserved?'UNCERTAIN':'STOPPED';this.#cancel?.();this.#session.close();
  try{this.#journal.finish(this.state,code);}catch{/* persistent partial journal remains a no-resume barrier */}
  this.#rejectStop(Object.assign(new Error(code),{code}));
 }
 async #work(expected,action){
  if(this.#terminal)fail('TERMINAL_NO_REPLAY');
  try{
   this.#checkpoint();requireThat(!this.#busy&&this.state===expected,'INVALID_PHASE_NO_FORWARD');this.#busy=true;
   return await Promise.race([action(),this.#stopped]);
  }catch(e){this.#stop(e.code||'LOCAL_FAILURE');throw e;}finally{this.#busy=false;}
 }
 async authenticate(){return this.#work('CREATED',async()=>{
  const proof=await this.#session.readProof();this.#checkpoint();
  requireThat(this.#native?this.#session.validateReadProof(proof):(proof.scope==='SIMULATED_ONLY'&&proof.project==='SIMULATED_TEST'&&proof.tls==='SIMULATED_VERIFY_FULL'&&proof.read_only===true),'LOCAL_PROOF_REJECTED');
  this.#proof=proof;this.proofDigest=digest(proof);this.#journal.event(this.#native?'NATIVE_READ_PROOF':'SIMULATED_READ_PROOF',{proof,semantic_checksum:this.proofDigest});this.state='READ_PROVEN';return this.proofDigest;
 });}
 async ready(ack){return this.#work('READ_PROVEN',async()=>{
  const w=this.#clock.wall(),m=this.#clock.mono();
  requireThat(ack?.scope===this.#scope&&ack.operator_confirmed===true&&ack.proof_digest===this.proofDigest&&ack.operation_hash===this.#operationHash&&ack.history_acknowledged===HISTORY&&ack.review_decision===(this.#native?'NATIVE_DISPOSABLE_ONLY':'SIMULATION_ONLY'),'LOCAL_OPERATOR_ACK_REJECTED');
  requireThat(Number.isFinite(ack.window_at)&&Number.isFinite(ack.window_until)&&ack.window_at<=w&&w<ack.window_until&&ack.window_until-ack.window_at<=1200000,'LOCAL_WINDOW_REJECTED');
  this.deadlineWall=Math.min(this.deadlineWall,ack.window_until);this.deadlineMono=Math.min(this.deadlineMono,m+ack.window_until-w);this.#arm();this.#checkpoint();
  this.#ready=structuredClone(ack);this.#journal.event('OPERATOR_DECLARED_READY',{ack:this.#ready,deadline_wall:this.deadlineWall});this.state='READY';
 });}
 async dispatchSynthetic(){return this.#work('READY',async()=>{
  this.#admit();
  this.#journal.write('intent.local-only.json',{scope:this.#scope,operation_hash:this.#operationHash,proof_digest:this.proofDigest,operator_ack:this.#ready,deadline_wall:this.deadlineWall,history:HISTORY});
  this.#journal.event('INTENT_DURABLE');this.#admit();
  const current=await this.#session.readProof();this.#admit();requireThat(digest(current)===this.proofDigest,'BACKEND_OR_CHANNEL_CHANGED');
  this.#journal.event('SAME_SESSION_RECHECKED',{semantic_checksum:digest(current)});this.#admit();
  this.#reserved=true;
  this.#journal.write('forward-reservation.local-only.json',{scope:this.#scope,forward_attempts:1,operation_hash:this.#operationHash});
  this.state='FORWARD_RESERVED';this.#journal.event('FORWARD_RESERVED',{forward_attempts:1,delivery_proven:false});this.#admit();
  // Native implementation is restricted to the owned disposable cluster. No operational adapter.
  const receipt=await this.#session.simulateSubmission();this.#checkpoint();
  requireThat(digest(receipt.backend)===this.proofDigest&&receipt.operation_hash===this.#operationHash&&receipt.command_tag==='COMMIT'&&receipt.postconditions===true,this.#native?'NATIVE_CONFIRMATION_REJECTED':'SIMULATED_CONFIRMATION_REJECTED');
  const final=this.#native?'NATIVE_SYNTHETIC_CONFIRMED':'SIMULATION_CONFIRMED';this.#journal.event(this.#native?'NATIVE_CONFIRMATION_OBSERVED':'SIMULATED_CONFIRMATION_OBSERVED');this.#journal.finish(final,null);
  this.state=final;this.#terminal=true;this.#cancel();this.#session.close();return this.state;
 });}
 get forwardAttempts(){return this.#reserved?1:0;}
 stopLocal(reason='LOCAL_ADAPTER_FAILURE'){this.#stop(reason);}
}
