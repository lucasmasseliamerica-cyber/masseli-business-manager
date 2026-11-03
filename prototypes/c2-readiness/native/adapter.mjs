// Native, local disposable cluster ONLY. No host/SQL/connection-string argument exists.
import {spawn,execFile,execFileSync} from 'node:child_process';import {promisify} from 'node:util';
import {readFileSync,existsSync,openSync,writeSync,fsyncSync,closeSync,readdirSync} from 'node:fs';
import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {NativeDisposableBoundary,digest} from '../protocol.mjs';
import {check,owned,fileHash,durable,durableJSON,json,admission,environment,waitJSON,wait,mono,identityExpression} from './common.mjs';
const exec=promisify(execFile);
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});return{promise,resolve,reject};}
export class NativeLocalSession extends NativeDisposableBoundary {
 #cluster;#dir;#mode;#fault;#child;#manifest;#read1=deferred();#read2=deferred();#done=deferred();#closed;#out;#err;#receipt;#boundary=false;#commit=false;#stop=false;
 probes=0;submissions=0;nativePid=null;promptObserved=false;proofs=[];exitCode=null;helperPids=[];
 constructor({clusterRoot,directory,operatorMode='scripted-local',windowAt=Date.now(),windowUntil=Date.now()+120000,holdPasswordPrompt=false,fault=null}){
  super();this.#cluster=owned(clusterRoot);this.#dir=directory;this.#mode=operatorMode;this.#fault=fault;
  check(['scripted-local','manual'].includes(operatorMode),'NATIVE_OPERATOR_MODE_REQUIRED');
  check(operatorMode!=='manual'||process.stdin.isTTY===true,'NATIVE_MANUAL_CONSOLE_REQUIRED');
  check(this.#cluster.authentication!=='scram-sha-256'||operatorMode==='manual','NATIVE_SCRAM_MANUAL_ONLY');
  check(Number.isFinite(windowAt)&&Number.isFinite(windowUntil)&&windowAt<=Date.now()&&windowUntil>Date.now()&&windowUntil-windowAt<=1200000,'NATIVE_LOCAL_WINDOW_REQUIRED');
  this.windowAt=windowAt;this.windowUntil=windowUntil;this.holdPasswordPrompt=holdPasswordPrompt;
  this.operationHash=fileHash(fileURLToPath(new URL('./synthetic-dispatch.psql.in',import.meta.url)));
  check(fileHash(this.#cluster.psql)===this.#cluster.psql_sha256,'NATIVE_CLIENT_HASH_CHANGED');
 }
 bindTiming(deadlineWall,deadlineMono){
  check(!this.#manifest,'NATIVE_TIMING_ALREADY_BOUND');
  const sourceHashes=Object.fromEntries(['identity.sql','bootstrap.psql.in','synthetic-dispatch.psql.in','readiness-helper.mjs','common.mjs'].map(n=>[n,fileHash(fileURLToPath(new URL('./'+n,import.meta.url)))]));
  this.#manifest={scope:'NATIVE_DISPOSABLE_ONLY',clusterRoot:this.#cluster.root,authentication:this.#cluster.authentication||'cert',operationHash:this.operationHash,sourceHashes,windowAt:this.windowAt,windowUntil:this.windowUntil,deadlineWall,deadlineMono,operatorMode:this.#mode};
  durableJSON(join(this.#dir,'native-manifest.json'),this.#manifest);
 }
 #start(){
  const c=this.#cluster,d=this.#dir;check(!this.#child&&!this.#stop,'NATIVE_SINGLE_PROCESS_REQUIRED');
  if(c.authentication==='scram-sha-256'&&process.platform==='win32'&&!existsSync(join(d,'console-mode-before.json')))execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./console-mode.ps1',import.meta.url)),'-Action','Save','-Path',join(d,'console-mode-before.json')],{stdio:['inherit','ignore','ignore'],windowsHide:true,timeout:10000});
  const helper=fileURLToPath(new URL('./readiness-helper.mjs',import.meta.url));
  const shellQuote=s=>{check(!/["\r\n%`$!]/.test(s),'NATIVE_LOCAL_PATH_REJECTED');return '"'+s+'"';};
  // psql's \! invokes its system shell; arguments are fixed local executable/file paths.
  const command=stage=>[process.execPath,helper,d,stage].map(shellQuote).join(' ');
  const identity=identityExpression(readFileSync(new URL('./identity.sql',import.meta.url),'utf8'),c.authentication||'cert');
  let bootstrap=readFileSync(new URL('./bootstrap.psql.in',import.meta.url),'utf8').replaceAll('@@IDENTITY@@',identity).replaceAll('@@HELPER_INTENT@@',command('intent')).replaceAll('@@HELPER_DISPATCH@@',command('dispatch'));
  durable(join(d,'bootstrap.local.psql'),bootstrap);
  const env=environment(c);if(this.#fault==='wrong_ca')env.PGSSLROOTCERT=join(c.root,'bad-ca.crt');if(this.#fault==='wrong_client'){env.PGSSLCERT=join(c.root,'bad-client.crt');env.PGSSLKEY=join(c.root,'bad-client.key');}
  const args=['-X',this.holdPasswordPrompt||c.authentication==='scram-sha-256'?'-W':'-w','-A','-t','-h','127.0.0.1','-p',String(c.port),'-U',c.role,'-d','postgres','-v','ON_ERROR_STOP=1','-f',join(d,'bootstrap.local.psql')];
  durableJSON(join(d,'native-process-intent.json'),{scope:'NATIVE_DISPOSABLE_ONLY',exe:c.psql,args,stdin:this.holdPasswordPrompt?'empty_open_pipe_for_local_prompt_timeout':this.#mode==='manual'?'inherited_console':'ignore',password_input_captured:false});
  this.#out=openSync(join(d,'stdout.private.log'),'wx',0o600);this.#err=openSync(join(d,'stderr.private.log'),'wx',0o600);
  this.#child=spawn(c.psql,args,{env,cwd:d,shell:false,windowsHide:this.#mode!=='manual',detached:process.platform!=='win32',stdio:[this.holdPasswordPrompt?'pipe':this.#mode==='manual'?'inherit':'ignore','pipe','pipe']});this.nativePid=this.#child.pid;
  durableJSON(join(d,'native-process-started.json'),{pid:this.nativePid,at:new Date().toISOString()});
  let tail='';this.#child.stdout.on('data',bytes=>{try{writeSync(this.#out,bytes);if(this.#mode==='manual')process.stdout.write(bytes);tail+=bytes.toString('utf8');for(;;){const at=tail.indexOf('\n');if(at<0)break;const line=tail.slice(0,at).replace(/\r$/,'');tail=tail.slice(at+1);this.#line(line);}}catch{this.#fail('NATIVE_OUTPUT_INTEGRITY_FAILURE');}});
  let errTail='';this.#child.stderr.on('data',bytes=>{try{writeSync(this.#err,bytes);if(this.#mode==='manual')process.stderr.write(bytes);errTail=(errTail+bytes.toString('utf8')).slice(-128);if(errTail.endsWith('Password: ')){this.promptObserved=true;durableJSON(join(d,'native-password-prompt-observed.json'),{at:new Date().toISOString(),pid:this.nativePid,password_input_captured:false});}}catch{this.#fail('NATIVE_OUTPUT_INTEGRITY_FAILURE');}});
  this.#child.once('error',()=>this.#fail('NATIVE_PROCESS_ERROR'));
  // close can wait for an orphan helper's inherited stdout handle; exit must unblock gates.
  this.#child.once('exit',(code,signal)=>{if(code!==0||signal)this.#fail('NATIVE_PROCESS_EXIT_FAILURE');});
  this.#child.once('close',code=>{
   this.exitCode=code;for(const fd of [this.#out,this.#err]){try{fsyncSync(fd);closeSync(fd);}catch{/* caller remains blocked */}}this.#out=this.#err=undefined;
   if(code===0&&this.#receipt&&this.#commit)this.#done.resolve(this.#receipt);else this.#fail('NATIVE_EXIT_WITHOUT_CONFIRMATION');
  });
 }
 #line(line){
  for(const [prefix,stage]of [['NATIVE_READ1|',1],['NATIVE_READ2|',2]])if(line.startsWith(prefix)){
   const proof=JSON.parse(line.slice(prefix.length));check(this.validateReadProof(proof),'NATIVE_SERVER_IDENTITY_REJECTED');this.proofs.push(proof);
   durableJSON(join(this.#dir,'validated-read'+stage+'.json'),{proof,proof_digest:digest(proof),operation_hash:this.operationHash,source:'SQL_FROM_NATIVE_TLS_CONNECTION'});
   (stage===1?this.#read1:this.#read2).resolve(proof);return;
  }
  if(line==='NATIVE_MUTANT_BOUNDARY'){this.#boundary=true;durableJSON(join(this.#dir,'native-mutant-boundary.json'),{at:new Date().toISOString(),delivery_proven:false});}
  if(this.#boundary&&line==='COMMIT')this.#commit=true;
  if(line.startsWith('NATIVE_COMMIT_RECEIPT|')){check(this.#boundary&&this.#commit,'NATIVE_COMMIT_TAG_REQUIRED');const r=JSON.parse(line.slice('NATIVE_COMMIT_RECEIPT|'.length));check(this.validateReadProof(r.backend)&&r.operation_hash===this.operationHash&&r.postconditions===true,'NATIVE_RECEIPT_REJECTED');this.#receipt={...r,command_tag:'COMMIT'};}
 }
 validateReadProof(p){const c=this.#cluster,auth=c.authentication==='scram-sha-256'?p?.scram_verifier===true&&p.client_dn===null:/^\/?CN=postgres$/.test(p?.client_dn);return auth&&p?.scope==='NATIVE_DISPOSABLE_ONLY'&&p.cluster_id===c.system_identifier&&Number.isInteger(p.backend_pid)&&p.backend_pid>0&&Number.isFinite(Date.parse(p.backend_start))&&p.database==='postgres'&&p.sql_role===c.role&&p.session_role===c.role&&['127.0.0.1','127.0.0.1/32'].includes(p.server_address)&&p.server_port===c.port&&p.read_only==='on'&&p.ssl===true&&/^TLSv1\.[23]$/.test(p.tls_version);}
 async readProof(){
  this.probes++;if(this.probes===1){this.#start();return this.#read1.promise;}
  check(this.probes===2,'NATIVE_NO_RECONNECT_OR_REPLAY');admission(this.#manifest);
  check(!this.#stop&&this.#child.exitCode===null&&this.#child.signalCode===null,'NATIVE_PROCESS_NOT_ACTIVE');
  durableJSON(join(this.#dir,'intent-release.local.json'),{intent_sha256:fileHash(join(this.#dir,'intent.local-only.json'))});return this.#read2.promise;
 }
 async operatorAcknowledgement(ready=true){
  await this.#read1.promise;
  if(this.#mode==='scripted-local')durableJSON(join(this.#dir,'operator-request.local.json'),{scope:'NATIVE_DISPOSABLE_ONLY',ready});
  return Promise.race([waitJSON(join(this.#dir,'operator-ack.local.json'),this.#manifest.deadlineWall,()=>this.#stop),this.#done.promise]);
 }
 async simulateSubmission(){
  this.submissions++;check(this.submissions===1,'NATIVE_NO_REPLAY');admission(this.#manifest);owned(this.#cluster.root);
  durableJSON(join(this.#dir,'dispatch-release.local.json'),{reservation_sha256:fileHash(join(this.#dir,'forward-reservation.local-only.json'))});return this.#done.promise;
 }
 #fail(code){const e=Object.assign(new Error(code),{code});this.#read1.reject(e);this.#read2.reject(e);this.#done.reject(e);}
 close(){
  if(this.#closed)return this.#closed;this.#stop=true;this.#fail('NATIVE_LOCAL_STOP');
  this.#closed=(async()=>{
   this.helperPids=readdirSync(this.#dir).filter(n=>/^helper-.*\.json$/.test(n)).map(n=>json(join(this.#dir,n)).pid);
   const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
   if(this.#child?.exitCode===null){
    try{if(process.platform==='win32')await exec('taskkill.exe',['/PID',String(this.nativePid),'/T','/F'],{windowsHide:true,timeout:10000});else process.kill(-this.nativePid,'SIGKILL');}catch{/* verify below, never retry SQL */}
    this.#child.stdin?.destroy();
   }
   // A psql killed externally may leave its local helper alive: close that observed child too.
   for(const pid of this.helperPids)if(alive(pid)&&pid!==process.pid&&pid!==this.#cluster.postmaster_pid){try{if(process.platform==='win32')await exec('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,timeout:10000});else process.kill(pid,'SIGKILL');}catch{/* verification below */}}
   for(let i=0;i<100&&this.#child?.exitCode===null;i++)await wait(20);
   this.helperPids=readdirSync(this.#dir).filter(n=>/^helper-.*\.json$/.test(n)).map(n=>json(join(this.#dir,n)).pid);
   const shellPids=[...new Set(readdirSync(this.#dir).filter(n=>/^helper-.*\.json$/.test(n)).map(n=>json(join(this.#dir,n)).parent_pid))].filter(pid=>pid!==this.nativePid&&pid!==process.pid);
   for(let i=0;i<50&&[...this.helperPids,...shellPids].some(alive);i++)await wait(20);
   const stopped=(!this.nativePid||!alive(this.nativePid))&&[...this.helperPids,...shellPids].every(p=>!alive(p));
   if(this.#cluster.authentication==='scram-sha-256'&&process.platform==='win32'&&existsSync(join(this.#dir,'console-mode-before.json')))execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./console-mode.ps1',import.meta.url)),'-Action','Restore','-Path',join(this.#dir,'console-mode-before.json')],{stdio:['inherit','ignore','ignore'],windowsHide:true,timeout:10000});
   durableJSON(join(this.#dir,'native-termination.json'),{psql_pid:this.nativePid,helper_pids:this.helperPids,shell_pids:shellPids,all_observed_children_ended:stopped});check(stopped,'NATIVE_CHILD_TERMINATION_UNCONFIRMED');return stopped;
  })();this.#closed.catch(()=>{});return this.#closed;
 }
 async waitClosed(){return this.close();}
}
