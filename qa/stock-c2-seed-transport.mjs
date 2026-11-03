// Native psql once. Only native psql reads the password from the inherited console.
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openSync,writeFileSync,writeSync,fsyncSync,closeSync,readFileSync,mkdirSync,lstatSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function nativePasswordPrompt(tail){const line=tail.split(/\r?\n/).at(-1);return ['Password: ','Password for user postgres: '].includes(line)?line:null;}
export function check(ok,code){if(!ok){const e=new Error(code);e.code=code;throw e;}}
export function noLinks(path){for(let p=resolve(path);;){check(!lstatSync(p).isSymbolicLink(),'C2_SEED_LINK_FORBIDDEN');const next=dirname(p);if(next===p)return;p=next;}}
export function durableFile(path,bytes){const fd=openSync(path,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}}
export function durableJSON(path,value){durableFile(path,JSON.stringify(value,null,2)+'\n');}
export function privateRun(root,id){
 noLinks(root);const path=join(root,id);mkdirSync(path,{mode:0o700});
 if(process.platform==='win32')check(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./stock-c2-seed-private.ps1',import.meta.url)),'-Root',root,'-Path',path],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore'],timeout:15000}).trim()==='C2_SEED_PRIVATE_PASS','C2_SEED_PRIVATE_REQUIRED');
 else check((lstatSync(path).mode&0o077)===0,'C2_SEED_PRIVATE_REQUIRED');
 return path;
}
export function nativeEnvironment(exe,ca,readonly,authority={},consolePrompt=false){
 const env={};for(const name of ['SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE','LANG'])if(process.env[name])env[name]=process.env[name];
 env.PATH=dirname(exe)+(process.platform==='win32'?';'+join(process.env.SystemRoot||'C:/Windows','System32'):':/usr/bin:/bin');
 Object.assign(env,{PGSSLMODE:'verify-full',PGSSLROOTCERT:ca,PGGSSENCMODE:'disable',PGCONNECT_TIMEOUT:'10',PGAPPNAME:'nexalvo-c2-'+(readonly?'readonly':'seed-once'),PGCLIENTENCODING:'UTF8',PGOPTIONS:readonly?'-c default_transaction_read_only=on -c statement_timeout=20000 -c idle_in_transaction_session_timeout=30000':'-c statement_timeout=20000',...authority});
 // PostgreSQL 17 sprompt.c explicitly supports this standard-stream prompt path.
 // stdin remains the real console; psql's simple_prompt disables echo. No password pipe or variable.
 if(consolePrompt)Object.assign(env,{OSTYPE:'msys',LANG:'C',LC_ALL:'C'});
 return env;
}
export async function nativeOnce({exe,args,env,directory,timeoutMs,onStart=()=>{},consolePrompt=false}){
 check(Number.isInteger(timeoutMs)&&timeoutMs>0,'C2_SEED_TIMEOUT_REQUIRED');
 if(consolePrompt)check(process.platform==='win32'&&process.stdin.isTTY===true&&args.includes('-W')&&env.OSTYPE==='msys','C2_SEED_NATIVE_CONSOLE_PROMPT_REQUIRED');
 durableJSON(join(directory,'native-intent.json'),{scope:'NATIVE_PSQL_ONE_ATTEMPT',exe,arguments:args,at:new Date().toISOString(),retry:false,environment_values_recorded:false});
 const out=join(directory,'stdout.private.log'),err=join(directory,'stderr.private.log');let outfd,errfd,child,timer,interrupted=false,timedOut=false,promptObserved=false,stopReason=null,eventIndex=0,eventFailure=false,eventsSealed=false;
 const started=process.hrtime.bigint();
 const event=(name,fields={})=>{if(eventsSealed)return;try{durableJSON(join(directory,`native-event-${String(eventIndex++).padStart(3,'0')}.json`),{event:name,at:new Date().toISOString(),elapsed_ms:Number(process.hrtime.bigint()-started)/1e6,...fields});}catch{eventFailure=true;stopReason??='EVENT_JOURNAL_FAILURE';try{child?.kill();}catch{/* no retry */}}};
 const stop=reason=>{stopReason??=reason;interrupted||=reason==='SIGINT'||reason==='SIGTERM';event('STOP_REQUESTED',{reason});try{child?.kill();}catch{/* server result remains unknown */}};
 const sigint=()=>stop('SIGINT'),sigterm=()=>stop('SIGTERM');
 try{
  outfd=openSync(out,'wx',0o600);errfd=openSync(err,'wx',0o600);
  return await new Promise(resolveResult=>{
   let settled=false;const settle=value=>{if(settled)return;settled=true;clearTimeout(timer);event('NATIVE_RESULT_FINALIZED',{exit_code:value.exitCode,timed_out:timedOut,stop_reason:stopReason,termination_unconfirmed:value.terminationUnconfirmed===true});eventsSealed=true;resolveResult({...value,transcriptUnconfirmed:value.transcriptUnconfirmed===true||eventFailure,eventJournalFinalized:!eventFailure,interrupted,timedOut,stopReason,promptObserved,inputDeliveryProven:false,attempts:1});};
   event('SPAWN_REQUESTED',{stdin_policy:'inherit_fd_0',parent_stdin_is_tty:process.stdin.isTTY===true,timeout_ms:timeoutMs});
   if(eventFailure){settle({exitCode:null,spawnError:false});return;}
   // No shell, input pipes, password variables, reconnect or retry.
   child=spawn(exe,args,{cwd:directory,env,shell:false,windowsHide:false,stdio:['inherit',outfd,consolePrompt?'pipe':errfd]});
   child.once('spawn',()=>event('CHILD_SPAWNED',{native_pid:child.pid}));
   if(consolePrompt){let tail='',ready=false;child.stderr.on('data',bytes=>{
    try{
     writeSync(errfd,bytes);tail=(tail+bytes.toString('utf8')).slice(-512);
     const prompt=nativePasswordPrompt(tail);
     if(!ready&&prompt){
      ready=true;promptObserved=true;durableJSON(join(directory,'native-password-prompt-ready.json'),{scope:'NATIVE_PASSWORD_PROMPT_STATUS_ONLY',native_pid:child.pid,observed_at:new Date().toISOString(),native_prompt:prompt.trim(),native_prompt_observed:true,stdin_policy:'inherit_fd_0',parent_stdin_is_tty:process.stdin.isTTY===true,input_delivery_proven:false,window_focus_proven:false,password_captured:false,seed_authority_granted:false});
      event('NATIVE_PASSWORD_PROMPT_OBSERVED',{native_pid:child.pid,input_delivery_proven:false});
      process.stderr.write(prompt);
     }
    }catch{stop('TRANSCRIPT_FAILURE');settle({exitCode:null,spawnError:false,transcriptUnconfirmed:true,terminationUnconfirmed:true});}
   });}
   process.on('SIGINT',sigint);process.on('SIGTERM',sigterm);
   child.once('error',()=>{event('SPAWN_ERROR');settle({exitCode:null,spawnError:true});});
   child.once('exit',(code,signal)=>event('CHILD_EXIT',{exit_code:code,signal}));
   child.once('close',(code,signal)=>{event('CHILD_CLOSED',{exit_code:code,signal});settle({exitCode:code,spawnError:false});});
   timer=setTimeout(()=>{timedOut=true;event('TIMEOUT_FIRED',{timeout_ms:timeoutMs});stop('TIMEOUT');timer=setTimeout(()=>settle({exitCode:null,spawnError:false,terminationUnconfirmed:true}),5000);},timeoutMs);
   try{onStart(child);}catch{stop('LOCAL_CALLBACK_FAILURE');settle({exitCode:null,spawnError:false,terminationUnconfirmed:true});}
  });
 }finally{
  clearTimeout(timer);process.off('SIGINT',sigint);process.off('SIGTERM',sigterm);
  for(const fd of [outfd,errfd])if(fd!==undefined){try{fsyncSync(fd);}finally{closeSync(fd);}}
 }
}
export function nativeReceipt(result,text,receipt){
 check(result.exitCode===0&&!result.spawnError&&!result.timedOut&&!result.interrupted&&!result.transcriptUnconfirmed&&!result.terminationUnconfirmed&&result.eventJournalFinalized!==false,'C2_SEED_NATIVE_RESULT_UNCONFIRMED_NO_REPLAY');
 check(text.split(/\r?\n/).filter(s=>s===receipt).length===1,'C2_SEED_RECEIPT_ABSENT_OR_AMBIGUOUS_NO_REPLAY');
}
export function prefixedJSON(text,prefix){const rows=text.split(/\r?\n/).filter(s=>s.startsWith(prefix));check(rows.length===1,'C2_SEED_PROOF_CARDINALITY');let value;try{value=JSON.parse(rows[0].slice(prefix.length));}catch{check(false,'C2_SEED_PROOF_INVALID_JSON');}return value;}
export function fileHash(path){return sha256(readFileSync(path));}
