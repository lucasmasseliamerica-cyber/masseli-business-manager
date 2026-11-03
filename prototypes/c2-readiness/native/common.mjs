import {openSync,writeFileSync,fsyncSync,closeSync,readFileSync,lstatSync,existsSync,linkSync} from 'node:fs';
import {resolve,dirname,join,sep} from 'node:path';import {createHash} from 'node:crypto';
export const check=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const fileHash=p=>hash(readFileSync(p));
export const json=p=>JSON.parse(readFileSync(p,'utf8'));
export const mono=()=>Number(process.hrtime.bigint()/1000000n);
export const wait=ms=>new Promise(r=>setTimeout(r,ms));
export function noLinks(path){for(let p=resolve(path);;p=dirname(p)){check(!lstatSync(p).isSymbolicLink(),'NATIVE_LINK_FORBIDDEN');if(p===dirname(p))return;}}
export function contained(root,path){const p=resolve(path);check(p.startsWith(resolve(root)+sep),'NATIVE_PATH_OUTSIDE_LOCAL_ROOT');return p;}
export function durable(path,bytes){noLinks(dirname(path));const pending=path+'.pending';const fd=openSync(pending,'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}linkSync(pending,path);}
export const durableJSON=(p,v)=>durable(p,JSON.stringify(v,null,2)+'\n');
export function admission(m){check(Date.now()<m.deadlineWall&&mono()<m.deadlineMono,'NATIVE_ABSOLUTE_DEADLINE');check(Math.min(m.deadlineWall-Date.now(),m.deadlineMono-mono())>=30000,'NATIVE_MARGIN_REQUIRED');}
export function owned(root){
 noLinks(root);const m=json(join(root,'owned-cluster.json'));const auth=m.authentication||'cert';
 check(m.scope==='NATIVE_DISPOSABLE_ONLY'&&resolve(m.root)===resolve(root)&&m.host==='127.0.0.1'&&m.database==='postgres'&&((auth==='cert'&&m.role==='postgres')||(auth==='scram-sha-256'&&m.role==='c2_scram_lab')),'NATIVE_OWNED_LOOPBACK_REQUIRED');
 for(const [name,expected]of Object.entries(m.hashes)){const p=contained(root,join(root,name));noLinks(p);check(fileHash(p)===expected,'NATIVE_CLUSTER_BYTES_CHANGED');}
 const postmaster=readFileSync(join(root,'data','postmaster.pid'),'utf8').split(/\r?\n/);check(Number(postmaster[0])===m.postmaster_pid&&Number(postmaster[3])===m.port,'NATIVE_POSTMASTER_IDENTITY_REQUIRED');
 try{process.kill(m.postmaster_pid,0);}catch{check(false,'NATIVE_POSTMASTER_NOT_RUNNING');}return m;
}
export async function waitJSON(path,deadline,stopped=()=>false){while(!existsSync(path)){check(!stopped(),'NATIVE_LOCAL_STOP');check(Date.now()<deadline,'NATIVE_GATE_DEADLINE');await wait(20);}check(!stopped(),'NATIVE_LOCAL_STOP');noLinks(path);return json(path);}
export function environment(m){
 const env={};for(const k of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOME'])if(process.env[k])env[k]=process.env[k];
 const absentPassfile=join(m.root,'ABSENT_NO_PASSWORD_FILE');check(!existsSync(absentPassfile),'NATIVE_PASSWORD_FILE_FORBIDDEN');
 Object.assign(env,{PATH:dirname(m.psql)+(process.platform==='win32'?';'+join(process.env.SystemRoot,'System32'):':/usr/bin:/bin'),LANG:'C',LC_ALL:'C',OSTYPE:'msys',PGPASSFILE:absentPassfile,PGSSLMODE:'verify-full',PGSSLROOTCERT:join(m.root,'ca.crt'),PGSSLCERT:join(m.root,'client.crt'),PGSSLKEY:join(m.root,'client.key'),PGGSSENCMODE:'disable',PGCONNECT_TIMEOUT:'10',PGAPPNAME:'c2-native-disposable-only',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=20000 -c idle_in_transaction_session_timeout=30000'});
 if(m.authentication==='scram-sha-256'){
  const cert=join(m.root,'ABSENT_CLIENT_CERT'),key=join(m.root,'ABSENT_CLIENT_KEY');check(!existsSync(cert)&&!existsSync(key),'NATIVE_SCRAM_CLIENT_CERT_FORBIDDEN');
  Object.assign(env,{PGSSLCERT:cert,PGSSLKEY:key,PGCHANNELBINDING:'require'});
 }
 return env;
}
export function identityExpression(base,authentication){
 check(['cert','scram-sha-256'].includes(authentication),'NATIVE_AUTH_METHOD_REQUIRED');
 return authentication==='scram-sha-256'?`(${base}) || jsonb_build_object('scram_verifier',(SELECT rolpassword LIKE 'SCRAM-SHA-256$%' FROM pg_authid WHERE rolname=session_user))`:base;
}
