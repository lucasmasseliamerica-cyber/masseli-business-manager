import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const TEST_HOST='msinksoilkluooxenecy.supabase.co';
const A={business:'d627563b-2ce4-491d-8cf6-141ef28d0f63',location:'a3e4b2ed-eb00-4963-afd0-38c256aff87d',product:'9efafd84-7f17-4de9-9c9a-1b962ab3e0bc',sku:'QA-CONCURRENCY-A-1125',price:11.25};
const B={business:'3849b750-20f7-4929-8699-737a4e1983c8',location:'1302346c-5197-46cb-a586-f8aeac394789',product:'a4cac86d-038d-418e-b953-9a3605f2df18',sku:'QA-CONCURRENCY-B-2350',price:23.50};
const required=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'];
const missing=required.filter(k=>!process.env[k]);
const skip=process.env.QA_TWO_TENANT_ENABLED!=='true'?'QA_TWO_TENANT_ENABLED not enabled':missing.length?'Missing TEST-only configuration: '+missing.join(', '):false;
function safeConfig(){
 const url=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(url.protocol,'https:');assert.equal(url.hostname,TEST_HOST,'Only isolated Supabase TEST is permitted');
 assert.equal(url.username,'');assert.equal(url.password,'');
 return {url,key:process.env.QA_SUPABASE_ANON_KEY};
}
async function api(conf,path,token,body){
 const response=await fetch(new URL(path,conf.url),{
  method:body===undefined?'GET':'POST',
  headers:{apikey:conf.key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
  redirect:'error',signal:AbortSignal.timeout(20000)
 });
 const raw=await response.text();let value;
 try{value=JSON.parse(raw)}catch{value=raw}
 return {status:response.status,value};
}
async function login(conf,label){
 const r=await api(conf,'/auth/v1/token?grant_type=password',null,
  {email:process.env['QA_TWO_TENANT_'+label+'_EMAIL'],password:process.env['QA_TWO_TENANT_'+label+'_PASSWORD']});
 assert.equal(r.status,200,'QA '+label+' login HTTP '+r.status);
 assert.ok(r.value?.access_token,'Missing dedicated TEST access token '+label);
 return r.value.access_token;
}
function sale(t,overrides={}){
 return {p_sale_id:randomUUID(),p_business_id:t.business,p_location_id:t.location,
  p_channel:'QA_NEGATIVE_GUARD',p_payment_method:'Card',p_employee_id:null,p_customer_id:null,
  p_discount:0,p_tax:0,p_notes:'QA negative test: expected rollback',p_fulfillment_status:'Received',
  p_items:[{product_id:t.product,qty:1,unit_price:t.price}],...overrides};
}
async function denied(t,conf,token,title,rpc,payload){
 await t.test(title,async()=>{
  const r=await api(conf,'/rest/v1/rpc/'+rpc,token,payload);
  assert.ok(r.status>=400&&r.status<500,title+' must reject, got HTTP '+r.status);
 });
}
async function visible(t,conf,token,title,path,expectedLength){
 await t.test(title,async()=>{
  const r=await api(conf,path,token);
  assert.equal(r.status,200,title+' read failed with HTTP '+r.status);
  assert.ok(Array.isArray(r.value),title+' non-array response');
  if(expectedLength!==null)assert.equal(r.value.length,expectedLength,title+' wrong row count');
 });
}
test('authenticated TEST regression: tenant isolation, secure reads, invalid sales, inventory and purchasing', {skip,timeout:120000},async(t)=>{
 const conf=safeConfig();
 const [at,bt]=await Promise.all([login(conf,'A'),login(conf,'B')]);
 // Positive fixture checks prove the test is not passing trivially because every request is denied.
 for(const [label,token,self,foreign] of [['A',at,A,B],['B',bt,B,A]]){
  await t.test('owner '+label+' sees own dedicated fixture product',async()=>{
   const r=await api(conf,'/rest/v1/products?select=id,sku,price,active&id=eq.'+self.product,token);
   assert.equal(r.status,200);
   assert.equal(r.value.length,1);
   assert.equal(r.value[0].sku,self.sku);
   assert.equal(Number(r.value[0].price),self.price);
   assert.equal(r.value[0].active,true);
  });
  await visible(t,conf,token,label+' cannot read other tenant product','/rest/v1/products?select=id&id=eq.'+foreign.product,0);
  await visible(t,conf,token,label+' cannot read other tenant sales','/rest/v1/sales?select=id&business_id=eq.'+foreign.business,0);
  await visible(t,conf,token,label+' cannot read other tenant ledger','/rest/v1/cash_flow?select=id&business_id=eq.'+foreign.business,0);
 }
 // Security-definer read facades are exercised using real owner JWTs.
 for(const [label,token] of [['A',at],['B',bt]]){
  for(const [name,fields] of [
   ['fn_read_employees_secure','id,business_id'],
   ['fn_read_inventory_stock_secure','id,inventory_item_id,location_id'],
   ['fn_read_inventory_transactions_secure','id,inventory_item_id'],
   ['fn_read_sale_items_secure','id,sale_id'],
   ['fn_read_purchase_order_items_secure','id,purchase_order_id'],
   ['fn_read_waste_transactions_secure','id,business_id']
  ]){
   await visible(t,conf,token,label+' reads secure '+name,'/rest/v1/rpc/'+name+'?select='+fields,null);
  }
 }
 await denied(t,conf,at,'A cannot create sale for B','fn_create_sale',sale(B));
 await denied(t,conf,bt,'B cannot create sale for A','fn_create_sale',sale(A));
 await denied(t,conf,bt,'negative sale quantity rejected','fn_create_sale',sale(B,{p_items:[{product_id:B.product,qty:-1,unit_price:B.price}]}));
 await denied(t,conf,bt,'duplicate product in sale rejected','fn_create_sale',sale(B,{p_items:[{product_id:B.product,qty:1,unit_price:B.price},{product_id:B.product,qty:1,unit_price:B.price}]}));
 await denied(t,conf,bt,'empty sale rejected','fn_create_sale',sale(B,{p_items:[]}));
 await denied(t,conf,bt,'negative sale discount rejected','fn_create_sale',sale(B,{p_discount:-1}));
 await denied(t,conf,bt,'invalid location rejected','fn_create_sale',sale(B,{p_location_id:A.location}));
 await denied(t,conf,bt,'invalid product rejected','fn_create_sale',sale(B,{p_items:[{product_id:A.product,qty:1,unit_price:B.price}]}));
 await denied(t,conf,bt,'invalid fulfillment state rejected','fn_create_sale',sale(B,{p_fulfillment_status:'Nonexistent'}));
 const missingId='00000000-0000-4000-8000-000000000001';
 await denied(t,conf,bt,'negative inventory count rejected','fn_adjust_inventory_count',{
  p_business_id:B.business,p_inventory_item_id:missingId,p_location_id:B.location,p_new_qty:-1,p_reason:'QA',p_notes:'QA'});
 await denied(t,conf,at,'stock adjustment of foreign company rejected','fn_adjust_inventory_count',{
  p_business_id:B.business,p_inventory_item_id:missingId,p_location_id:B.location,p_new_qty:1,p_reason:'QA',p_notes:'QA'});
 await denied(t,conf,bt,'transfer zero quantity rejected','fn_transfer_inventory',{
  p_business_id:B.business,p_inventory_item_id:missingId,p_from_location_id:B.location,p_to_location_id:B.location,p_qty:0,p_notes:'QA'});
 await denied(t,conf,bt,'negative inventory waste rejected','fn_record_waste',{
  p_business_id:B.business,p_inventory_item_id:missingId,p_location_id:B.location,p_qty:-1,p_reason:'QA',p_notes:'QA'});
 await denied(t,conf,at,'foreign tenant purchase order rejected','fn_create_purchase_order',{
  p_business_id:B.business,p_supplier_id:missingId,p_location_id:B.location,p_order_date:'2026-10-12',
  p_expected_date:null,p_status:'Draft',p_payment_method:'Card',p_notes:'QA',p_discount:0,p_tax:0,p_items:[]});
 await denied(t,conf,bt,'purchase order without supplier rejected','fn_create_purchase_order',{
  p_business_id:B.business,p_supplier_id:missingId,p_location_id:B.location,p_order_date:'2026-10-12',
  p_expected_date:null,p_status:'Draft',p_payment_method:'Card',p_notes:'QA',p_discount:0,p_tax:0,p_items:[]});
 await denied(t,conf,at,'A cannot create B expense','fn_create_expense',{
  p_business_id:B.business,p_location_id:B.location,p_expense_date:'2026-10-12',p_category:'QA',
  p_vendor:'QA',p_amount:1,p_payment_method:'Card',p_recurring:false,p_notes:'QA'});
 await denied(t,conf,bt,'cannot save profile with empty name','fn_save_user_profile',{
  p_user_id:'88eddcda-d8b5-4474-b5d7-19860dd97fba',p_name:'',p_username:'owner-88eddcda-d8b5-4474-b5d7-19860dd97fba',
  p_role:'OWNER',p_employee_id:null,p_active:true,p_permission_overrides:{}});
 // Forbidden purchase/stock/sale requests above never create records or orders.
 // This suite deliberately avoids destructive successful mutations.
});
