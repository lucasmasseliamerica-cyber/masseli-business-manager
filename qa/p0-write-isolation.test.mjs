import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const HOST='msinksoilkluooxenecy.supabase.co';
const A={business:'d627563b-2ce4-491d-8cf6-141ef28d0f63',location:'a3e4b2ed-eb00-4963-afd0-38c256aff87d',product:'9efafd84-7f17-4de9-9c9a-1b962ab3e0bc'};
const B={business:'3849b750-20f7-4929-8699-737a4e1983c8',location:'1302346c-5197-46cb-a586-f8aeac394789',product:'a4cac86d-038d-418e-b953-9a3605f2df18'};
const env=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'];
const missing=env.filter(key=>!process.env[key]);
const skip=process.env.QA_TWO_TENANT_ENABLED!=='true'?'TEST two-tenant gate not enabled':missing.length?'TEST configuration missing: '+missing.join(', '):false;
const unknown='00000000-0000-4000-8000-000000000001';
function config(){
 const url=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(url.protocol,'https:');
 assert.equal(url.hostname,HOST,'Only isolated TEST is allowed');
 assert.equal(url.username,'');assert.equal(url.password,'');
 return {url,key:process.env.QA_SUPABASE_ANON_KEY};
}
async function send(c,path,token,body){
 const r=await fetch(new URL(path,c.url),{method:body===undefined?'GET':'POST',
  headers:{apikey:c.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000),redirect:'error'});
 const raw=await r.text();let value;try{value=JSON.parse(raw)}catch{value=raw}
 return {status:r.status,value};
}
async function token(c,label){
 const r=await send(c,'/auth/v1/token?grant_type=password',null,
  {email:process.env['QA_TWO_TENANT_'+label+'_EMAIL'],password:process.env['QA_TWO_TENANT_'+label+'_PASSWORD']});
 assert.equal(r.status,200,'QA login '+label+' failed');
 assert.ok(r.value?.access_token);
 return r.value.access_token;
}
const scenarios=[
 {name:'inventory adjustment',rpc:'fn_adjust_inventory_count',payload:t=>({
  p_business_id:t.business,p_inventory_item_id:unknown,p_location_id:t.location,
  p_new_qty:-1,p_reason:'QA_FORBIDDEN',p_notes:'read-only negative case'})},
 {name:'inventory transfer',rpc:'fn_transfer_inventory',payload:t=>({
  p_business_id:t.business,p_inventory_item_id:unknown,p_from_location_id:t.location,
  p_to_location_id:t.location,p_qty:0,p_notes:'QA_FORBIDDEN'})},
 {name:'waste',rpc:'fn_record_waste',payload:t=>({
  p_business_id:t.business,p_inventory_item_id:unknown,p_location_id:t.location,
  p_qty:-1,p_reason:'QA_FORBIDDEN',p_notes:'read-only negative case'})},
 {name:'purchase order',rpc:'fn_create_purchase_order',payload:t=>({
  p_business_id:t.business,p_supplier_id:unknown,p_location_id:t.location,p_order_date:'2026-10-12',
  p_expected_date:null,p_status:'Draft',p_payment_method:'Card',p_notes:'QA_FORBIDDEN',p_discount:0,p_tax:0,p_items:[]})},
 {name:'expense',rpc:'fn_create_expense',payload:t=>({
  p_business_id:t.business,p_location_id:t.location,p_expense_date:'2026-10-12',
  p_category:'QA',p_vendor:'QA',p_amount:-1,p_payment_method:'Card',p_recurring:false,p_notes:'QA_FORBIDDEN'})},
 {name:'cash register',rpc:'fn_open_cash_register',payload:t=>({
  p_business_id:t.business,p_location_id:t.location,p_opening_cash:-1,p_notes:'QA_FORBIDDEN'})},
 {name:'product upsert',rpc:'fn_save_product',payload:t=>({
  p_business_id:t.business,p_product_id:randomUUID(),p_operation:'upsert',
  p_name:'QA FORBIDDEN',p_sku:'QA-NEVER-SAVE',p_category:'QA',p_price:-1,p_active:true,
  p_description:'no-write',p_image_url:null,p_recipe:[]})},
 {name:'sale create',rpc:'fn_create_sale',payload:t=>({
  p_sale_id:randomUUID(),p_business_id:t.business,p_location_id:t.location,
  p_channel:'QA_FORBIDDEN',p_payment_method:'Card',p_employee_id:null,p_customer_id:null,
  p_discount:0,p_tax:0,p_notes:'QA_FORBIDDEN',p_fulfillment_status:'Received',
  p_items:[{product_id:t.product,qty:-1,unit_price:11.25}]})}
];
test('P0 cross-company privileged operations must specifically reject with business_id mismatch',{skip,timeout:120000},async t=>{
 const c=config();
 const [a,b]=await Promise.all([token(c,'A'),token(c,'B')]);
 for(const [actor,auth,target] of [['A',a,B],['B',b,A]]){
  for(const s of scenarios){
   await t.test(actor+' cannot operate on foreign '+s.name,async()=>{
    const r=await send(c,'/rest/v1/rpc/'+s.rpc,auth,s.payload(target));
    assert.ok(r.status>=400&&r.status<500,'expected forbidden 4xx: '+s.name+', got '+r.status);
    assert.match(String(r.value?.message||''),/business_id mismatch/i,
      'RPC must deny at business ownership gate, not merely reject invalid fixture arguments; '+s.name);
   });
  }
 }
});
