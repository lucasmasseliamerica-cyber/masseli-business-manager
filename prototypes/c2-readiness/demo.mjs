// Fixed local model only; no connection arguments or SQL input exist.
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {LocalJournal,LocalSession,ReadinessPrototype,OPERATION_HASH,HISTORY,assertRealExecutionBlocked} from './protocol.mjs';
const directory=mkdtempSync(join(tmpdir(),'c2-readiness-local-'));
const journal=new LocalJournal(directory),session=new LocalSession(),model=new ReadinessPrototype({journal,session});
await model.authenticate();
await model.ready({scope:'LOCAL_SIMULATION_ONLY',operator_confirmed:true,proof_digest:model.proofDigest,operation_hash:OPERATION_HASH,history_acknowledged:HISTORY,review_decision:'SIMULATION_ONLY',window_at:Date.now(),window_until:Date.now()+60000});
await model.dispatchSynthetic();
let blocked=false;try{assertRealExecutionBlocked();}catch{blocked=true;}
console.log(JSON.stringify({scope:'LOCAL_SIMULATION_ONLY',status:model.state,events:journal.events.map(e=>e.type),synthetic_forward_reservations:model.forwardAttempts,real_forward_attempts:0,test_connections:0,tls_or_authentication_proven:false,real_execution_blocked:blocked,original_history_touched:false,artifacts_retained:true,artifact_directory:directory},null,2));
