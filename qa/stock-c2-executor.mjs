// Opt-in C2 only. Importing performs no IO/network. No provisioning or resume mode.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { stockConfiguration, validateStockCatalog } from './stock-journey-core.mjs';
import { c1Precision, c1AuditContract } from './stock-c1-protocol.mjs';
import { validateC1ChildSecurity } from './stock-c1-child-security.mjs';
import { C2, need, hash, same, validateC2Fixture, reconcileC2, recoveryC2, c2Window, c2Authorization } from './stock-c2-protocol.mjs';
import { openC2Client } from './stock-c2-client.mjs';
import { openC2Store } from './stock-c2-store.mjs';
import { prepareC2Runtime } from './stock-c2-browser-runtime.mjs';
import { runC2Browser } from './stock-c2-browser.mjs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore'],windowsHide:true}).trim();
const read=path=>JSON.parse(readFileSync(path,'utf8'));
export function c2Mode(args){need(args.length===1&&['--preflight','--execute','--recover-readonly'].includes(args[0]),'EXPLICIT_MODE_REQUIRED');return args[0].slice(2);}
export async function stockC2(env=process.env,args=process.argv.slice(2),dependencies={}){
  const d={git,read,openClient:openC2Client,openStore:openC2Store,prepareRuntime:prepareC2Runtime,browser:runC2Browser,now:Date.now,
    catalog:(v,now)=>{const c=validateStockCatalog(v,now);c1Precision(c);c1AuditContract(c);},security:validateC1ChildSecurity,...dependencies};
  const report={scope:'C2_ONLY',status:'BLOCKED',code:'C2_NOT_STARTED',stock_requests_forwarded:0,audit_requests_forwarded:0,
    negative_requests_forwarded:0,fixtures_created:0,history_deleted:0,resume_allowed:false,full_homologation:false,execution_result_unconfirmed:false,global_passed:16,global_total:60};
  let client,runtime,state,mode,store,recoveryHash,interrupted=false;
  const stop=()=>{interrupted=true;};
  try{
    mode=c2Mode(args);const sha=env.QA_C2_VALIDATED_CODE_SHA;
    need(/^[a-f0-9]{40}$/.test(sha||'')&&d.git('branch','--show-current')==='automation/nexalvo-qa-actions'&&d.git('status','--porcelain')==='','CLEAN_VALIDATED_QA_REQUIRED');
    d.git('merge-base','--is-ancestor',sha,'HEAD');
    need(d.git('diff','--name-only',`${sha}..HEAD`).split('\n').every(p=>!p||p.startsWith('docs/')),'UNVALIDATED_CODE');
    report.source_sha=d.git('rev-parse','HEAD');report.validated_code_sha=sha;
    if(mode==='execute'){c2Authorization(env,sha,env.QA_C2_AUTHORIZED_BASELINE_SHA256);c2Window(env,d.now());}
    d.catalog(d.read(env.QA_C2_CATALOG_FILE),d.now());
    const security=d.security(d.read(env.QA_C2_SECURITY_FILE),env.QA_C2_REVIEWED_SECURITY_SHA256,d.now());report.security_sha256=security.securityHash;
    store=d.openStore();if(mode!=='recover-readonly')store.available();
    else{const loaded=store.load(true);state=loaded.state;recoveryHash=loaded.checksum;report.partial_tail_retained=loaded.partial_tail_retained===true;need(env.QA_C2_JOURNAL_SHA256===recoveryHash,'TRUSTED_JOURNAL_HASH_REQUIRED');}
    const config=stockConfiguration({...env,QA_STOCK_ITEM_ID:C2.item,QA_STOCK_SOURCE_LOCATION_ID:C2.location,QA_STOCK_TARGET_LOCATION_ID:C2.stock});
    client=await d.openClient(config,env);await client.isolation();report.identity_permissions='PASS';report.read_isolation='PASS';
    if(mode==='recover-readonly'){
      report.observation=recoveryC2(state,await client.view());need(store.load(true).checksum===recoveryHash,'RECOVERY_CHANGED_JOURNAL');
      report.code='C2_READONLY_OBSERVATION_NO_RESUME';report.status='PASS';return report;
    }
    const baseline=validateC2Fixture(await client.view());need(same(baseline,await client.view()),'UNSTABLE_BASELINE');
    report.baseline_sha256=hash(baseline);report.fixture_sha256=hash(C2);report.fixture_eligibility='PASS';
    if(mode==='preflight'){report.scope='C2_READONLY_PREFLIGHT';report.status='PASS';report.code='C2_READONLY_READY_EXECUTION_NOT_AUTHORIZED';return report;}
    c2Authorization(env,sha,report.baseline_sha256);const window=c2Window(env,d.now());
    const gate=()=>{need(!interrupted,'INTERRUPTED_NO_REPLAY');c2Authorization(env,sha,hash(baseline));need(same(c2Window(env,d.now()),window),'WINDOW_CHANGED');if(state)store.assertCurrent();};
    process.on('SIGINT',stop);process.on('SIGTERM',stop);runtime=await d.prepareRuntime({env,config});gate();
    need(same(baseline,await client.view()),'BASELINE_CHANGED_BEFORE_RESERVATION');
    state={phase:'RESERVED',baseline,sourceSha:sha,reviewHash:security.securityHash,window,startedAt:d.now()};store.reserve(state);gate();
    const save=()=>{gate();store.save(state);gate();};
    await d.browser({runtime,client,state,save,gate,report});gate();
    need(state.phase==='AUDIT_CONFIRMED'&&report.stock_requests_forwarded===1&&report.audit_requests_forwarded===1&&report.ui_cycle==='PASS'
      &&report.persist_reload==='PASS'&&report.ui_history==='PASS','FINAL_BUDGET_OR_UI_UNPROVEN');
    report.reconciliation=reconcileC2(baseline,await client.view(),1,1,state.intentAt);recoveryC2(state,await client.view());
    state.phase='COMPLETE';save();report.journal_sha256=store.load().checksum;report.status='PASS';report.code='C2_REAL_UI_LOSS_WITH_RESIDUAL_HISTORY';report.full_homologation=true;
  }catch(e){
    report.code=/^C2_[A-Z0-9_]{1,100}$/.test(e?.code||'')?e.code:'C2_BLOCKED_OR_UNCONFIRMED';
    if(state&&mode==='execute'){report.code='C2_RESERVED_STOP_READONLY_RECONCILIATION_REQUIRED';report.execution_result_unconfirmed=true;try{report.journal_sha256=store.load(true).checksum;}catch{report.journal_integrity='BLOCKED';}}
  }finally{
    try{await runtime?.close();}catch{report.status='BLOCKED';report.full_homologation=false;report.code='C2_RUNTIME_CLEANUP_UNCONFIRMED';}
    try{await client?.close();}catch{/* never expose session errors */}
    if(mode==='recover-readonly'&&recoveryHash){try{need(store.load(true).checksum===recoveryHash,'RECOVERY_CHANGED_JOURNAL');}catch{report.status='BLOCKED';report.code='C2_RECOVERY_JOURNAL_CHANGED';}}
    process.off('SIGINT',stop);process.off('SIGTERM',stop);
  }
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  let r;try{r=await stockC2();}catch{r={status:'BLOCKED',code:'C2_RUNNER_BLOCKED',full_homologation:false};}
  console.log(JSON.stringify(r,null,2));process.exitCode=r.status==='PASS'?0:2;
}
