import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const names=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'];
function run(overrides){
 const env={...process.env};for(const n of names)delete env[n];
 Object.assign(env,overrides);
 const r=spawnSync(process.execPath,['qa/p0-preflight-readonly.TEST.mjs'],{env,encoding:'utf8',timeout:5000});
 assert.equal(r.error,undefined,'Guard must exit before any network request');
 const output=r.stdout+r.stderr;
 for(const n of names){if(env[n])assert.ok(!output.includes(env[n]),'Guard output must not expose binding values');}
 return r.status;
}
function complete(){return Object.fromEntries(names.map(n=>[n,n==='QA_SUPABASE_URL'?'https://msinksoilkluooxenecy.supabase.co':'mock-private-value-'+n]));}
test('preflight missing bindings fail closed without a passing skip',()=>assert.equal(run({}),2));
test('preflight wrong host fails before network and suppresses URL credentials',()=>assert.equal(run({...complete(),QA_SUPABASE_URL:'https://mock-user:mock-pass@invalid.example/'}),1));
test('preflight privileged key fails before login',()=>assert.equal(run({...complete(),QA_SUPABASE_ANON_KEY:'sb_secret_MOCK_NOT_REAL'}),1));
test('preflight invalid key JWT claims fail before login',()=>{
 const key=['mock',Buffer.from(JSON.stringify({role:'authenticated',ref:'wrong-project'})).toString('base64url'),'mock'].join('.');
 assert.equal(run({...complete(),QA_SUPABASE_ANON_KEY:key}),1);
});
