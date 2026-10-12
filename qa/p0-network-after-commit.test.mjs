import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';

const TEST_HOST='msinksoilkluooxenecy.supabase.co';
const required=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD'];
const missing=required.filter(k=>!process.env[k]);
const skip=process.env.QA_TWO_TENANT_ENABLED!=='true'?'TEST gate disabled':missing.length?'missing isolated TEST configuration: '+missing.join(', '):false;
const A={business:'d627563b-2ce4-491d-8cf6-141ef28d0f63',
 location:'a3e4b2ed-eb00-4963-afd0-38c256aff87d',
 product:'9efafd84-7f17-4de9-9c9a-1b962ab3e0bc',
 supplier:'f85b4931-6877-4664-969d-0ba59fe4feff',
 stock:'30a6d17c-3213-402a-81f7-409d9fb0b507'};
function config(){
 const url=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(url.protocol,'https:');assert.equal(url.hostname,TEST_HOST,'PRODUCTION ACCESS FORBIDDEN');
 assert.equal(url.username,'');assert.equal(url.password,'');
 return {url,key:process.env.QA_SUPABASE_ANON_KEY};
}
async function api(c,path,token,body){
 const r=await fetch(new URL(path,c.url),{
  method:body===undefined?'GET':'POST',
  headers:{apikey:c.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  redirect:'error',signal:AbortSignal.timeout(20000)
 });
 const raw=await r.text();let value;
 try{value=JSON.parse(raw)}catch{value=raw}
 return {status:r.status,value};
}
// A local, temporary fault-injection proxy sends exactly one real HTTP request to
// Supabase TEST, waits until the upstream response has been fully received (commit
// confirmed by 2xx), then destroys the downstream socket before the client gets it.
// This is different from discarding an application response object or timing out
// an upstream request whose commit status would be unknowable.
async function loseConfirmedResponse(c,endpoint,token,payload){
 let confirmed=false,forwardCount=0;
 const server=createServer(async(req,res)=>{
  forwardCount++;
  try{
   assert.equal(req.method,'POST');
   assert.equal(req.url,'/write');
   const result=await api(c,endpoint,token,payload);
   if(result.status!==200){
    res.writeHead(502,{'Content-Type':'application/json'});
    res.end(JSON.stringify({upstreamStatus:result.status,reason:result.value?.message||'upstream rejected'}));
    return;
   }
   confirmed=true;
   res.destroy(new Error('QA post-commit response lost'));
  }catch(err){
   if(!res.destroyed){res.writeHead(502);res.end(String(err.message))}
  }
 });
 try{
  await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(0,'127.0.0.1',resolve);
  });
  const port=server.address().port;
  await assert.rejects(async()=>{
   const res=await fetch('http://127.0.0.1:'+port+'/write',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({qa:true}),signal:AbortSignal.timeout(25000)
   });
   if(res.ok)throw Error('Unexpected success response from fault injection proxy');
   const detail=await res.text();
   throw new Error('Proxy returned a response, not a simulated network loss: '+res.status+' '+detail.slice(0,130));
  },err=>Boolean(err),'Client must observe a network failure');
  assert.equal(confirmed,true,'Fault injection must only occur after confirmed upstream commit');
  assert.equal(forwardCount,1,'Fault proxy must send exactly one upstream write');
 }finally{
  await new Promise(resolve=>server.close(resolve));
 }
}
test('P0.06 TEST: real HTTP response cut after sale and purchase commit, reconciliation and safe cleanup',{skip,timeout:180000},async t=>{
 const c=config();
 const auth=await api(c,'/auth/v1/token?grant_type=password',null,{
  email:process.env.QA_TWO_TENANT_A_EMAIL,password:process.env.QA_TWO_TENANT_A_PASSWORD
 });
 assert.equal(auth.status,200,'QA owner login failed');
 const token=auth.value.access_token;assert.ok(token);
 for(const [table,id] of [['products',A.product],['inventory_items',A.stock],['suppliers',A.supplier]]){
  const fixture=await api(c,'/rest/v1/'+table+'?select=id&id=eq.'+id,token);
  assert.equal(fixture.status,200);assert.equal(fixture.value.length,1,'TEST-only fixture missing: '+table);
 }
 const saleId=randomUUID(),purchaseMarker='QA_NETWORK_RECOVERY_'+randomUUID();
 const sale={
  p_sale_id:saleId,p_business_id:A.business,p_location_id:A.location,p_channel:'QA_NETWORK_CUT',
  p_payment_method:'Card',p_employee_id:null,p_customer_id:null,p_discount:0,p_tax:0,
  p_notes:'QA post-commit network cut '+saleId,p_fulfillment_status:'Received',
  p_items:[{product_id:A.product,qty:1,unit_price:11.25}]
 };
 const purchase={
  p_business_id:A.business,p_supplier_id:A.supplier,p_location_id:A.location,
  p_order_date:'2026-10-12',p_expected_date:null,p_status:'Draft',p_payment_method:'Card',
  p_notes:purchaseMarker,p_discount:0,p_tax:0,p_items:[{inventory_item_id:A.stock,qty:1,unit_cost:1}]
 };
 let saleCommitted=false,purchaseId=null;
 try{
  await t.test('sale: client sees network failure after committed POST',async()=>{
   await loseConfirmedResponse(c,'/rest/v1/rpc/fn_create_sale',token,sale);
   saleCommitted=true;
  });
  await t.test('sale: recover by stable ID, retry and confirm exactly one posting',async()=>{
   const found=await api(c,'/rest/v1/sales?select=id,status,total&id=eq.'+saleId,token);
   assert.equal(found.status,200);assert.equal(found.value.length,1);
   assert.equal(Number(found.value[0].total),11.25);
   const retry=await api(c,'/rest/v1/rpc/fn_create_sale',token,sale);
   assert.equal(retry.status,200);assert.equal(retry.value.id,saleId);
   const ledger=await api(c,'/rest/v1/cash_flow?select=id,amount,type&sale_id=eq.'+saleId,token);
   assert.equal(ledger.status,200);assert.equal(ledger.value.length,1);
   assert.equal(Number(ledger.value[0].amount),11.25);
  });
  await t.test('purchase: client sees network failure after committed POST',async()=>{
   await loseConfirmedResponse(c,'/rest/v1/rpc/fn_create_purchase_order',token,purchase);
  });
  await t.test('purchase: uniquely reconcile committed draft; do not blindly replay',async()=>{
   const encoded=encodeURIComponent(purchaseMarker);
   const found=await api(c,'/rest/v1/purchase_orders?select=id,status,notes&business_id=eq.'+A.business+'&notes=eq.'+encoded,token);
   assert.equal(found.status,200);
   assert.equal(found.value.length,1,'Must reconcile exactly one new purchase order');
   purchaseId=found.value[0].id;
   assert.equal(found.value[0].status,'Draft');
   const items=await api(c,'/rest/v1/rpc/fn_read_purchase_order_items_secure?select=id,purchase_order_id,qty_ordered&purchase_order_id=eq.'+purchaseId,token);
   assert.equal(items.status,200);assert.equal(items.value.length,1);
   assert.equal(Number(items.value[0].qty_ordered),1);
  });
 }finally{
  // Both QA objects are left with auditable, non-operational terminal states.
  // A cleanup failure intentionally fails CI rather than silently leaving live drafts.
  if(purchaseId){
   const cancelled=await api(c,'/rest/v1/rpc/fn_cancel_purchase_order',token,{p_purchase_order_id:purchaseId});
   assert.equal(cancelled.status,200,'Cannot cancel QA purchase after fault-injection');
   assert.equal(cancelled.value.status,'Cancelled');
  }else{
   const found=await api(c,'/rest/v1/purchase_orders?select=id,status&business_id=eq.'+A.business+'&notes=eq.'+encodeURIComponent(purchaseMarker),token);
   assert.equal(found.status,200,'Cannot reconcile QA purchase for cleanup');
   for(const po of found.value){
    if(po.status!=='Cancelled'){
     const cancel=await api(c,'/rest/v1/rpc/fn_cancel_purchase_order',token,{p_purchase_order_id:po.id});
     assert.equal(cancel.status,200,'Cannot clean up QA purchase');
    }
   }
  }
  if(saleCommitted){
   const result=await api(c,'/rest/v1/sales?select=id,status&id=eq.'+saleId,token);
   assert.equal(result.status,200,'Cannot reconcile QA sale for cleanup');
   if(result.value.length&&result.value[0].status!=='cancelled'){
    const reversal=await api(c,'/rest/v1/rpc/fn_reverse_sale',token,{p_sale_id:saleId});
    assert.equal(reversal.status,200,'Cannot reverse QA sale');
    assert.equal(reversal.value.status,'cancelled');
   }
  }
 }
 await t.test('cleanup: sale cancelled once and order cancelled without extra writes',async()=>{
  const [sales,ledger,purchaseOrders]=await Promise.all([
   api(c,'/rest/v1/sales?select=id,status&id=eq.'+saleId,token),
   api(c,'/rest/v1/cash_flow?select=id,type,amount&sale_id=eq.'+saleId,token),
   api(c,'/rest/v1/purchase_orders?select=id,status&business_id=eq.'+A.business+'&notes=eq.'+encodeURIComponent(purchaseMarker),token)
  ]);
  assert.equal(sales.status,200);assert.equal(sales.value.length,1);assert.equal(sales.value[0].status,'cancelled');
  assert.equal(ledger.status,200);assert.equal(ledger.value.length,2,'One income and one reversal, no duplicate');
  assert.equal(purchaseOrders.status,200);assert.equal(purchaseOrders.value.length,1);
  assert.equal(purchaseOrders.value[0].status,'Cancelled');
 });
});
