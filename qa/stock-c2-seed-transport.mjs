// Native psql once. Password is consumed only by libpq's CONIN$/CONOUT$ prompt.
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openSync,writeFileSync,fsyncSync,closeSync,readFileSync,mkdirSync,lstatSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
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
export function nativeEnvironment(exe,ca,readonly,authority={}){
 const env={};for(const name of ['SystemRoot','WINDIR','TEMP','TMP','HOME','USERPROFILE','LANG'])if(process.env[name])env[name]=process.env[name];
 env.PATH=dirname(exe)+(process.platform==='win32'?';'+join(process.env.SystemRoot||'C:/Windows','System32'):':/usr/bin:/bin');
 Object.assign(env,{PGSSLMODE:'verify-full',PGSSLROOTCERT:ca,PGGSSENCMODE:'disable',PGCONNECT_TIMEOUT:'10',PGAPPNAME:'nexalvo-c2-'+(readonly?'readonly':'seed-once'),PGCLIENTENCODING:'UTF8',PGOPTIONS:readonly?'-c default_transaction_read_only=on -c statement_timeout=20000 -c idle_in_transaction_session_timeout=30000':'-c statement_timeout=20000',...authority});
 return env;
}
export async function nativeOnce({exe,args,env,directory,timeoutMs,onStart=()=>{}}){
 check(Number.isInteger(timeoutMs)&&timeoutMs>0,'C2_SEED_TIMEOUT_REQUIRED');
 durableJSON(join(directory,'native-intent.json'),{scope:'NATIVE_PSQL_ONE_ATTEMPT',exe,arguments:args,at:new Date().toISOString(),retry:false,environment_values_recorded:false});
 const out=join(directory,'stdout.private.log'),err=join(directory,'stderr.private.log');let outfd,errfd,child,timer,interrupted=false,timedOut=false;
 const stop=()=>{interrupted=true;try{child?.kill();}catch{/* server result remains unknown */}};
 try{
  outfd=openSync(out,'wx',0o600);errfd=openSync(err,'wx',0o600);
  return await new Promise(resolveResult=>{
   let settled=false;const settle=value=>{if(settled)return;settled=true;clearTimeout(timer);resolveResult({...value,interrupted,timedOut,attempts:1});};
   // No shell, input pipes, password variables, reconnect or retry.
   child=spawn(exe,args,{cwd:directory,env,shell:false,windowsHide:false,stdio:['inherit',outfd,errfd]});
   process.on('SIGINT',stop);process.on('SIGTERM',stop);
   child.once('error',()=>settle({exitCode:null,spawnError:true}));
   child.once('close',code=>settle({exitCode:code,spawnError:false}));
   timer=setTimeout(()=>{timedOut=true;stop();timer=setTimeout(()=>settle({exitCode:null,spawnError:false,terminationUnconfirmed:true}),5000);},timeoutMs);
   try{onStart(child);}catch{stop();settle({exitCode:null,spawnError:false,terminationUnconfirmed:true});}
  });
 }finally{
  clearTimeout(timer);process.off('SIGINT',stop);process.off('SIGTERM',stop);
  for(const fd of [outfd,errfd])if(fd!==undefined){try{fsyncSync(fd);}finally{closeSync(fd);}}
 }
}
export function nativeReceipt(result,text,receipt){
 check(result.exitCode===0&&!result.spawnError&&!result.timedOut&&!result.interrupted,'C2_SEED_NATIVE_RESULT_UNCONFIRMED_NO_REPLAY');
 check(text.split(/\r?\n/).filter(s=>s===receipt).length===1,'C2_SEED_RECEIPT_ABSENT_OR_AMBIGUOUS_NO_REPLAY');
}
export function prefixedJSON(text,prefix){const rows=text.split(/\r?\n/).filter(s=>s.startsWith(prefix));check(rows.length===1,'C2_SEED_PROOF_CARDINALITY');let value;try{value=JSON.parse(rows[0].slice(prefix.length));}catch{check(false,'C2_SEED_PROOF_INVALID_JSON');}return value;}
export function fileHash(path){return sha256(readFileSync(path));}
