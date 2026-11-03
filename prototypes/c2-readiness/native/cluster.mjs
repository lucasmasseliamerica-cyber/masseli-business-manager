// Create/stop only an owned, disposable PG17 cluster. Never delete its artifacts.
import {execFileSync,spawn} from 'node:child_process';import {createServer} from 'node:net';
import {readFileSync,writeFileSync,appendFileSync,openSync,closeSync,fsyncSync,chmodSync,existsSync} from 'node:fs';import {join,resolve} from 'node:path';import {randomUUID} from 'node:crypto';import {tmpdir} from 'node:os';
import {privateRun} from '../../../qa/stock-c2-seed-transport.mjs';
import {check,durableJSON,fileHash} from './common.mjs';
export async function localCluster({pgBin,openssl,artifacts=tmpdir(),authentication='cert'}){
 check(['cert','scram-sha-256'].includes(authentication),'NATIVE_AUTH_METHOD_REQUIRED');
 const scram=authentication==='scram-sha-256',role=scram?'c2_scram_lab':'postgres';
 if(scram)check(process.stdin.isTTY===true,'NATIVE_SCRAM_INITDB_CONSOLE_REQUIRED');
 const root=privateRun(resolve(artifacts),'c2-native-disposable-'+randomUUID()),ext=process.platform==='win32'?'.exe':'',psql=join(pgBin,'psql'+ext),ctl=join(pgBin,'pg_ctl'+ext),data=join(root,'data');let sequence=0;
 const run=(exe,args)=>{const base=join(root,'setup-'+(++sequence)),out=openSync(base+'.stdout.private.log','wx',0o600),err=openSync(base+'.stderr.private.log','wx',0o600);try{execFileSync(exe,args,{timeout:30000,windowsHide:true,stdio:['ignore',out,err],env:{...process.env,LANG:'C',LC_ALL:'C'}});return readFileSync(base+'.stdout.private.log','utf8');}finally{for(const fd of [out,err]){fsyncSync(fd);closeSync(fd);}}};
 const version=execFileSync(psql,['--version'],{encoding:'utf8',windowsHide:true}).trim();check(/^psql \(PostgreSQL\) 17\./.test(version),'NATIVE_PG17_REQUIRED');
 const port=await new Promise((res,rej)=>{const s=createServer();s.once('error',rej);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p));});});
 let started=false;
 const stop=()=>{if(started||existsSync(join(data,'postmaster.pid'))){run(ctl,['-D',data,'-m','fast','-w','-t','20','stop']);started=false;durableJSON(join(root,'owned-cluster-stopped.json'),{stopped:true,files_removed:0});}};
 try{
  run(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(root,'ca.key'),'-out',join(root,'ca.crt'),'-subj','/CN=C2 LOCAL ONLY CA','-days','1','-addext','basicConstraints=critical,CA:TRUE']);
  for(const [name,cn]of [['server','localhost'],['client','postgres'],['bad-client','not-postgres']]){
   run(openssl,['req','-new','-newkey','rsa:2048','-nodes','-keyout',join(root,name+'.key'),'-out',join(root,name+'.csr'),'-subj','/CN='+cn]);
   const extension=join(root,name+'.ext');writeFileSync(extension,name==='server'?'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n':'extendedKeyUsage=clientAuth\n',{flag:'wx'});
   run(openssl,['x509','-req','-in',join(root,name+'.csr'),'-CA',join(root,'ca.crt'),'-CAkey',join(root,'ca.key'),'-CAcreateserial','-out',join(root,name+'.crt'),'-days','1','-extfile',extension]);
  }
  // Wrong client subject must use its matching key; the adapter still pins every file.
  run(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(root,'bad-ca.key'),'-out',join(root,'bad-ca.crt'),'-subj','/CN=UNTRUSTED LOCAL CA','-days','1']);
  if(process.platform!=='win32')for(const n of ['ca','server','client','bad-client','bad-ca'])chmodSync(join(root,n+'.key'),0o600);
  if(scram){
   console.error('LAB LOCAL: crie uma senha INEDITA neste initdb e confirme-a. Nunca use senha Supabase. Entrada oculta nativa; nenhum leitor de senha no Node.');
   const env={};for(const k of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOME'])if(process.env[k])env[k]=process.env[k];Object.assign(env,{LANG:'C',LC_ALL:'C',OSTYPE:'msys'});
   await new Promise((res,rej)=>{
    const child=spawn(join(pgBin,'initdb'+ext),['-D',data,'-U',role,'--auth-host=scram-sha-256','--auth-local=reject','-W','--encoding=UTF8','--no-locale','--no-clean'],{env,windowsHide:false,stdio:['inherit','inherit','pipe']});
    let n=0,tail='',timedOut=false;durableJSON(join(root,'initdb-native-intent.json'),{pid:child.pid,at:new Date().toISOString(),deadline_ms:120000,password_captured:false});
    const timer=setTimeout(()=>{timedOut=true;durableJSON(join(root,'initdb-native-timeout.json'),{at:new Date().toISOString(),pid:child.pid,reason:'NATIVE_INITDB_SETUP_DEADLINE'});child.kill();},120000);
    child.stderr.on('data',bytes=>{process.stderr.write(bytes);tail=(tail+bytes.toString('utf8')).slice(-512);if(/Enter (?:new superuser password|it again): $/.test(tail))durableJSON(join(root,'initdb-native-prompt-'+(n++)+'.json'),{pid:child.pid,prompt_observed:true,at:new Date().toISOString(),password_captured:false});});
    child.once('error',()=>{clearTimeout(timer);rej(new Error('NATIVE_INITDB_SETUP_FAILED'));});child.once('exit',(code,signal)=>{clearTimeout(timer);durableJSON(join(root,'initdb-native-result.json'),{at:new Date().toISOString(),pid:child.pid,exit_code:code,signal,timed_out:timedOut,password_captured:false,source:'NATIVE_PROCESS_EXIT_NOT_PIPE_CLOSE'});child.stderr.destroy();code===0?res():rej(new Error(timedOut?'NATIVE_INITDB_SETUP_DEADLINE':'NATIVE_INITDB_SETUP_FAILED'));});
   });
  }else run(join(pgBin,'initdb'+ext),['-D',data,'-U',role,'-A','reject','--encoding=UTF8','--no-locale','--no-clean']);
  const quote=s=>s.replaceAll('\\','/').replaceAll("'","''");
  appendFileSync(join(data,'postgresql.conf'),`\nlisten_addresses='127.0.0.1'\nunix_socket_directories=''\nport=${port}\nssl=on\nssl_cert_file='${quote(join(root,'server.crt'))}'\nssl_key_file='${quote(join(root,'server.key'))}'\nssl_ca_file='${quote(join(root,'ca.crt'))}'\nlog_connections=on\nlog_disconnections=on\nlog_statement='none'\n`);
  writeFileSync(join(data,'pg_hba.conf'),`hostssl all all 127.0.0.1/32 ${authentication}\nhostnossl all all 127.0.0.1/32 reject\nlocal all all reject\n`);
  const control=run(join(pgBin,'pg_controldata'+ext),[data]),system_identifier=control.match(/Database system identifier:\s*(\d+)/)?.[1];check(system_identifier,'NATIVE_CLUSTER_ID_REQUIRED');
  run(ctl,['-D',data,'-l',join(root,'postgres.private.log'),'-w','-t','20','start']);started=true;
  const m={scope:'NATIVE_DISPOSABLE_ONLY',root,host:'127.0.0.1',port,database:'postgres',role,authentication,system_identifier,postmaster_pid:Number(readFileSync(join(data,'postmaster.pid'),'utf8').split(/\r?\n/)[0]),psql,psql_sha256:fileHash(psql),version,hashes:Object.fromEntries(['ca.crt','server.crt','server.key','client.crt','client.key','bad-client.crt','bad-client.key','bad-ca.crt','data/pg_hba.conf'].map(n=>[n,fileHash(join(root,n))]))};
  durableJSON(join(root,'owned-cluster.json'),m);return{root,manifest:m,stop};
 }catch(e){
  const log=existsSync(join(root,'postgres.private.log'))?readFileSync(join(root,'postgres.private.log'),'utf8'):'';
  const category=e.message==='NATIVE_INITDB_SETUP_DEADLINE'?'CREDENTIAL_PROMPT_DEADLINE':/could not create lock file.*PGSQL.*Permission denied/i.test(log)?'UNIX_SOCKET_PERMISSION':/private key|certificate|SSL/i.test(log)?'TLS_SETUP':/address already in use/i.test(log)?'LOCAL_PORT_COLLISION':'SETUP_FAILURE';
  console.error('NATIVE_LOCAL_SETUP_CATEGORY='+category);try{stop();}catch{/* retain failed setup */}throw e;
 }
}
