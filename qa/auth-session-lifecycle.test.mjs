import test from 'node:test';
import assert from 'node:assert/strict';

const HOST='msinksoilkluooxenecy.supabase.co';
const skip=process.env.QA_TWO_TENANT_ENABLED!=='true'?'QA_TWO_TENANT_ENABLED must be true':
 ['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'].filter(k=>!process.env[k]).join(', ')||false;
function cfg(){
 const url=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(url.protocol,'https:');assert.equal(url.hostname,HOST,'TEST ONLY');
 assert.equal(url.username,'');assert.equal(url.password,'');
 return {url,key:process.env.QA_SUPABASE_ANON_KEY};
}
async function call(conf,path,options={}){
 const res=await fetch(new URL(path,conf.url),{
  method:options.method||'POST',
  headers:{apikey:conf.key,'Content-Type':'application/json',...(options.token?{Authorization:'Bearer '+options.token}:{})},
  ...(options.body===undefined?{}:{body:JSON.stringify(options.body)}),
  signal:AbortSignal.timeout(15000),redirect:'error'
 });
 const raw=await res.text();let value;
 try{value=JSON.parse(raw)}catch{value=raw}
 return {status:res.status,value};
}
test('TEST-only authentication sessions: independent login, refresh rotation and revoked refresh after logout',{skip,timeout:120000},async t=>{
 const conf=cfg();
 const sessions=[];
 for(const label of ['A','B']){
  await t.test('authenticated login and isolated identity '+label,async()=>{
   const auth=await call(conf,'/auth/v1/token?grant_type=password',{body:{
    email:process.env['QA_TWO_TENANT_'+label+'_EMAIL'],
    password:process.env['QA_TWO_TENANT_'+label+'_PASSWORD']
   }});
   assert.equal(auth.status,200,'password grant HTTP '+auth.status);
   assert.ok(auth.value.access_token&&auth.value.refresh_token,'Tokens required');
   const mine=await call(conf,'/auth/v1/user',{method:'GET',token:auth.value.access_token});
   assert.equal(mine.status,200,'fresh JWT cannot read own identity');
   assert.ok(mine.value.id,'Identity absent');
   sessions.push({label,original:auth.value,uid:mine.value.id});
  });
 }
 assert.equal(sessions.length,2);assert.notEqual(sessions[0].uid,sessions[1].uid,'QA logins must be independent');
 for(const s of sessions){
  await t.test('refresh rotates TEST session '+s.label,async()=>{
   const newer=await call(conf,'/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:s.original.refresh_token}});
   assert.equal(newer.status,200,'refresh HTTP '+newer.status);
   assert.ok(newer.value.access_token&&newer.value.refresh_token,'Rotated tokens missing');
   const user=await call(conf,'/auth/v1/user',{method:'GET',token:newer.value.access_token});
   assert.equal(user.status,200);assert.equal(user.value.id,s.uid);
   s.current=newer.value;
  });
  await t.test('logout rejects subsequent session refresh '+s.label,async()=>{
   const logout=await call(conf,'/auth/v1/logout',{method:'POST',token:s.current.access_token});
   assert.ok(logout.status>=200&&logout.status<300,'Logout HTTP '+logout.status);
   const reuse=await call(conf,'/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:s.current.refresh_token}});
   assert.ok(reuse.status===400||reuse.status===401||reuse.status===403,'Revoked token unexpectedly refreshed: HTTP '+reuse.status);
  });
 }
});
