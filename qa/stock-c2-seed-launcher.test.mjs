// No TEST network, password, global marker or seed driver execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseSeedArgs,seedWindow,SEED_AUTHORITY,APPROVED,reserveSeedMarker} from './stock-c2-seed-launcher.mjs';
import {sha256,durableJSON,nativeEnvironment,nativeReceipt,nativeOnce,privateRun,nativePasswordPrompt} from './stock-c2-seed-transport.mjs';
test('operational parser requires explicit mode and rejects unknown, duplicate or control-bearing arguments',()=>{
 for(const args of [[],['--mode','Seed'],['--mode','VerifyReadOnly','--password','SECRET'],['--mode','VerifyReadOnly','--mode','SeedAuthorized'],['--mode','VerifyReadOnly','--psql','x\ny']])assert.throws(()=>parseSeedArgs(args));
 assert.equal(parseSeedArgs(['--mode','VerifyReadOnly']).mode,'VerifyReadOnly');
});
test('seed authority and new exclusive window are separate, finite and at least 30s from expiry',()=>{
 const at=Date.parse('2026-11-03T00:00:00Z'),p={'seed-approval':SEED_AUTHORITY,'window-at':new Date(at).toISOString(),'window-until':new Date(at+60000).toISOString()};
 assert.equal(seedWindow(p,at).until,at+60000);assert.throws(()=>seedWindow({...p,'seed-approval':'C1'},at));assert.throws(()=>seedWindow(p,at+30001));assert.throws(()=>seedWindow({...p,'window-until':new Date(at+1200001).toISOString()},at));
});
test('all three approved seed/reconciliation/driver artifacts keep exact reviewed bytes; new readonly driver is pinned separately',()=>{
 for(const [name,expected]of Object.entries(APPROVED))assert.equal(sha256(readFileSync(new URL(name,import.meta.url))),expected);
 const ro=readFileSync(new URL('stock-c2-connection-readonly.psql',import.meta.url),'utf8');
 assert.match(ro,/REPEATABLE READ READ ONLY/);assert.ok(!/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CALL)\s/i.test(ro.replace(/^--.*$/gm,'')));assert.ok(!/set_config|\\ir stock-c2-seed|QA_C2_SEED_AUTHORIZED/.test(ro));
});
test('native readonly environment drops inherited services, credentials, options and mutating authorities',()=>{
 const saved={...process.env};try{
  Object.assign(process.env,{PGPASSWORD:'SYNTHETIC_ONLY',PGSERVICE:'SYNTHETIC_ONLY',PGHOSTADDR:'SYNTHETIC_ONLY',PSQLRC:'SYNTHETIC_ONLY',QA_C2_SEED_AUTHORIZED:SEED_AUTHORITY,QA_C1_CHILD_EXECUTION_AUTHORIZED:'SYNTHETIC_ONLY',OSTYPE:'msys'});
  const env=nativeEnvironment('C:/bin/psql.exe','C:/reviewed/ca.crt',true);
  for(const key of ['PGPASSWORD','PGSERVICE','PGHOSTADDR','PSQLRC','QA_C2_SEED_AUTHORIZED','QA_C1_CHILD_EXECUTION_AUTHORIZED','OSTYPE'])assert.equal(env[key],undefined);
  assert.equal(env.PGSSLMODE,'verify-full');assert.equal(env.PGGSSENCMODE,'disable');assert.match(env.PGOPTIONS,/default_transaction_read_only=on/);
 }finally{for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved);}
});
test('observable native prompt selects the supported standard-stream path, retaining strict TLS and no password capture',()=>{
 const env=nativeEnvironment('C:/bin/psql.exe','C:/reviewed/ca.crt',true,{},true);assert.equal(env.OSTYPE,'msys');assert.equal(env.LC_ALL,'C');assert.equal(env.PGSSLMODE,'verify-full');assert.equal(env.PGPASSWORD,undefined);
});
test('native -W Password: and named prompt are recognized; arbitrary diagnostics cannot declare readiness',()=>{
 assert.equal(nativePasswordPrompt('Password: '),'Password: ');assert.equal(nativePasswordPrompt('previous\nPassword for user postgres: '),'Password for user postgres: ');
 for(const text of ['Password','FATAL: password authentication failed','arbitrary Password: ','Password: \n'])assert.equal(nativePasswordPrompt(text),null);
});
test('local marker is exclusive and retained after failure; no alternate marker or overwrite',()=>{
 const root=mkdtempSync(join(tmpdir(),'c2-seed-marker-synthetic-')),marker=join(root,'SYNTHETIC.once');reserveSeedMarker(marker,{scope:'SYNTHETIC'});const original=readFileSync(marker);
 assert.throws(()=>reserveSeedMarker(marker,{scope:'REPLAY'}));assert.deepEqual(readFileSync(marker),original);
});
test('exit 0 without exactly one receipt is unconfirmed; errors, cancellation and timeouts never mean rollback',()=>{
 for(const [r,t]of [[{exitCode:0},'COMMIT'],[{exitCode:3},'RECEIPT'],[{exitCode:2},'RECEIPT'],[{exitCode:0,timedOut:true},'RECEIPT'],[{exitCode:0,interrupted:true},'RECEIPT'],[{exitCode:0},'RECEIPT\nRECEIPT']])assert.throws(()=>nativeReceipt(r,t,'RECEIPT'));
 nativeReceipt({exitCode:0},'RECEIPT','RECEIPT');
});
test('native failure preserves private intent, stdout and stderr, no retry or removal',async()=>{
 const root=mkdtempSync(join(tmpdir(),'c2-seed-transport-synthetic-')),directory=privateRun(root,'run-synthetic');
 const r=await nativeOnce({exe:process.execPath,args:['-e',"console.log('SYNTHETIC_OUTPUT');console.error('SYNTHETIC_DIAGNOSTIC');process.exit(3)"],env:nativeEnvironment(process.execPath,'SYNTHETIC',true),directory,timeoutMs:10000});
 assert.equal(r.exitCode,3);assert.equal(r.attempts,1);assert.ok(existsSync(join(directory,'native-intent.json')));assert.match(readFileSync(join(directory,'stdout.private.log'),'utf8'),/SYNTHETIC_OUTPUT/);assert.match(readFileSync(join(directory,'stderr.private.log'),'utf8'),/SYNTHETIC_DIAGNOSTIC/);
 assert.equal(readdirSync(directory).length,3);
});
