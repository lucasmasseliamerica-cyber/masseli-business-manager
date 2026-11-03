// Reproducible real local demonstration. No remote host, SQL or password argument.
import {resolve,join} from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {localCluster} from './cluster.mjs';import {NativeLocalSession} from './adapter.mjs';import {existsSync,readFileSync} from 'node:fs';
import {LocalJournal,ReadinessPrototype} from '../protocol.mjs';
import {privateRun} from '../../../qa/stock-c2-seed-transport.mjs';import {durableJSON,check,json} from './common.mjs';
async function scramManualCases(cluster,selection='all'){
 check(['all','readiness-delay'].includes(selection),'SCRAM_CASE_SELECTION_REJECTED');
 const cases=[];
 for(const name of selection==='all'?['positive','password-delay','readiness-delay']:['readiness-delay']){
  const delay=name!=='positive',directory=privateRun(cluster.root,'c2-readiness-local-scram-'+name),journal=new LocalJournal(directory,{scope:'NATIVE_DISPOSABLE_ONLY'});
  console.error('\n=== SCRAM LOCAL '+name.toUpperCase()+' ===');
  console.error(name==='positive'?'Digite a senha do laboratorio no Password:. Depois da prova SQL, digite READY.':name==='password-delay'?'NAO DIGITE NADA neste Password:. A janela local de 60s deve expirar sem reserva.':'Digite a senha no Password:. Depois da prova SQL, NAO DIGITE READY; aguarde a janela local de 60s expirar.');
  if(selection==='readiness-delay'&&process.platform==='win32')execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./console-mode.ps1',import.meta.url)),'-Action','ConfirmPasswordPhase','-Path',directory],{stdio:['ignore','ignore','ignore'],windowsHide:true});
  const session=new NativeLocalSession({clusterRoot:cluster.root,directory,operatorMode:'manual',windowUntil:Date.now()+(delay?60000:120000)}),model=new ReadinessPrototype({journal,session});let error=null;
  try{await model.authenticate();if(name==='password-delay')throw new Error('SCRAM_PASSWORD_DELAY_RECEIVED_INPUT');const ack=await session.operatorAcknowledgement();if(name==='readiness-delay')throw new Error('SCRAM_READINESS_DELAY_RECEIVED_READY');await model.ready(ack);await model.dispatchSynthetic();}catch(e){error=e.code||e.message;}finally{model.stopLocal(error||'SCRAM_LOCAL_CASE_FINISHED');await session.waitClosed();}
  const first=session.proofs[0],authLog=first?readFileSync(join(cluster.root,'postgres.private.log'),'utf8').split(/\r?\n/).some(line=>line.includes('['+first.backend_pid+']')&&line.includes('method=scram-sha-256')):false;
  const result={case:name,scope:'NATIVE_DISPOSABLE_ONLY',state:model.state,reason:model.reason,error,window_ms:delay?60000:120000,absolute_cap_ms:120000,margin_ms:30000,password_prompt_observed:session.promptObserved,authenticated_read_proofs:session.proofs.length,scram_verifier_boolean:first?.scram_verifier===true,server_log_scram_verified:authLog,tls:first?.tls_version||null,backend_pid:first?.backend_pid||null,same_backend:session.proofs.length===2&&session.proofs[0].backend_pid===session.proofs[1].backend_pid&&session.proofs[0].backend_start===session.proofs[1].backend_start,human_ready_observed:existsSync(join(directory,'operator-ack.local.json')),intent_created:existsSync(join(directory,'intent.local-only.json')),forward_reservations:model.forwardAttempts,dispatch_exposed:existsSync(join(directory,'dispatch.local.psql')),all_observed_children_ended:json(join(directory,'native-termination.json')).all_observed_children_ended,password_value_captured:false,operational_marker_created:false};
  const passed=delay?model.state==='STOPPED'&&model.reason==='ABSOLUTE_DEADLINE'&&result.forward_reservations===0&&!result.intent_created&&!result.dispatch_exposed&&(name==='password-delay'?session.proofs.length===0:authLog&&result.scram_verifier_boolean&&existsSync(join(directory,'human-ready-prompt-observed.json'))):model.state==='NATIVE_SYNTHETIC_CONFIRMED'&&authLog&&result.scram_verifier_boolean&&result.same_backend&&result.human_ready_observed;
  result.passed=passed;durableJSON(join(directory,'manual-scram-case-result.json'),result);cases.push(result);console.error('RESULTADO LOCAL '+name+': '+(passed?'PASS':'BLOCKED'));check(passed,'SCRAM_MANUAL_CASE_NOT_PROVEN');
 }
 const result={scope:'NATIVE_DISPOSABLE_ONLY',status:'SCRAM_MANUAL_CASES_PASS',cases,supabase_connections:0,operational_seed_loaded:false,operational_marker_created:false,password_value_captured:false,local_artifacts:cluster.root};durableJSON(join(cluster.root,'manual-scram-summary.json'),result);return result;
}
export async function demonstrate({pgBin,openssl,artifacts,manual=false,scram=false,scramCase='all'}){
 check(!scram||manual,'NATIVE_SCRAM_MANUAL_REQUIRED');
 const cluster=await localCluster({pgBin,openssl,artifacts,authentication:scram?'scram-sha-256':'cert'});let model,session,result;
 try{
  if(scram)return await scramManualCases(cluster,scramCase);
  const directory=privateRun(cluster.root,'c2-readiness-local-demonstration'),journal=new LocalJournal(directory,{scope:'NATIVE_DISPOSABLE_ONLY'});
  session=new NativeLocalSession({clusterRoot:cluster.root,directory,operatorMode:manual?'manual':'scripted-local'});model=new ReadinessPrototype({journal,session});
  await model.authenticate();console.error('LOCAL ONLY: native TLS/read-only authentication verified; awaiting readiness.');
  await model.ready(await session.operatorAcknowledgement());await model.dispatchSynthetic();await session.waitClosed();
  result={scope:'NATIVE_DISPOSABLE_ONLY',status:model.state,authentication:'certificate',native_psql_pid:session.nativePid,backend_pid:session.proofs[0].backend_pid,backend_start:session.proofs[0].backend_start,tls:session.proofs[0].tls_version,same_backend:session.proofs[0].backend_pid===session.proofs[1].backend_pid,events:journal.events.map(e=>e.type),forward_reservations:model.forwardAttempts,supabase_connections:0,operational_seed_loaded:false,operational_marker_created:false,local_artifacts:cluster.root};
  durableJSON(join(cluster.root,'native-demonstration.json'),result);return result;
 }finally{model?.stopLocal('LOCAL_DEMONSTRATION_FINISHED');if(session)await session.waitClosed();cluster.stop();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const args={};for(let i=2;i<process.argv.length;i+=2){check(['--pg-bin','--openssl','--artifacts','--manual','--scram','--scram-case'].includes(process.argv[i]),'NATIVE_LOCAL_ARGUMENT_REJECTED');args[process.argv[i]]=process.argv[i+1];}
  check(args['--pg-bin']&&args['--openssl'],'NATIVE_LOCAL_DEPENDENCIES_REQUIRED');
  console.log(JSON.stringify(await demonstrate({pgBin:resolve(args['--pg-bin']),openssl:resolve(args['--openssl']),artifacts:args['--artifacts']?resolve(args['--artifacts']):undefined,manual:args['--manual']==='true',scram:args['--scram']==='true',scramCase:args['--scram-case']||'all'}),null,2));
 }catch{console.error('NATIVE_LOCAL_DEMONSTRATION_BLOCKED_ARTIFACTS_RETAINED');process.exitCode=2;}finally{if(process.stdin.isTTY)process.stdin.destroy();}
}
