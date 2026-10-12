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
 await t.test('anonymous caller cannot retrieve private auth identity',async()=>{
  const r=await call(conf,'/auth/v1/user',{method:'GET'});
  assert.ok([401,403].includes(r.status),'Expected auth rejection, got HTTP '+r.status);
 });
 await t.test('forged refresh token cannot start a new session',async()=>{
  const r=await call(conf,'/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:'qa-invalid-refresh-token-do-not-authenticate'}});
  assert.ok([400,401,403].includes(r.status),'Invalid refresh unexpectedly accepted HTTP '+r.status);
  assert.equal(Boolean(r.value?.access_token),false,'Invalid refresh leaked access token');
 });
 await t.test('incorrect TEST password cannot authenticate',async()=>{
  const r=await call(conf,'/auth/v1/token?grant_type=password',{body:{
    email:process.env.QA_TWO_TENANT_B_EMAIL,
    password:'QA_INVALID_PASSWORD_DO_NOT_ACCEPT_'+Date.now()
  }});
  assert.ok([400,401,403].includes(r.status),'Bad password unexpectedly succeeded: '+r.status);
  assert.ok(!r.value?.access_token,'Bad password cannot return access token');
 });
 await t.test('malformed bearer token cannot access protected REST records',async()=>{
  const r=await call(conf,'/rest/v1/sales?select=id&limit=1',{
   method:'GET',token:'this-is-not-a-jwt'
  });
  assert.ok([401,403].includes(r.status),'Malformed JWT must be denied, got '+r.status);
  assert.ok(!Array.isArray(r.value),'Protected REST cannot return records with invalid JWT');
 });
 await t.test('malformed bearer token cannot create financial sale',async()=>{
  const r=await call(conf,'/rest/v1/rpc/fn_create_sale',{
   token:'this-is-not-a-jwt',body:{
    p_sale_id:'00000000-0000-4000-8000-000000000001',
    p_business_id:'3849b750-20f7-4929-8699-737a4e1983c8',
    p_location_id:'1302346c-5197-46cb-a586-f8aeac394789',
    p_channel:'QA_AUTH_NEGATIVE',p_payment_method:'Card',p_employee_id:null,
    p_customer_id:null,p_discount:0,p_tax:0,p_notes:'QA_AUTH_NEGATIVE',
    p_fulfillment_status:'Received',p_items:[]
   }
  });
  assert.ok([401,403].includes(r.status),'Malformed JWT must be rejected before RPC, got '+r.status);
 });
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
