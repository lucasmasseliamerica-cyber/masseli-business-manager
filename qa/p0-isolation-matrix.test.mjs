import test from 'node:test';
import assert from 'node:assert/strict';

const TEST_HOST='msinksoilkluooxenecy.supabase.co';
const TENANTS=[
 {name:'A',business:'d627563b-2ce4-491d-8cf6-141ef28d0f63'},
 {name:'B',business:'3849b750-20f7-4929-8699-737a4e1983c8'}
];
const required=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'];
const missing=required.filter(k=>!process.env[k]);
const skip=process.env.QA_TWO_TENANT_ENABLED!=='true'?'TEST-only role gate disabled':missing.length?'TEST credentials unavailable: '+missing.join(', '):false;
function cfg(){
 const url=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(url.hostname,TEST_HOST,'Production access forbidden');
 assert.equal(url.protocol,'https:');assert.equal(url.username,'');assert.equal(url.password,'');
 return {url,key:process.env.QA_SUPABASE_ANON_KEY};
}
async function call(c,path,token,body){
 const res=await fetch(new URL(path,c.url),{
  method:body===undefined?'GET':'POST',headers:{apikey:c.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  redirect:'error',signal:AbortSignal.timeout(15000)
 });
 const raw=await res.text();
 let value;try{value=JSON.parse(raw)}catch{value=raw}
 return {status:res.status,value};
}
test('P0 TEST-only real OWNER JWTs: broad tenant RLS and protected backup', {skip,timeout:120000},async t=>{
 const c=cfg();
 const fixtures=[];
 for(const self of TENANTS){
  const session=await call(c,'/auth/v1/token?grant_type=password',null,{
   email:process.env['QA_TWO_TENANT_'+self.name+'_EMAIL'],
   password:process.env['QA_TWO_TENANT_'+self.name+'_PASSWORD']
  });
  assert.equal(session.status,200,'QA auth failed for '+self.name);
  assert.ok(session.value.access_token,'Missing valid QA JWT for '+self.name);
  fixtures.push({...self,token:session.value.access_token});
 }
 for(const [i,self] of fixtures.entries()){
  const foreign=fixtures[1-i];
  // Query only known RLS-enabled tables with direct SELECT privilege. Never select private data.
  for(const table of ['customers','expenses','purchase_orders','suppliers','tasks','cash_registers','shifts','inventory_items','locations','users']){
   await t.test(self.name+' cannot enumerate '+foreign.name+' / '+table,async()=>{
    const r=await call(c,'/rest/v1/'+table+'?select=id&business_id=eq.'+foreign.business+'&limit=1',self.token);
    assert.equal(r.status,200,'RLS read failed HTTP '+r.status+' on '+table);
    assert.ok(Array.isArray(r.value),'Expected JSON array');
    assert.equal(r.value.length,0,'Foreign tenant data exposed in '+table);
   });
  }
  for(const facade of ['fn_read_employees_secure','fn_read_waste_transactions_secure']){
   await t.test(self.name+' secure RPC hides '+foreign.name+' / '+facade,async()=>{
    const r=await call(c,'/rest/v1/rpc/'+facade+'?select=id,business_id&business_id=eq.'+foreign.business,self.token);
    assert.equal(r.status,200,'Secure facade HTTP '+r.status);
    assert.ok(Array.isArray(r.value));
    assert.equal(r.value.length,0,'Foreign facade results leaked');
   });
  }
  await t.test(self.name+' cannot request business export for foreign '+foreign.name,async()=>{
   const r=await call(c,'/rest/v1/rpc/fn_export_business_data',self.token,{p_business_id:foreign.business});
   assert.ok([400,401,403].includes(r.status),'Foreign backup export was not denied: HTTP '+r.status);
   assert.equal(typeof r.value?.error,'undefined','Unexpected direct backup payload');
  });
 }
});
