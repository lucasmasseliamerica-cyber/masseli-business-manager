import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// P0.03 — real TEST-only authenticated HTTP cash register guard.
// Uses dedicated OWNER B QA fixture. Never send credentials to logs.
// Unexpected successful sales are compensated via fn_reverse_sale in TEST.
const HOST='msinksoilkluooxenecy.supabase.co';
const BIZ='3849b750-20f7-4929-8699-737a4e1983c8';
const LOC='f0715b85-af37-4bba-be7e-448732176446';
const PRODUCT='a4cac86d-038d-418e-b953-9a3605f2df18';
const OWNER='88eddcda-d8b5-4474-b5d7-19860dd97fba';
const required=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'];
const missing=required.filter(k=>!process.env[k]);
const skip=process.env.QA_TWO_TENANT_ENABLED!=='true'?'TEST gate disabled':missing.length?'Missing TEST secrets: '+missing.join(', '):false;

function config(){
 const url=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(url.protocol,'https:');
 assert.equal(url.hostname,HOST,'No production connectivity permitted');
 assert.equal(url.username,'');assert.equal(url.password,'');
 return {url,key:process.env.QA_SUPABASE_ANON_KEY};
}
async function send(c,path,token,body){
 const response=await fetch(new URL(path,c.url),{
   method:body===undefined?'GET':'POST',headers:{
     apikey:c.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})
   },...(body===undefined?{}:{body:JSON.stringify(body)}),
   redirect:'error',signal:AbortSignal.timeout(20000)
 });
 const raw=await response.text();let value;try{value=JSON.parse(raw)}catch{value=raw}
 return {status:response.status,value};
}
test('P0.03 TEST: real OWNER HTTP cash payment is refused if register closed',{skip,timeout:90000},async t=>{
 const c=config();
 const login=await send(c,'/auth/v1/token?grant_type=password',null,{
   email:process.env.QA_TWO_TENANT_B_EMAIL,password:process.env.QA_TWO_TENANT_B_PASSWORD
 });
 assert.equal(login.status,200,'TEST owner login failed');
 const token=login.value?.access_token;
 assert.ok(token,'TEST owner token missing');
 // Fail the parent test *before* any RPC POST, even if a preflight check fails.
 // A failed nested node:test assertion must not allow code to keep executing.
 const who=await send(c,'/auth/v1/user',token);
 assert.equal(who.status,200,'Cannot verify authenticated identity');
 assert.equal(who.value?.id,OWNER,'Unexpected TEST identity; never run sale test');
 const opened=await send(c,'/rest/v1/cash_registers?select=id&business_id=eq.'+BIZ+'&location_id=eq.'+LOC+'&status=eq.open',token);
 assert.equal(opened.status,200,'Cannot verify TEST cash register fixture');
 assert.deepEqual(opened.value,[],'An open drawer appeared; cash negative test must not run');
 const id=randomUUID();
 const payload={
   p_sale_id:id,p_business_id:BIZ,p_location_id:LOC,
   p_channel:'In Store',p_payment_method:'Cash',
   p_employee_id:null,p_customer_id:null,p_discount:0,p_tax:0,
   p_notes:'QA_P003_CLOSED_CASH_HTTP_EXPECTED_REJECT',p_fulfillment_status:'Completed',
   p_items:[{product_id:PRODUCT,qty:1,unit_price:23.50}]
 };
 await t.test('server blocks cash sale and no sale or finance row survives',async()=>{
   let result;
   try{
     result=await send(c,'/rest/v1/rpc/fn_create_sale',token,payload);
     assert.ok(result.status>=400 && result.status<500,'Closed cash payment must be HTTP 4xx');
     assert.match(String(result.value?.message||''),/cash register is closed for this location/i,'Server must reject for explicit cash guard');
     const [sales,ledger]=await Promise.all([
       send(c,'/rest/v1/sales?select=id,status&id=eq.'+id,token),
       send(c,'/rest/v1/cash_flow?select=id,sale_id&sale_id=eq.'+id,token)
     ]);
     assert.equal(sales.status,200,'Cannot inspect sales for forbidden ID');
     assert.equal(ledger.status,200,'Cannot inspect cash ledger for forbidden ID');
     assert.deepEqual(sales.value,[],'Rejected sale persisted');
     assert.deepEqual(ledger.value,[],'Rejected cash-flow record persisted');
   }finally{
     // If any regression unexpectedly committed the transaction, compensate
     // immediately within the isolated QA business. Never silently pass.
     const sales=await send(c,'/rest/v1/sales?select=id,status&id=eq.'+id,token);
     if(sales.status===200 && Array.isArray(sales.value) && sales.value.some(s=>s.status!=='cancelled')){
       const reversed=await send(c,'/rest/v1/rpc/fn_reverse_sale',token,{p_sale_id:id});
       assert.equal(reversed.status,200,'Emergency QA-only reversal failed');
     }
   }
 });
});
