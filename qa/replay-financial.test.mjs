import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const HOST='msinksoilkluooxenecy.supabase.co';
const need=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'];
const missing=need.filter(k=>!process.env[k]);
const skip=process.env.QA_TWO_TENANT_ENABLED!=='true'?'TEST write gate disabled':missing.length?'Missing '+missing.join(', '):false;
function conf(){
 const url=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(url.hostname,HOST,'PRODUCTION WRITES PROHIBITED');assert.equal(url.protocol,'https:');
 assert.equal(url.username,'');assert.equal(url.password,'');
 return {url,key:process.env.QA_SUPABASE_ANON_KEY};
}
async function request(c,path,token,body){
 const response=await fetch(new URL(path,c.url),{method:body===undefined?'GET':'POST',
  headers:{apikey:c.key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000),redirect:'error'});
 const raw=await response.text();let value;try{value=JSON.parse(raw)}catch{value=raw}
 return {status:response.status,value};
}
test('TEST: replay after dropped application response is idempotent; discount and tax ledger balance', {skip,timeout:120000},async t=>{
 const c=conf();
 const login=await request(c,'/auth/v1/token?grant_type=password',null,{email:process.env.QA_TWO_TENANT_B_EMAIL,password:process.env.QA_TWO_TENANT_B_PASSWORD});
 assert.equal(login.status,200);const token=login.value.access_token;assert.ok(token);
 const business='3849b750-20f7-4929-8699-737a4e1983c8',location='1302346c-5197-46cb-a586-f8aeac394789',product='a4cac86d-038d-418e-b953-9a3605f2df18';
 const preflight=await request(c,'/rest/v1/products?select=id,price,sku,active&id=eq.'+product,token);
 assert.equal(preflight.status,200);assert.equal(preflight.value.length,1);
 assert.equal(preflight.value[0].sku,'QA-CONCURRENCY-B-2350');assert.equal(Number(preflight.value[0].price),23.50);
 const id=randomUUID(),payload={
  p_sale_id:id,p_business_id:business,p_location_id:location,
  p_channel:'QA_LOST_RESPONSE',p_payment_method:'Card',p_employee_id:null,p_customer_id:null,
  p_discount:1.25,p_tax:0.75,p_notes:'AUTOMATED_QA_LOST_RESPONSE_'+id,
  p_fulfillment_status:'Received',p_items:[{product_id:product,qty:1,unit_price:23.50}]
 };
 let error;
 try{
  const initial=await request(c,'/rest/v1/rpc/fn_create_sale',token,payload);
  assert.equal(initial.status,200,'Initial TEST write failed');
  // Simulates client application losing the response payload after write: deliberately discard initial.value.
  await t.test('resend exactly the same sale ID and recover the already-committed sale',async()=>{
   const replay=await request(c,'/rest/v1/rpc/fn_create_sale',token,payload);
   assert.equal(replay.status,200,'Idempotent retry failed');
   assert.equal(replay.value.id,id);
   assert.equal(Number(replay.value.total),23.00);
  });
  await t.test('cash ledger and sale items remain unique after retry',async()=>{
   const [sales,items,flow]=await Promise.all([
    request(c,'/rest/v1/sales?select=id,subtotal,discount,tax,total,business_id&id=eq.'+id,token),
    request(c,'/rest/v1/rpc/fn_read_sale_items_secure?select=id,sale_id,qty,unit_price&sale_id=eq.'+id,token),
    request(c,'/rest/v1/cash_flow?select=id,amount,type,business_id&sale_id=eq.'+id,token)
   ]);
   for(const r of [sales,items,flow])assert.equal(r.status,200);
   assert.equal(sales.value.length,1);assert.equal(items.value.length,1);assert.equal(flow.value.length,1);
   assert.equal(Number(sales.value[0].subtotal),23.50);
   assert.equal(Number(sales.value[0].discount),1.25);
   assert.equal(Number(sales.value[0].tax),0.75);
   assert.equal(Number(sales.value[0].total),23.00);
   assert.equal(Number(flow.value[0].amount),23.00);
   assert.equal(flow.value[0].type,'income');assert.equal(flow.value[0].business_id,business);
  });
  await t.test('replay same sale ID with changed financial payload cannot mutate committed sale',async()=>{
   const altered={...payload,p_discount:0,p_tax:0,p_notes:'QA MUTATED RETRY'};
   const replay=await request(c,'/rest/v1/rpc/fn_create_sale',token,altered);
   assert.equal(replay.status,200,'Idempotent changed-payload request must not create a second sale');
   assert.equal(replay.value.id,id);
   assert.equal(Number(replay.value.total),23,'Committed total must remain unchanged');
   const ledger=await request(c,'/rest/v1/cash_flow?select=id,amount&sale_id=eq.'+id,token);
   assert.equal(ledger.status,200);assert.equal(ledger.value.length,1,'Retry cannot double-post income');
   assert.equal(Number(ledger.value[0].amount),23);
  });
 }catch(e){error=e}
 finally{
  const sales=await request(c,'/rest/v1/sales?select=id,status&id=eq.'+id,token);
  assert.equal(sales.status,200,'Cannot verify TEST cleanup');
  if(sales.value.length&&sales.value[0].status!=='cancelled'){
   const reversal=await request(c,'/rest/v1/rpc/fn_reverse_sale',token,{p_sale_id:id});
   assert.equal(reversal.status,200,'TEST cleanup reversal failed: '+JSON.stringify(reversal.value).slice(0,200));
   assert.equal(reversal.value.status,'cancelled');
  }
 }
 if(error)throw error;
 await t.test('sale reversal creates exactly one offsetting refund and a zero-net ledger',async()=>{
   const [sales,ledger]=await Promise.all([
     request(c,'/rest/v1/sales?select=id,status,cancelled_at,total&id=eq.'+id,token),
     request(c,'/rest/v1/cash_flow?select=id,type,category,amount,payment_method,sale_id&sale_id=eq.'+id,token)
   ]);
   assert.equal(sales.status,200);assert.equal(ledger.status,200);
   assert.equal(sales.value.length,1);assert.equal(sales.value[0].status,'cancelled');
   assert.ok(sales.value[0].cancelled_at,'Reversal must set cancelled_at');
   assert.equal(ledger.value.length,2,'Exactly one sale and one offsetting refund');
   const income=ledger.value.filter(x=>x.type==='income');
   const refund=ledger.value.filter(x=>x.type==='expense'&&x.category==='Sale Cancellation');
   assert.equal(income.length,1);assert.equal(refund.length,1);
   assert.equal(Number(income[0].amount),23);
   assert.equal(Number(refund[0].amount),23);
   assert.equal(Number(income[0].amount)-Number(refund[0].amount),0);
 });
 await t.test('second reversal is rejected without producing another refund',async()=>{
   const again=await request(c,'/rest/v1/rpc/fn_reverse_sale',token,{p_sale_id:id});
   assert.ok(again.status>=400&&again.status<500,'Repeated sale cancellation must be rejected');
   assert.match(String(again.value?.message||''),/sale already cancelled/i);
   const ledger=await request(c,'/rest/v1/cash_flow?select=id&sale_id=eq.'+id,token);
   assert.equal(ledger.status,200);assert.equal(ledger.value.length,2,'No duplicate refund on repeat');
 });
 await t.test('late replay of cancelled sale must not reactivate sale or ledger',async()=>{
   const late=await request(c,'/rest/v1/rpc/fn_create_sale',token,payload);
   assert.ok(late.status===200||(late.status>=400&&late.status<500),'Unexpected late retry response '+late.status);
   if(late.status===200){
    assert.equal(late.value.id,id);
    assert.equal(late.value.status,'cancelled','Late replay must remain cancelled');
   }
   const [sales,ledger]=await Promise.all([
    request(c,'/rest/v1/sales?select=id,status&id=eq.'+id,token),
    request(c,'/rest/v1/cash_flow?select=id,amount,type&sale_id=eq.'+id,token)
   ]);
   assert.equal(sales.status,200);assert.equal(sales.value.length,1);
   assert.equal(sales.value[0].status,'cancelled');
   assert.equal(ledger.status,200);assert.equal(ledger.value.length,2,'Late replay must not alter refund or duplicate ledger');
 });
});
