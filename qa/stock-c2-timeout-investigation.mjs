// LOCAL laboratory only. No TEST host, approved SQL, authorization or real marker.
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,existsSync,readdirSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {check,privateRun,durableFile,durableJSON,nativeEnvironment,nativeOnce,nativeReceipt} from './stock-c2-seed-transport.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function timeoutInvestigation({root,psql,cert,port}){
 check(process.platform==='win32'&&process.stdin.isTTY===true,'C2_LAB_VISIBLE_WINDOWS_CONSOLE_REQUIRED');
 check(existsSync(join(root,'LOCAL_ONLY.crt'))&&cert===join(root,'LOCAL_ONLY.crt'),'C2_LAB_LOCAL_CA_REQUIRED');
 const cases=[],base=['-X','-q','-A','-t','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
 const events=d=>readdirSync(d).filter(n=>/^native-event-\d+\.json$/.test(n)).sort().map(n=>JSON.parse(readFileSync(join(d,n),'utf8')));
 const save=(directory,proof)=>{proof.artifacts_retained=true;proof.test_connected=false;proof.retry=false;cases.push(proof);durableJSON(join(directory,'result.sanitized.json'),proof);};
 const metadata=(directory,child,queue=false)=>{
  const fds=['out','err'].map(n=>openSync(join(directory,'console-helper.'+n+'.private.log'),'wx',0o600));
  try{execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./stock-c2-console-lab.ps1',import.meta.url)),'-Directory',directory,'-NodePid',String(process.pid),'-ChildPid',String(child.pid),...(queue?['-QueueEnter']:[])],{windowsHide:true,timeout:10000,stdio:['inherit',...fds]});}
  finally{for(const fd of fds){fsyncSync(fd);closeSync(fd);}}
  return JSON.parse(readFileSync(join(directory,'console-route-observation.json'),'utf8'));
 };
 const promptAction=(directory,action)=>{
  let stop=false,error,task;return {
   onStart:child=>{task=(async()=>{while(!stop&&!existsSync(join(directory,'native-password-prompt-ready.json')))await delay(25);if(!stop)await action(child);})().catch(e=>{error=e;child.kill();});},
   done:async()=>{stop=true;await task;if(error)throw error;}
  };
 };
 console.error('LOCAL LAB ONLY. Do not type passwords or commands into this laboratory console.');
 for(const name of ['operator_delay','exit_before_input','input_route_control']){
  const directory=privateRun(root,'case-'+name),script=join(directory,'synthetic.sql');
  durableFile(script,"BEGIN READ ONLY;SELECT 'C2_LOCAL_ROUTE_RECEIPT';COMMIT;\n");
  let route;const action=promptAction(directory,async child=>{
   route=metadata(directory,child,name==='input_route_control');
   if(name==='exit_before_input'){await delay(150);child.kill();}
  });
  const r=await nativeOnce({exe:psql,args:[...base,'-W','-f',script],env:nativeEnvironment(psql,cert,true,{},true),directory,timeoutMs:6000,consolePrompt:true,onStart:action.onStart});await action.done();
  check(r.promptObserved&&route.same_console&&!route.echo_enabled,'C2_LAB_NATIVE_PROMPT_CONSOLE_REQUIRED');
  const output=readFileSync(join(directory,'stdout.private.log'),'utf8');
  if(name==='operator_delay')check(r.timedOut&&output.length===0,'C2_LAB_OPERATOR_DELAY_MUST_TIMEOUT');
  if(name==='exit_before_input')check(!r.timedOut&&output.length===0&&!events(directory).some(e=>e.event==='TIMEOUT_FIRED'),'C2_LAB_EARLY_EXIT_MUST_PRECEDE_TIMER');
  if(name==='input_route_control'){check(route.public_enter_queued,'C2_LAB_PUBLIC_ENTER_REQUIRED');nativeReceipt(r,output,'C2_LOCAL_ROUTE_RECEIPT');}
  save(directory,{case:name,prompt_observed:r.promptObserved,timed_out:r.timedOut,stop_reason:r.stopReason,exit_code:r.exitCode,stdout_bytes:Buffer.byteLength(output),same_console:route.same_console,echo_disabled:!route.echo_enabled,public_enter_queued:route.public_enter_queued,password_supplied:false,input_read_or_logged:false,receipt_accepted:name==='input_route_control',events:events(directory).map(e=>e.event)});
 }
 {
  // Intentional LAB-ONLY bad adapter. Do not add a piped-input option to nativeOnce.
  const directory=privateRun(root,'case-input_not_delivered'),script=join(directory,'synthetic.sql');durableFile(script,"SELECT 'C2_LOCAL_MISWIRE_MUST_NOT_REACH_SQL';\n");
  durableJSON(join(directory,'lab-adapter.json'),{scope:'LOCAL_INTENTIONAL_MISWIRE',stdin_policy:'pipe_kept_open_without_bytes',production_transport_used:false});
  const outfd=openSync(join(directory,'stdout.private.log'),'wx',0o600),errfd=openSync(join(directory,'stderr.private.log'),'wx',0o600);
  let prompt=false,timed=false;const start=Date.now();
  try{
   await new Promise((resolve,reject)=>{
    const c=spawn(psql,[...base,'-W','-f',script],{env:nativeEnvironment(psql,cert,true,{},true),shell:false,windowsHide:true,stdio:['pipe',outfd,'pipe']});
    const timer=setTimeout(()=>{timed=true;c.kill();},1500);let tail='';
    c.stderr.on('data',bytes=>{tail+=bytes.toString('utf8');prompt||=tail.endsWith('Password: ');});
    // No input writes and no stdin.end(): delivery is intentionally impossible.
    c.once('error',e=>{clearTimeout(timer);reject(e);});c.once('close',()=>{clearTimeout(timer);c.stdin.destroy();durableFile(join(directory,'stderr-observation.json'),JSON.stringify({prompt_observed:prompt,raw_input_captured:false}));resolve();});
   });
  }finally{for(const fd of [outfd,errfd]){fsyncSync(fd);closeSync(fd);}}
  check(prompt&&timed&&readFileSync(join(directory,'stdout.private.log')).length===0,'C2_LAB_MISWIRE_MUST_TIMEOUT');
  save(directory,{case:'input_not_delivered',intentional_lab_adapter:true,prompt_observed:prompt,timed_out:timed,elapsed_ms:Date.now()-start,stdout_bytes:0,password_supplied:false,input_read_or_logged:false,production_transport_used:false});
 }
 {
  const directory=privateRun(root,'case-authenticated_slow'),script=join(directory,'synthetic.sql');durableFile(script,"BEGIN READ ONLY;SELECT pg_sleep(10);SELECT 'C2_LOCAL_SLOW_RECEIPT';COMMIT;\n");
  const env=nativeEnvironment(psql,cert,true,{PGAPPNAME:'c2-local-authenticated-slow'});let observed=false,stop=false,observer;
  const r=await nativeOnce({exe:psql,args:[...base,'-w','-f',script],env,directory,timeoutMs:2500,onStart:()=>{
   observer=(async()=>{while(!stop&&!observed){await delay(100);const text=execFileSync(psql,[...base,'-w','-c',"SELECT count(*) FROM pg_stat_activity WHERE application_name='c2-local-authenticated-slow' AND pid<>pg_backend_pid() AND state='active' AND query LIKE '%pg_sleep(10)%'"],{env:nativeEnvironment(psql,cert,true),encoding:'utf8',windowsHide:true,timeout:1000,stdio:['ignore','pipe','ignore']});observed=text.trim()==='1';}})();
  }});stop=true;await observer;
  const bytes=readFileSync(join(directory,'stdout.private.log')).length;
  check(observed&&r.timedOut&&bytes===0,'C2_LAB_ACTIVE_SQL_WITH_EMPTY_STDOUT_REQUIRED');
  save(directory,{case:'authenticated_slow',authenticated_backend_observed:true,active_pg_sleep_observed:true,timed_out:r.timedOut,stdout_bytes:bytes,input_read_or_logged:false,password_supplied:false,authentication_method:'LOCAL_TRUST',tls:'verify-full',events:events(directory).map(e=>e.event)});
 }
 return cases;
}
