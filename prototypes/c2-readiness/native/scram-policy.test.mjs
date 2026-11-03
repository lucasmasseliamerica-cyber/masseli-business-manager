// New SCRAM controls only. These tests never claim a human/native login.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readdirSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {execFileSync,spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {environment,identityExpression} from './common.mjs';
const root=()=>mkdtempSync(join(tmpdir(),'c2-scram-control-'));
const manifest=r=>({root:r,psql:process.execPath,authentication:'scram-sha-256'});
test('SCRAM uses TLS/channel binding and no certificate or password file fallback',()=>{
 const r=root(),env=environment(manifest(r));assert.equal(env.PGSSLMODE,'verify-full');assert.equal(env.PGCHANNELBINDING,'require');assert.equal(env.PGPASSWORD,undefined);assert.equal(env.PGPASSFILE,join(r,'ABSENT_NO_PASSWORD_FILE'));assert.equal(env.PGSSLCERT,join(r,'ABSENT_CLIENT_CERT'));assert.equal(env.PGSSLKEY,join(r,'ABSENT_CLIENT_KEY'));
});
test('inherited credentials, service and address cannot enter the SCRAM native environment',()=>{
 const url=new URL('./common.mjs',import.meta.url).href,r=root();
 const source=`import {environment} from ${JSON.stringify(url)};const e=environment({root:${JSON.stringify(r)},psql:process.execPath,authentication:'scram-sha-256'});for(const k of ['PGPASSWORD','PGSERVICE','PGHOST','PGHOSTADDR','PGUSER','PSQLRC'])if(e[k]!==undefined)process.exit(2);`;
 const env={};for(const k of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOME'])if(process.env[k])env[k]=process.env[k];for(const k of ['PGPASSWORD','PGSERVICE','PGHOST','PGHOSTADDR','PGUSER','PSQLRC'])env[k]='NOT_A_CREDENTIAL_CONTROL_SENTINEL';
 const p=spawnSync(process.execPath,['--input-type=module','-e',source],{env,stdio:['ignore','pipe','pipe'],timeout:10000});assert.equal(p.status,0);
});
test('unexpected password/certificate/key fallback files fail closed',()=>{
 for(const name of ['ABSENT_NO_PASSWORD_FILE','ABSENT_CLIENT_CERT','ABSENT_CLIENT_KEY']){const r=root();writeFileSync(join(r,name),'CONTROL_FILE_NOT_CREDENTIAL',{flag:'wx'});assert.throws(()=>environment(manifest(r)));}
});
test('SCRAM proof exposes only verifier type boolean; certificate proof stays byte-identical',()=>{
 const base='BASE_IDENTITY';assert.equal(identityExpression(base,'cert'),base);const sql=identityExpression(base,'scram-sha-256');assert.match(sql,/scram_verifier/);assert.match(sql,/SELECT rolpassword LIKE 'SCRAM-SHA-256\$%'/);assert.ok(!/SELECT rolpassword\s+FROM/.test(sql));assert.throws(()=>identityExpression(base,'trust'));
});
test('SCRAM demonstration cannot silently provision credentials without manual mode',()=>{
 const r=root(),p=spawnSync(process.execPath,[fileURLToPath(new URL('./demo.mjs',import.meta.url)),'--pg-bin',process.execPath,'--openssl',process.execPath,'--artifacts',r,'--scram','true'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000});assert.equal(p.status,2);assert.match(p.stderr,/NATIVE_LOCAL_DEMONSTRATION_BLOCKED/);assert.deepEqual(readdirSync(r),[]);
});
test('headless SCRAM setup rejects before creating a cluster or asking for password',()=>{
 const r=root(),url=new URL('./cluster.mjs',import.meta.url).href;
 const source=`import {localCluster} from ${JSON.stringify(url)};try{await localCluster({pgBin:process.execPath,openssl:process.execPath,artifacts:${JSON.stringify(r)},authentication:'scram-sha-256'});}catch(e){process.stdout.write(e.code||e.message);process.exitCode=2;}`;
 const p=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000});assert.equal(p.status,2);assert.equal(p.stdout,'NATIVE_SCRAM_INITDB_CONSOLE_REQUIRED');assert.deepEqual(readdirSync(r),[]);
});
