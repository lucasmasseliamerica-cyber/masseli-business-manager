// Reproducible real local demonstration. No remote host, SQL or password argument.
import {resolve,join} from 'node:path';import {pathToFileURL} from 'node:url';
import {localCluster} from './cluster.mjs';import {NativeLocalSession} from './adapter.mjs';
import {LocalJournal,ReadinessPrototype} from '../protocol.mjs';
import {privateRun} from '../../../qa/stock-c2-seed-transport.mjs';import {durableJSON,check} from './common.mjs';
export async function demonstrate({pgBin,openssl,artifacts,manual=false}){
 const cluster=await localCluster({pgBin,openssl,artifacts});let model,session,result;
 try{
  const directory=privateRun(cluster.root,'c2-readiness-local-demonstration'),journal=new LocalJournal(directory,{scope:'NATIVE_DISPOSABLE_ONLY'});
  session=new NativeLocalSession({clusterRoot:cluster.root,directory,operatorMode:manual?'manual':'scripted-local'});model=new ReadinessPrototype({journal,session});
  await model.authenticate();console.error('LOCAL ONLY: native TLS/read-only authentication verified; awaiting readiness.');
  await model.ready(await session.operatorAcknowledgement());await model.dispatchSynthetic();await session.waitClosed();
  result={scope:'NATIVE_DISPOSABLE_ONLY',status:model.state,authentication:'certificate',native_psql_pid:session.nativePid,backend_pid:session.proofs[0].backend_pid,backend_start:session.proofs[0].backend_start,tls:session.proofs[0].tls_version,same_backend:session.proofs[0].backend_pid===session.proofs[1].backend_pid,events:journal.events.map(e=>e.type),forward_reservations:model.forwardAttempts,supabase_connections:0,operational_seed_loaded:false,operational_marker_created:false,local_artifacts:cluster.root};
  durableJSON(join(cluster.root,'native-demonstration.json'),result);return result;
 }finally{model?.stopLocal('LOCAL_DEMONSTRATION_FINISHED');if(session)await session.waitClosed();cluster.stop();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const args={};for(let i=2;i<process.argv.length;i+=2){check(['--pg-bin','--openssl','--artifacts','--manual'].includes(process.argv[i]),'NATIVE_LOCAL_ARGUMENT_REJECTED');args[process.argv[i]]=process.argv[i+1];}
  check(args['--pg-bin']&&args['--openssl'],'NATIVE_LOCAL_DEPENDENCIES_REQUIRED');
  console.log(JSON.stringify(await demonstrate({pgBin:resolve(args['--pg-bin']),openssl:resolve(args['--openssl']),artifacts:args['--artifacts']?resolve(args['--artifacts']):undefined,manual:args['--manual']==='true'}),null,2));
 }catch{console.error('NATIVE_LOCAL_DEMONSTRATION_BLOCKED_ARTIFACTS_RETAINED');process.exitCode=2;}
}
