import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const HOST='msinksoilkluooxenecy.supabase.co';
const required=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY',
 'QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD',
 'QA_TWO_TENANT_A_BUSINESS_ID','QA_TWO_TENANT_A_LOCATION_ID','QA_TWO_TENANT_A_PRODUCT_ID',
 'QA_TWO_TENANT_B_BUSINESS_ID','QA_TWO_TENANT_B_LOCATION_ID','QA_TWO_TENANT_B_PRODUCT_ID'];
const missing=required.filter(k=>!process.env[k]);
const skip=process.env.QA_TWO_TENANT_ENABLED!=='true'?
 'Not certified: QA_TWO_TENANT_ENABLED must be true':
 missing.length?'Not certified: missing two-tenant QA fixtures or secrets: '+missing.join(', '):false;
function baseConfig(){
 const base=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(base.protocol,'https:');
 assert.equal(base.hostname,HOST,'Only isolated Supabase TEST permitted');
 assert.equal(base.username,'');assert.equal(base.password,'');
 return {base,key:process.env.QA_SUPABASE_ANON_KEY};
}
async function request(base,key,path,token,body){
 const begin=performance.now();
 const response=await fetch(new URL(path,base),{
  method:body===undefined?'GET':'POST',
  headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  redirect:'error',signal:AbortSignal.timeout(30000)
 });
 const raw=await response.text();
 let value;try{value=JSON.parse(raw)}catch{value=raw}
 return {status:response.status,value,begin,end:performance.now()};
}
async function signIn(base,key,email,password){
 const r=await request(base,key,'/auth/v1/token?grant_type=password',null,{email,password});
 assert.equal(r.status,200,'Dedicated TEST QA login failed with HTTP '+r.status);
 assert.ok(r.value?.access_token,'Missing TEST QA access token');
 return r.value.access_token;
}
test('distinct TEST companies post different amounts concurrently without cross-tenant leakage', {skip,timeout:120000},async()=>{
 const {base,key}=baseConfig();
 const a={business:process.env.QA_TWO_TENANT_A_BUSINESS_ID,location:process.env.QA_TWO_TENANT_A_LOCATION_ID,
  product:process.env.QA_TWO_TENANT_A_PRODUCT_ID,price:11.25,id:randomUUID()};
 const b={business:process.env.QA_TWO_TENANT_B_BUSINESS_ID,location:process.env.QA_TWO_TENANT_B_LOCATION_ID,
  product:process.env.QA_TWO_TENANT_B_PRODUCT_ID,price:23.50,id:randomUUID()};
 assert.notEqual(a.business,b.business,'Two distinct QA tenants required');
 for(const tenant of [a,b]){
  for(const id of [tenant.business,tenant.location,tenant.product])
   assert.match(id,/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
 }
 // Explicitly scope this test to the two existing fictitious tenants on TEST.
 assert.equal(a.business,'d627563b-2ce4-491d-8cf6-141ef28d0f63');
 assert.equal(b.business,'3849b750-20f7-4929-8699-737a4e1983c8');
 const [aToken,bToken]=await Promise.all([
  signIn(base,key,process.env.QA_TWO_TENANT_A_EMAIL,process.env.QA_TWO_TENANT_A_PASSWORD),
  signIn(base,key,process.env.QA_TWO_TENANT_B_EMAIL,process.env.QA_TWO_TENANT_B_PASSWORD)
 ]);
 const payload=(t)=>({p_sale_id:t.id,p_business_id:t.business,p_location_id:t.location,
  p_channel:'QA_TWO_TENANTS',p_payment_method:'Card',p_employee_id:null,p_customer_id:null,
  p_discount:0,p_tax:0,p_notes:'QA only: two-tenant parallel test',
  p_fulfillment_status:'Received',p_items:[{product_id:t.product,qty:1,unit_price:t.price}]});
 let checkA,checkB;
 let mainError=null;
 try{
  const [resultA,resultB]=await Promise.all([
   request(base,key,'/rest/v1/rpc/fn_create_sale',aToken,payload(a)),
   request(base,key,'/rest/v1/rpc/fn_create_sale',bToken,payload(b))
  ]);
  const overlap=Math.min(resultA.end,resultB.end)-Math.max(resultA.begin,resultB.begin);
  console.log('QA parallel request overlap (milliseconds):',Math.round(overlap));
  assert.ok(overlap>0,'Requests did not overlap in time');
  assert.equal(resultA.status,200,'Tenant A sale HTTP '+resultA.status);
  assert.equal(resultB.status,200,'Tenant B sale HTTP '+resultB.status);
  for(const [t,r] of [[a,resultA],[b,resultB]]){
   assert.equal(r.value?.id,t.id,'Unexpected sale ID');
   assert.equal(Number(r.value?.total),t.price,'Wrong sale amount');
   assert.equal(r.value?.business_id,t.business,'Wrong tenant on sale');
  }
  for(const [self,ownToken,other] of [[a,aToken,b],[b,bToken,a]]){
   const [sales,flow,foreignSales,foreignFlow]=await Promise.all([
    request(base,key,'/rest/v1/sales?select=id,total,business_id&id=eq.'+self.id,ownToken),
    request(base,key,'/rest/v1/cash_flow?select=id,amount,business_id&sale_id=eq.'+self.id,ownToken),
    request(base,key,'/rest/v1/sales?select=id&id=eq.'+other.id,ownToken),
    request(base,key,'/rest/v1/cash_flow?select=id&sale_id=eq.'+other.id,ownToken)
   ]);
   for(const r of [sales,flow,foreignSales,foreignFlow])assert.equal(r.status,200,'RLS verification read failed');
   assert.equal(sales.value.length,1,'Own sale not visible exactly once');
   assert.equal(flow.value.length,1,'Own cash flow not visible exactly once');
   assert.equal(Number(flow.value[0].amount),self.price,'Own cash flow amount mismatch');
   assert.equal(flow.value[0].business_id,self.business,'Cash flow attributed to wrong tenant');
   assert.equal(foreignSales.value.length,0,'Cross-tenant sale information leaked');
   assert.equal(foreignFlow.value.length,0,'Cross-tenant cash flow information leaked');
  }
 }catch(error){mainError=error}
 finally{
  for(const [t,token] of [[a,aToken],[b,bToken]]){
   const existing=await request(base,key,'/rest/v1/sales?select=id,status&id=eq.'+t.id,token);
   assert.equal(existing.status,200,'Cannot check cleanup state for '+t.id);
   if(existing.value.length&&existing.value[0].status!=='cancelled'){
    const reverse=await request(base,key,'/rest/v1/rpc/fn_reverse_sale',token,{p_sale_id:t.id});
    assert.equal(reverse.status,200,'QA sale reversal failed for '+t.id);
    assert.equal(reverse.value?.status,'cancelled','QA sale not cancelled');
   }
  }
 }
 if(mainError)throw mainError;
});
