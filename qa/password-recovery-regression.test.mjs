import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// New gap: GoTrue's standard error.message was lost on password update.
// Mock only the HTTP boundary; never reset a real user or store a recovery token.
for (const file of ['src/App.jsx','App.jsx']) {
 const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const start=source.indexOf('function sanitizeRecoveryCode');
 const end=source.indexOf('async function callSupabaseFunction',start);
 assert.ok(start>=0&&end>start,'Auth implementation boundaries must exist');
 function client(response,{baseUrl='https://msinksoilkluooxenecy.supabase.co',publicKey='sb_publishable_mock_public_qa_key'}={}){
  const calls=[];
  const context=vm.createContext({URL,atob,fetch:async(url,options)=>{calls.push({url,options});return response;},SUPABASE_URL:baseUrl,SUPABASE_ANON_KEY:publicKey});
  vm.runInContext(source.slice(start,end)+';globalThis.update=supabaseAuth.updateUserPassword;',context);
  return {update:context.update,calls};
 }
 test(file+': standard Supabase message survives failed recovery update',async()=>{
  const c=client({ok:false,status:422,json:async()=>({code:'same_password',message:'New password should be different from the old password.'})});
  await assert.rejects(c.update('mock-recovery-token','mock-new-password'),error=>{
   assert.equal(error.message,'New password should be different from the old password.');
   assert.equal(error.status,422);assert.equal(error.code,'same_password');return true;
  });
 });
 test(file+': legacy recovery error and expired token remain failures',async()=>{
  const c=client({ok:false,status:401,json:async()=>({msg:'Recovery token has expired.'})});
  await assert.rejects(c.update('mock-recovery-token','mock-new-password'),error=>{
   assert.equal(error.message,'Recovery token has expired.');assert.equal(error.status,401);return true;
  });
 });
 test(file+': non-JSON error fails with safe fallback',async()=>{
  const c=client({ok:false,status:502,json:async()=>{throw new SyntaxError('not JSON');}});
  await assert.rejects(c.update('mock-recovery-token','mock-new-password'),error=>{
   assert.match(error.message,/Could not update your password/);assert.equal(error.status,502);return true;
  });
 });
 test(file+': success uses only recovery bearer and official user endpoint',async()=>{
  const user={id:'mock-user-id'};
  const publicKeys=['sb_publishable_mock_public_qa_key',
   ['mock',Buffer.from(JSON.stringify({role:'anon',ref:'msinksoilkluooxenecy'})).toString('base64url'),'mock'].join('.')];
  for(const publicKey of publicKeys){
   const c=client({ok:true,status:200,json:async()=>user},{publicKey});
   assert.equal(await c.update('mock-recovery-token','mock-new-password'),user);
   assert.equal(c.calls.length,1);const {url,options}=c.calls[0];
   assert.equal(url,'https://msinksoilkluooxenecy.supabase.co/auth/v1/user');
   assert.equal(options.method,'PUT');assert.equal(options.headers.Authorization,'Bearer mock-recovery-token');
   assert.equal(options.headers.apikey,publicKey);
   assert.deepEqual(JSON.parse(options.body),{password:'mock-new-password'});
  }
 });
 test(file+': unsafe or privileged recovery config fails before fetch',async()=>{
  const cases=[
   {baseUrl:'',publicKey:'sb_publishable_mock_public_qa_key'},
   {baseUrl:'http://msinksoilkluooxenecy.supabase.co',publicKey:'sb_publishable_mock_public_qa_key'},
   {baseUrl:'https://supabase.co',publicKey:'sb_publishable_mock_public_qa_key'},
   {baseUrl:'https://another-project.supabase.co',publicKey:'sb_publishable_mock_public_qa_key'},
   {baseUrl:'https://msinksoilkluooxenecy.supabase.co/auth',publicKey:'sb_publishable_mock_public_qa_key'},
   {baseUrl:'https://user:password@msinksoilkluooxenecy.supabase.co',publicKey:'sb_publishable_mock_public_qa_key'},
   {baseUrl:'https://msinksoilkluooxenecy.supabase.co?project=other',publicKey:'sb_publishable_mock_public_qa_key'},
   {baseUrl:'https://msinksoilkluooxenecy.supabase.co?',publicKey:'sb_publishable_mock_public_qa_key'},
   {baseUrl:'https://msinksoilkluooxenecy.supabase.co#fragment',publicKey:'sb_publishable_mock_public_qa_key'},
   {baseUrl:'https://msinksoilkluooxenecy.supabase.co#',publicKey:'sb_publishable_mock_public_qa_key'},
   {baseUrl:'https://msinksoilkluooxenecy.supabase.co:444',publicKey:'sb_publishable_mock_public_qa_key'},
   {baseUrl:'https://msinksoilkluooxenecy.supabase.co',publicKey:''},
   {baseUrl:'https://msinksoilkluooxenecy.supabase.co',publicKey:'opaque-public-looking-key'},
   {baseUrl:'https://msinksoilkluooxenecy.supabase.co',publicKey:'sb_secret_mock-never-valid'},
   {baseUrl:'https://msinksoilkluooxenecy.supabase.co',publicKey:['mock',Buffer.from(JSON.stringify({role:'service_role',ref:'msinksoilkluooxenecy'})).toString('base64url'),'mock'].join('.')},
   {baseUrl:'https://msinksoilkluooxenecy.supabase.co',publicKey:['mock',Buffer.from(JSON.stringify({role:'anon',ref:'wrong-project'})).toString('base64url'),'mock'].join('.')},
  ];
  for(const config of cases){
   const c=client({ok:true,status:200,json:async()=>({id:'must-not-run'})},config);
   await assert.rejects(c.update('mock-recovery-token','mock-new-password'),error=>{
    assert.equal(error.message,'Password recovery is not safely configured.');
    assert.equal(error.code,'invalid_recovery_config');return true;
   });
   assert.equal(c.calls.length,0,'Invalid recovery config must perform zero fetches');
  }
 });
 test(file+': HTTP 2xx without a valid Supabase user fails closed',async()=>{
  const responses=[
   {ok:true,status:200,json:async()=>{throw new SyntaxError('HTML response');}},
   {ok:true,status:200,json:async()=>({})},
   {ok:true,status:200,json:async()=>({id:''})},
  ];
  for(const response of responses){
   const c=client(response);
   await assert.rejects(c.update('mock-recovery-token','mock-new-password'),error=>{
    assert.match(error.message,/could not be verified/i);assert.equal(error.status,200);
    assert.equal(error.code,'invalid_success_response');return true;
   });
   assert.equal(c.calls.length,1);
  }
 });
 test(file+': recovery error details redact token material and reject unsafe codes',async()=>{
  const jwt='eyJabcdefghijk.abcdefghijk.abcdefghijk';
  const c=client({ok:false,status:422,json:async()=>({
   code:'bad code access_token=do-not-display',
   message:'Rejected Bearer do-not-display access_token=do-not-display token=do-not-display '+jwt,
  })});
  await assert.rejects(c.update('mock-recovery-token','mock-new-password'),error=>{
   assert.equal(error.status,422);assert.equal(error.code,undefined);
   assert.doesNotMatch(error.message,/do-not-display|eyJabcdefghijk/);
   assert.match(error.message,/\[redacted/);return true;
  });
 });
}
