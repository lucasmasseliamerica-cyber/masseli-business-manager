// Operational seed launcher, independent of the loss executor. Imports perform no IO.
import {execFileSync} from 'node:child_process';
import {X509Certificate,randomUUID} from 'node:crypto';
import {readFileSync,mkdirSync,lstatSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {check,sha256,fileHash,noLinks,durableFile,durableJSON,privateRun,nativeEnvironment,nativeOnce,nativeReceipt,prefixedJSON} from './stock-c2-seed-transport.mjs';
import {validateStockCatalog} from './stock-journey-core.mjs';
import {c1Precision,c1AuditContract} from './stock-c1-protocol.mjs';
export const SEED_CODE_BASE='da7c9de270a4535245751d2297eeaf6e7c63a270';
export const SEED_AUTHORITY='TEST_ONLY_THREE_ROW_SEED_WITHOUT_INITIAL_MOVEMENT_20261102';
export const SEED_HOST='db.msinksoilkluooxenecy.supabase.co';
export const APPROVED=Object.freeze({
 'stock-c2-provision-review.sql':'6ec2dc2fada7d69f1561b2848c29a11d647aa79c6ada6068ad26f0aa71b90635',
 'stock-c2-provision-reconcile-readonly.sql':'304361cbf214905fdd0511af9f33764606187008ea42f45524149e4878ab1fb6',
 'stock-c2-seed-same-session.psql':'d2bbdfbce05c065d2d92366d9287e9bb3d7d78c2ca70a56a0575783ba34f4bf2',
 'stock-c2-connection-readonly.psql':'dedc768a366f55c35dbc8fe1d62496dba622a7f74d772feb3ab014df03838619',
});
const keys=new Set(['mode','reviewed-head','psql','psql-sha256','ca','ca-sha256','artifacts','connection-evidence','seed-approval','window-at','window-until']);
const git=(root,...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore'],windowsHide:true}).trim();
export function parseSeedArgs(args){const p={};for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');check(keys.has(key)&&args[i]==='--'+key&&!Object.hasOwn(p,key)&&typeof args[i+1]==='string'&&!/[\0\r\n]/.test(args[i+1]),'C2_SEED_ARGUMENTS_REJECTED');p[key]=args[i+1];}check(['VerifyReadOnly','SeedAuthorized'].includes(p.mode),'C2_SEED_EXPLICIT_MODE_REQUIRED');return p;}
export function seedWindow(p,now=Date.now()){
 const at=Date.parse(p['window-at']),until=Date.parse(p['window-until']);
 check(p['seed-approval']===SEED_AUTHORITY&&Number.isFinite(at)&&Number.isFinite(until)&&at<=now&&until-now>=30000&&until-at<=1200000&&until-at>=30000,'C2_SEED_SEPARATE_APPROVAL_AND_WINDOW_REQUIRED');return{at,until};
}
export function reserveSeedMarker(path,record){noLinks(dirname(path));durableJSON(path,record);}
function safePath(value){check(typeof value==='string'&&isAbsolute(value)&&!value.startsWith('\\\\'),'C2_SEED_LOCAL_ABSOLUTE_PATH_REQUIRED');const path=resolve(value);noLinks(path);return path;}
function checkIdentity(p){check(Number.isInteger(p.pid)&&p.pid>0&&Number.isFinite(Date.parse(p.backend_start))&&typeof p.server_address==='string'&&p.server_port===5432&&p.database==='postgres'&&p.sql_role==='postgres'&&p.read_only==='on'&&p.default_read_only==='on'&&p.tls===true&&p.seed_authority_absent===true&&/^TLSv1\.[23]$/.test(p.tls_version||''),'C2_SEED_READONLY_IDENTITY_REJECTED');}
export function readConnectionProof(text){
 nativeReceipt({exitCode:0},text,'C2_READONLY_CONNECTION_COMPLETE_NO_SEED');
 const before=prefixedJSON(text,'C2_READ_BEFORE|'),after=prefixedJSON(text,'C2_READ_AFTER|'),e=prefixedJSON(text,'C2_READ_ELIGIBILITY|');
 checkIdentity(before);checkIdentity(after);for(const key of ['pid','backend_start','server_address','server_port','database','sql_role','tls','tls_version','cipher'])check(before[key]===after[key],'C2_SEED_READONLY_BACKEND_CHANGED');
 check(e.company_active===true&&e.owner_active===true&&e.replication_origin===true&&['location_collisions','item_collisions','position_collisions'].every(k=>e[k]===0)&&e.contract_md5==='135e8025db9f8097377432b0ff26fe8c','C2_SEED_ELIGIBILITY_OR_CONTRACT_DRIFT');
 const rows=text.split(/\r?\n/).filter(s=>s.startsWith('{')).map(s=>{try{return JSON.parse(s);}catch{return null;}});
 const catalogs=rows.filter(c=>c?.project_ref_expected==='msinksoilkluooxenecy');check(catalogs.length===1,'C2_SEED_CATALOG_CARDINALITY');
 const catalog=validateStockCatalog(catalogs[0]);c1Precision(catalog);c1AuditContract(catalog);
 return {project:'msinksoilkluooxenecy',scope:'C2_READONLY_CONNECTION_AND_ELIGIBILITY',backend_pid:before.pid,backend_start:before.backend_start,server_address_sha256:sha256(before.server_address),server_port:5432,tls:true,tls_version:before.tls_version,cipher:before.cipher,read_only:true,seed_authority_absent:true,company_active:true,owner_active:true,collisions:0,provision_contract_md5:e.contract_md5,stock_contracts:'PASS',catalog_captured_at:catalog.captured_at};
}
function nativeSeedProof(text){
 const rows=text.split(/\r?\n/).filter(s=>s.startsWith('{')).map(s=>{try{return JSON.parse(s);}catch{return null;}}).filter(c=>c?.scope==='C2_PROVISION_READONLY_RECONCILIATION');
 check(rows.length===1&&rows[0].status==='SEED_OBSERVED_NO_EXECUTION_AUTHORIZATION'&&rows[0].retry_allowed===false&&rows[0].cleanup_allowed===false&&rows[0].c2_loss_authorized===false,'C2_SEED_FINAL_OBSERVATION_UNCONFIRMED_NO_REPLAY');
 return {status:rows[0].status,loss_authorized:false};
}
export async function launchSeed(p){
 const report={scope:'C2_SEED_OPERATIONAL_LAUNCHER',status:'BLOCKED',code:'C2_SEED_NOT_STARTED',mode:p.mode,retry_allowed:false,cleanup_allowed:false,loss_authorized:false,marker_created:false,forward_attempts:0,loss_validated_code_sha:SEED_CODE_BASE};let directory;
 try{
  const root=safePath(p.artifacts);check(lstatSync(root).isDirectory(),'C2_SEED_ARTIFACT_ROOT_REQUIRED');directory=privateRun(root,'run-'+randomUUID());report.artifact_directory=directory;
  durableJSON(join(directory,'admission-intent.json'),{scope:report.scope,mode:p.mode,at:new Date().toISOString(),seed_executed:false,password_recorded:false});
  const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  check(process.platform==='win32'&&process.stdin.isTTY===true,'C2_SEED_VISIBLE_NATIVE_CONSOLE_REQUIRED');
  check(/^[a-f0-9]{40}$/.test(p['reviewed-head']||'')&&git(repo,'branch','--show-current')==='automation/nexalvo-qa-actions'&&git(repo,'status','--porcelain')===''&&git(repo,'rev-parse','HEAD')===p['reviewed-head'],'C2_SEED_CLEAN_REVIEWED_QA_REQUIRED');
  git(repo,'merge-base','--is-ancestor',SEED_CODE_BASE,'HEAD');report.reviewed_head=p['reviewed-head'];
  const exe=safePath(p.psql),ca=safePath(p.ca);
  for(const key of ['psql-sha256','ca-sha256'])check(/^[a-f0-9]{64}$/.test(p[key]||''),'C2_SEED_REVIEWED_HASH_REQUIRED');
  check(fileHash(exe)===p['psql-sha256']&&fileHash(ca)===p['ca-sha256'],'C2_SEED_NATIVE_BYTES_CHANGED');
  const cert=new X509Certificate(readFileSync(ca));check(cert.ca&&cert.verify(cert.publicKey)&&Date.parse(cert.validFrom)<=Date.now()&&Date.parse(cert.validTo)>Date.now(),'C2_SEED_CA_REJECTED');
  const version=execFileSync(exe,['--version'],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore'],timeout:5000,env:nativeEnvironment(exe,ca,true)}).trim();check(/^psql \(PostgreSQL\) 17\.\d+$/.test(version),'C2_SEED_PSQL17_REQUIRED');
  report.psql_version=version;report.psql_sha256=p['psql-sha256'];report.ca_sha256=p['ca-sha256'];
  for(const [name,hash]of Object.entries(APPROVED))check(fileHash(join(repo,'qa',name))===hash,'C2_SEED_APPROVED_SQL_BYTES_CHANGED');
  const readOnly=p.mode==='VerifyReadOnly';let window,evidence;
  if(readOnly)check(!p['seed-approval']&&!p['window-at']&&!p['window-until']&&!p['connection-evidence'],'C2_SEED_READONLY_MUTATION_ARGUMENT_FORBIDDEN');
  else{
   window=seedWindow(p);const proofPath=safePath(p['connection-evidence']);evidence=JSON.parse(readFileSync(proofPath,'utf8'));
   check(evidence.status==='PASS'&&evidence.mode==='VerifyReadOnly'&&evidence.marker_created===false&&evidence.psql_sha256===report.psql_sha256&&evidence.ca_sha256===report.ca_sha256&&Date.now()-Date.parse(evidence.completed_at)>=0&&Date.now()-Date.parse(evidence.completed_at)<=1800000,'C2_SEED_FRESH_NATIVE_READ_PROOF_REQUIRED');
   git(repo,'merge-base','--is-ancestor',evidence.reviewed_head,'HEAD');check(git(repo,'diff','--name-only',`${evidence.reviewed_head}..HEAD`).split('\n').every(v=>!v||v.startsWith('docs/')),'C2_SEED_CODE_CHANGED_SINCE_READ_PROOF');
  }
  // Snapshot exact bytes. VerifyReadOnly never copies or invokes the seed driver.
  const files=readOnly?['stock-c2-connection-readonly.psql']:['stock-c2-seed-same-session.psql','stock-c2-provision-review.sql','stock-c2-provision-reconcile-readonly.sql'];
  const manifest=[];for(const name of files){const bytes=readFileSync(join(repo,'qa',name));durableFile(join(directory,name),bytes);check(fileHash(join(directory,name))===APPROVED[name],'C2_SEED_SNAPSHOT_MISMATCH');manifest.push({name,sha256:APPROVED[name]});}
  if(readOnly){mkdirSync(join(directory,'sql'),{mode:0o700});const bytes=execFileSync('git',['show',p['reviewed-head']+':qa/sql/stock_journey_preflight_readonly_TEST.sql'],{cwd:repo,stdio:['ignore','pipe','ignore'],windowsHide:true});durableFile(join(directory,'sql','stock_journey_preflight_readonly_TEST.sql'),bytes);manifest.push({name:'sql/stock_journey_preflight_readonly_TEST.sql',sha256:sha256(bytes)});}
  durableJSON(join(directory,'snapshot-manifest.json'),manifest);report.snapshot_hashes=manifest;
  const authority=readOnly?{}:{QA_C2_SEED_AUTHORIZED:SEED_AUTHORITY,QA_C2_SEED_VERIFIED_PROJECT_REF:'msinksoilkluooxenecy',QA_C2_SEED_EXCLUSIVE_AT:p['window-at'],QA_C2_SEED_EXCLUSIVE_UNTIL:p['window-until']};
  const env=nativeEnvironment(exe,ca,readOnly,authority,true),driver=join(directory,files[0]);
  const args=['-X','-W','-A','-t','-h',SEED_HOST,'-p','5432','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f',driver];
  if(!readOnly){seedWindow(p);reserveSeedMarker(join(tmpdir(),'nexalvo-stock-c2-seed-475ae0c8-5a4b-45a2-ad74-1a450e553cb0.once'),{scope:'C2_SEED_ONE_FORWARD_ATTEMPT_NO_REPLAY',reviewed_head:p['reviewed-head'],at:new Date().toISOString(),sql_hashes:manifest});report.marker_created=true;}
  report.forward_attempts=1;
  const result=await nativeOnce({exe,args,env,directory,timeoutMs:readOnly?900000:Math.min(120000,window.until-Date.now()),consolePrompt:true});report.native_result=result;
  check(result.promptObserved===true,'C2_SEED_NATIVE_PROMPT_NOT_PROVEN_NO_REPLAY');
  const text=readFileSync(join(directory,'stdout.private.log'),'utf8');
  nativeReceipt(result,text,readOnly?'C2_READONLY_CONNECTION_COMPLETE_NO_SEED':'C2_SEED_COMMIT_RECEIPT_SAME_BACKEND_NO_LOSS_AUTHORIZATION');
  report.observation=readOnly?readConnectionProof(text):nativeSeedProof(text);report.status='PASS';report.code=readOnly?'C2_NATIVE_READONLY_CONNECTION_ELIGIBILITY_PASS_NO_SEED':'C2_SEED_CONFIRMED_LOSS_STILL_BLOCKED';
 }catch(error){report.code=/^C2_[A-Z0-9_]+$/.test(error?.code||'')?error.code:'C2_SEED_BLOCKED_OR_RESULT_UNCONFIRMED';report.result_uncertain=report.forward_attempts>0;}
 finally{
  report.completed_at=new Date().toISOString();if(directory){
   try{report.artifact_hashes=readdirSync(directory).filter(n=>n.endsWith('.log')||n.endsWith('.json')).map(name=>({name,sha256:fileHash(join(directory,name))}));durableJSON(join(directory,'result.sanitized.json'),report);}catch{report.status='BLOCKED';report.code='C2_SEED_ARTIFACT_FINALIZATION_UNCONFIRMED';}
  }
 }
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){let report;try{report=await launchSeed(parseSeedArgs(process.argv.slice(2)));}catch{report={scope:'C2_SEED_OPERATIONAL_LAUNCHER',status:'BLOCKED',code:'C2_SEED_ARGUMENTS_OR_BOOTSTRAP_BLOCKED',retry_allowed:false,loss_authorized:false};}console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='PASS'?0:2;}
