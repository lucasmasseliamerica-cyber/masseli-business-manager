// Explicit local disposable PG17 harness. Never connects TEST, loads approved seed SQL,
// changes its gates, creates a real fixture or uses the permanent seed marker.
import {execFileSync} from 'node:child_process';
import {readFileSync,appendFileSync,openSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {check,privateRun,durableFile,durableJSON,fileHash,nativeEnvironment,nativeOnce,nativeReceipt} from './stock-c2-seed-transport.mjs';
export async function nativeHarness({pgBin,openssl,artifactRoot,promptProbe=false}){
 const root=privateRun(artifactRoot,'native-harness-'+randomUUID()),ext=process.platform==='win32'?'.exe':'',psql=join(pgBin,'psql'+ext),ctl=join(pgBin,'pg_ctl'+ext),init=join(pgBin,'initdb'+ext);
 const version=execFileSync(psql,['--version'],{encoding:'utf8',windowsHide:true}).trim();check(/^psql \(PostgreSQL\) 17\./.test(version),'C2_HARNESS_PG17_REQUIRED');
 const port=await new Promise((res,rej)=>{const s=createServer();s.once('error',rej);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p));});});
 const cert=join(root,'LOCAL_ONLY.crt'),key=join(root,'LOCAL_ONLY.key'),data=join(root,'data');let started=false;
 const summary={scope:'LOCAL_DISPOSABLE_PG17_NATIVE_PSQL',status:'BLOCKED',root,version,psql_sha256:fileHash(psql),host:'127.0.0.1',port,test_connected:false,approved_seed_executed:false,permanent_marker_created:false,files_removed:0,cases:[]};let command=0;
 // pg_ctl's Windows server child can retain pipe handles after pg_ctl exits.
 // File descriptors avoid interpreting that pipe lifetime as a start timeout.
 const run=(exe,args)=>{const name='setup-'+(++command),outPath=join(root,name+'.stdout.private.log'),errPath=join(root,name+'.stderr.private.log'),outfd=openSync(outPath,'wx',0o600),errfd=openSync(errPath,'wx',0o600);try{execFileSync(exe,args,{windowsHide:true,timeout:30000,stdio:['ignore',outfd,errfd]});return readFileSync(outPath,'utf8');}catch(e){summary.failed_setup_command=command;throw e;}finally{for(const fd of [outfd,errfd]){fsyncSync(fd);closeSync(fd);}}};
 try{
  run(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-addext','basicConstraints=critical,CA:TRUE','-days','1']);
  run(init,['-D',data,'-U','postgres','-A','trust','--encoding=UTF8','--no-locale','--no-clean']);
  const quote=s=>s.replaceAll('\\','/').replaceAll("'","''");
  appendFileSync(join(data,'postgresql.conf'),`\nlisten_addresses='127.0.0.1'\nport=${port}\nssl=on\nssl_cert_file='${quote(cert)}'\nssl_key_file='${quote(key)}'\n`);
  run(ctl,['-D',data,'-l',join(root,'postgres.private.log'),'-w','-t','20','start']);started=true;
  for(const [name,sql,expected,receipt,timeoutMs]of (promptProbe?[]:[
   ['success',"BEGIN READ ONLY;SELECT 'C2_NATIVE_SYNTHETIC_RECEIPT';COMMIT;",0,true,10000],
   ['sql_error',"BEGIN READ ONLY;SELECT 1/0;SELECT 'C2_NATIVE_SYNTHETIC_RECEIPT';COMMIT;",3,false,10000],
   ['disconnect',"SELECT pg_terminate_backend(pg_backend_pid());SELECT 'C2_NATIVE_SYNTHETIC_RECEIPT';",2,false,10000],
   ['missing_receipt',"BEGIN READ ONLY;SELECT 1;COMMIT;",0,false,10000],
   ['timeout',"SELECT pg_sleep(10);SELECT 'C2_NATIVE_SYNTHETIC_RECEIPT';",null,false,250]
  ])){
   const directory=privateRun(root,'case-'+name),script=join(directory,'synthetic.sql');durableFile(script,sql+'\n');
   const env=nativeEnvironment(psql,cert,true),args=['-X','-w','-A','-t','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f',script];
   const r=await nativeOnce({exe:psql,args,env,directory,timeoutMs}),text=readFileSync(join(directory,'stdout.private.log'),'utf8');let accepted=false;
   try{nativeReceipt(r,text,'C2_NATIVE_SYNTHETIC_RECEIPT');accepted=true;}catch{/* expected unknown/failure, never replay */}
   check(accepted===receipt,'C2_HARNESS_RECEIPT_MISMATCH');if(name==='timeout')check(r.timedOut,'C2_HARNESS_TIMEOUT_REQUIRED');else check(r.exitCode===expected,'C2_HARNESS_NATIVE_EXIT_MISMATCH');
   // Invalid CA and hostname are exercised below with the real native TLS stack.
   const proof={case:name,exit_code:r.exitCode,timed_out:r.timedOut,attempts:r.attempts,receipt_accepted:accepted,stdout_sha256:fileHash(join(directory,'stdout.private.log')),stderr_sha256:fileHash(join(directory,'stderr.private.log')),artifacts_retained:true,retry:false};
   summary.cases.push(proof);durableJSON(join(directory,'result.sanitized.json'),proof);
  }
  for(const fault of (promptProbe?[]:['wrong_ca','wrong_hostname'])){
   const directory=privateRun(root,'case-'+fault),script=join(directory,'synthetic.sql');durableFile(script,"SELECT 'C2_NATIVE_SYNTHETIC_RECEIPT';\n");
   const env=nativeEnvironment(psql,fault==='wrong_ca'?join(root,'ABSENT_CA.crt'):cert,true);
   // hostaddr only in the local negative harness: connect loopback while validating wrong hostname.
   if(fault==='wrong_hostname')env.PGHOSTADDR='127.0.0.1';
   const args=['-X','-w','-A','-t','-h',fault==='wrong_hostname'?'wrong.invalid':'127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f',script];
   const r=await nativeOnce({exe:psql,args,env,directory,timeoutMs:10000});check(r.exitCode!==0,'C2_HARNESS_TLS_MUST_REJECT');
   summary.cases.push({case:fault,exit_code:r.exitCode,tls_rejected:true,attempts:r.attempts,artifacts_retained:true,retry:false});
  }
  if(promptProbe){
   const directory=privateRun(root,'case-native-password-prompt'),script=join(directory,'synthetic.sql');durableFile(script,"SELECT 'C2_LOCAL_PROMPT_PROBE_MUST_NOT_REACH_SQL';\n");
   const env=nativeEnvironment(psql,cert,true,{},true),args=['-X','-W','-A','-t','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f',script];
   console.error('LOCAL LAB ONLY: do not type a password. Native prompt is observed, then test ends.');
   const r=await nativeOnce({exe:psql,args,env,directory,timeoutMs:4000,consolePrompt:true}),status=JSON.parse(readFileSync(join(directory,'native-password-prompt-ready.json'),'utf8'));
   check(r.promptObserved&&r.timedOut&&Date.now()-Date.parse(status.observed_at)>=2000&&readFileSync(join(directory,'stdout.private.log')).length===0,'C2_HARNESS_PASSWORD_PROMPT_MUST_WAIT');
   summary.cases.push({case:'native_password_prompt_waits',prompt_observed:true,waited_without_input_ms:Date.now()-Date.parse(status.observed_at),sql_output_bytes:0,deliberately_terminated_after_observation:true,password_supplied:false,test_connected:false,artifacts_retained:true});
  }
  summary.status='PASS';return summary;
 }finally{
  if(started||existsSync(join(data,'postmaster.pid'))){try{run(ctl,['-D',data,'-m','fast','-w','-t','20','stop']);summary.local_server_stopped=true;}catch{summary.status='BLOCKED';summary.local_server_stop_unconfirmed=true;}}
  durableJSON(join(root,'native-harness-summary.json'),summary);
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const p={};for(let i=2;i<process.argv.length;i+=2)p[process.argv[i]]=process.argv[i+1];const r=await nativeHarness({pgBin:resolve(p['--pg-bin']),openssl:resolve(p['--openssl']),artifactRoot:resolve(p['--artifacts']),promptProbe:p['--probe-native-prompt']==='true'});console.log(JSON.stringify(r,null,2));process.exitCode=r.status==='PASS'?0:2;}catch{console.log(JSON.stringify({scope:'LOCAL_DISPOSABLE_PG17_NATIVE_PSQL',status:'BLOCKED',code:'C2_NATIVE_HARNESS_BLOCKED_ARTIFACTS_RETAINED'}));process.exitCode=2;}}
