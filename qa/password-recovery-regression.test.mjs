import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// New gap: GoTrue's standard error.message was lost on password update.
// Mock only the HTTP boundary; never reset a real user or store a recovery token.
for (const file of ['src/App.jsx','App.jsx']) {
 const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const start=source.indexOf('const supabaseAuth =');
 const end=source.indexOf('async function callSupabaseFunction',start);
 assert.ok(start>=0&&end>start,'Auth implementation boundaries must exist');
 function client(response){
  const calls=[];
  const context=vm.createContext({fetch:async(url,options)=>{calls.push({url,options});return response;},SUPABASE_URL:'https://msinksoilkluooxenecy.supabase.co',SUPABASE_ANON_KEY:'mock-public-key'});
  vm.runInContext(source.slice(start,end)+';globalThis.update=supabaseAuth.updateUserPassword;',context);
  return {update:context.update,calls};
 }
 test(file+': standard Supabase message survives failed recovery update',async()=>{
  const c=client({ok:false,status:422,json:async()=>({code:'same_password',message:'New password should be different from the old password.'})});
  await assert.rejects(c.update('mock-recovery-token','mock-new-password'),{message:'New password should be different from the old password.'});
 });
 test(file+': legacy recovery error and expired token remain failures',async()=>{
  const c=client({ok:false,status:401,json:async()=>({msg:'Recovery token has expired.'})});
  await assert.rejects(c.update('mock-recovery-token','mock-new-password'),{message:'Recovery token has expired.'});
 });
 test(file+': non-JSON error fails with safe fallback',async()=>{
  const c=client({ok:false,status:502,json:async()=>{throw new SyntaxError('not JSON');}});
  await assert.rejects(c.update('mock-recovery-token','mock-new-password'),/Could not update your password/);
 });
 test(file+': success uses only recovery bearer and official user endpoint',async()=>{
  const user={id:'mock-user-id'};const c=client({ok:true,status:200,json:async()=>user});
  assert.equal(await c.update('mock-recovery-token','mock-new-password'),user);
  assert.equal(c.calls.length,1);const {url,options}=c.calls[0];
  assert.equal(url,'https://msinksoilkluooxenecy.supabase.co/auth/v1/user');
  assert.equal(options.method,'PUT');assert.equal(options.headers.Authorization,'Bearer mock-recovery-token');
  assert.equal(options.headers.apikey,'mock-public-key');
  assert.deepEqual(JSON.parse(options.body),{password:'mock-new-password'});
 });
}
