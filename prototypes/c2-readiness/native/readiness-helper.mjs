// Child of the single psql. No DB library, connection, password or operational marker.
import {readFileSync,existsSync} from 'node:fs';import {join} from 'node:path';import {createInterface} from 'node:readline/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';import {check,json,owned,durable,durableJSON,waitJSON,admission,fileHash} from './common.mjs';
import {digest,HISTORY} from '../protocol.mjs';
export async function gate(directory,stage){
 const m=json(join(directory,'native-manifest.json'));owned(m.clusterRoot);admission(m);
 for(const [name,expected]of Object.entries(m.sourceHashes))check(fileHash(fileURLToPath(new URL('./'+name,import.meta.url)))===expected,'NATIVE_GATE_SOURCE_CHANGED');
 check(['intent','dispatch'].includes(stage),'NATIVE_GATE_STAGE_REJECTED');
 durableJSON(join(directory,'helper-'+stage+'.json'),{pid:process.pid,parent_pid:process.ppid,stage});
 const verified=await waitJSON(join(directory,'validated-read1.json'),m.deadlineWall);admission(m);
 check(verified.operation_hash===m.operationHash,'NATIVE_GATE_HASH_MISMATCH');
 if(stage==='intent'){
  let request;
  if(m.operatorMode==='manual'){
   const rl=createInterface({input:process.stdin,output:process.stdout});try{const text=await rl.question('LOCAL readiness only: type READY after reviewing the proof/window: ');request={ready:text==='READY'};}finally{rl.close();}
  }else{check(m.operatorMode==='scripted-local','NATIVE_OPERATOR_MODE_REQUIRED');request=await waitJSON(join(directory,'operator-request.local.json'),m.deadlineWall);}
  admission(m);check(request.ready===true,'NATIVE_OPERATOR_NOT_READY');
  durableJSON(join(directory,'operator-ack.local.json'),{scope:'NATIVE_DISPOSABLE_ONLY',operator_confirmed:true,proof_digest:verified.proof_digest,operation_hash:m.operationHash,history_acknowledged:HISTORY,review_decision:'NATIVE_DISPOSABLE_ONLY',window_at:m.windowAt,window_until:m.windowUntil});
  await waitJSON(join(directory,'intent-release.local.json'),m.deadlineWall);admission(m);
 }else{await waitJSON(join(directory,'dispatch-release.local.json'),m.deadlineWall);admission(m);}
 const intent=json(join(directory,'intent.local-only.json')),ack=json(join(directory,'operator-ack.local.json'));
 check(intent.scope==='NATIVE_DISPOSABLE_ONLY'&&intent.operation_hash===m.operationHash&&intent.proof_digest===verified.proof_digest&&digest(intent.operator_ack)===digest(ack)&&ack.operator_confirmed===true,'NATIVE_DURABLE_INTENT_REQUIRED');
 if(stage==='dispatch'){
  const reservation=json(join(directory,'forward-reservation.local-only.json')),recheck=json(join(directory,'validated-read2.json'));
  check(reservation.scope==='NATIVE_DISPOSABLE_ONLY'&&reservation.forward_attempts===1&&reservation.operation_hash===m.operationHash&&recheck.proof_digest===verified.proof_digest,'NATIVE_DURABLE_RESERVATION_REQUIRED');
  const template=fileURLToPath(new URL('./synthetic-dispatch.psql.in',import.meta.url));check(fileHash(template)===m.operationHash,'NATIVE_TEMPLATE_BYTES_CHANGED');
  const literal=s=>"'"+String(s).replaceAll("'","''")+"'";
  const proof=recheck.proof;check(Number.isInteger(proof.backend_pid)&&/^\d+$/.test(proof.cluster_id),'NATIVE_IDENTITY_REQUIRED');
  let sql=readFileSync(template,'utf8');
  const replacements={PID:String(proof.backend_pid),BACKEND_START:literal(proof.backend_start),CLUSTER:literal(proof.cluster_id),DEADLINE:literal(new Date(m.deadlineWall).toISOString()),OPERATION_HASH:literal(m.operationHash),IDENTITY:readFileSync(new URL('./identity.sql',import.meta.url),'utf8')};
  for(const [key,value]of Object.entries(replacements))sql=sql.replaceAll('@@'+key+'@@',value);
  check(!sql.includes('@@'),'NATIVE_TEMPLATE_UNRESOLVED');admission(m);
  durable(join(directory,'dispatch.local.psql'),sql);admission(m);
  durableJSON(join(directory,'permit-published.local.json'),{intent_sha256:fileHash(join(directory,'intent.local-only.json')),reservation_sha256:fileHash(join(directory,'forward-reservation.local-only.json')),dispatch_sha256:fileHash(join(directory,'dispatch.local.psql')),at:new Date().toISOString()});
 }
 return {stage,passed:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await gate(process.argv[2],process.argv[3]);}catch{console.error('NATIVE_LOCAL_GATE_STOP');process.exitCode=3;}}
