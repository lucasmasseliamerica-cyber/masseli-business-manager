import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const HOST='msinksoilkluooxenecy.supabase.co';
const BIZ='d627563b-2ce4-491d-8cf6-141ef28d0f63';
const LOC='a3e4b2ed-eb00-4963-afd0-38c256aff87d';
const ITEM='30a6d17c-3213-402a-81f7-409d9fb0b507';
const SUPPLIER='f85b4931-6877-4664-969d-0ba59fe4feff';
const PRODUCT='9efafd84-7f17-4de9-9c9a-1b962ab3e0bc';
const required=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD'];
const missing=required.filter(k=>!process.env[k]);
const skip=process.env.QA_TWO_TENANT_ENABLED!=='true'?'TEST gate inactive':missing.length?'Missing TEST env: '+missing.join(', '):false;
function config(){
 const url=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(url.protocol,'https:');assert.equal(url.hostname,HOST,'Production prohibited');
 assert.equal(url.username,'');assert.equal(url.password,'');
 return {url,key:process.env.QA_SUPABASE_ANON_KEY};
}
async function request(c,path,token,payload){
 const resp=await fetch(new URL(path,c.url),{
  method:payload===undefined?'GET':'POST',
  headers:{apikey:c.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
  ...(payload===undefined?{}:{body:JSON.stringify(payload)}),
  redirect:'error',signal:AbortSignal.timeout(20000)
 });
 const raw=await resp.text();let value;try{value=JSON.parse(raw)}catch{value=raw}
 return {status:resp.status,value};
}
const po=(overrides={})=>({
 p_business_id:BIZ,p_supplier_id:SUPPLIER,p_location_id:LOC,p_order_date:'2026-10-12',p_expected_date:null,
 p_status:'Draft',p_payment_method:'Card',p_notes:'QA expected error, never persist',p_discount:0,p_tax:0,
 p_items:[{inventory_item_id:ITEM,qty:2,unit_cost:2}],...overrides
});
const sale=(overrides={})=>({
 p_sale_id:randomUUID(),p_business_id:BIZ,p_location_id:LOC,p_channel:'QA',
 p_payment_method:'Card',p_employee_id:null,p_customer_id:null,p_discount:0,p_tax:0,
 p_notes:'QA expected error, never persist',p_fulfillment_status:'Received',
 p_items:[{product_id:PRODUCT,qty:1,unit_price:11.25}],...overrides
});
const scenarios=[
 {name:'purchase duplicate inventory line',rpc:'fn_create_purchase_order',
  payload:()=>po({p_items:[{inventory_item_id:ITEM,qty:1,unit_cost:2},{inventory_item_id:ITEM,qty:1,unit_cost:2}]}),
  reason:/duplicate inventory items/},
 {name:'purchase zero quantity',rpc:'fn_create_purchase_order',
  payload:()=>po({p_items:[{inventory_item_id:ITEM,qty:0,unit_cost:2}]}),
  reason:/qty > 0/},
 {name:'purchase negative unit cost',rpc:'fn_create_purchase_order',
  payload:()=>po({p_items:[{inventory_item_id:ITEM,qty:2,unit_cost:-1}]}),
  reason:/unit_cost >= 0/},
 {name:'purchase empty lines',rpc:'fn_create_purchase_order',
  payload:()=>po({p_items:[]}),reason:/at least one purchase item/},
 {name:'purchase discount greater than total',rpc:'fn_create_purchase_order',
  payload:()=>po({p_discount:99}),reason:/grand total cannot be negative/},
 {name:'purchase invalid initial status',rpc:'fn_create_purchase_order',
  payload:()=>po({p_status:'Received'}),reason:/must start as Draft or Ordered/},
 {name:'purchase tax negative',rpc:'fn_create_purchase_order',
  payload:()=>po({p_tax:-1}),reason:/discount and tax cannot be negative/},
 {name:'sale negative total from excess discount',rpc:'fn_create_sale',
  payload:()=>sale({p_discount:500}),reason:/sale total cannot be negative/},
 {name:'sale missing payment method',rpc:'fn_create_sale',
  payload:()=>sale({p_payment_method:''}),reason:/payment method is required/},
 {name:'sale missing channel',rpc:'fn_create_sale',
  payload:()=>sale({p_channel:''}),reason:/sales channel is required/},
 {name:'sale missing customer reference',rpc:'fn_create_sale',
  payload:()=>sale({p_customer_id:'00000000-0000-4000-8000-000000000001'}),reason:/customer not found/},
 {name:'sale negative tax',rpc:'fn_create_sale',
  payload:()=>sale({p_tax:-1}),reason:/discount and tax cannot be negative/},
 {name:'inventory counted quantity negative',rpc:'fn_adjust_inventory_count',
  payload:()=>({p_business_id:BIZ,p_inventory_item_id:ITEM,p_location_id:LOC,p_new_qty:-1,p_reason:'QA',p_notes:'negative-only'}),
  reason:/counted quantity cannot be negative/},
 {name:'transfer same source and destination',rpc:'fn_transfer_inventory',
  payload:()=>({p_business_id:BIZ,p_inventory_item_id:ITEM,p_from_location_id:LOC,p_to_location_id:LOC,p_qty:1,p_notes:'negative-only'}),
  reason:/source and destination locations must differ/},
 {name:'inventory waste negative',rpc:'fn_record_waste',
  payload:()=>({p_business_id:BIZ,p_inventory_item_id:ITEM,p_location_id:LOC,p_qty:-1,p_reason:'QA',p_notes:'negative-only'}),
  reason:/waste quantity must be greater than zero/},
 {name:'cash register negative opening',rpc:'fn_open_cash_register',
  payload:()=>({p_business_id:BIZ,p_location_id:LOC,p_opening_cash:-1,p_notes:'negative-only'}),
  reason:/opening cash must be zero or a positive amount/},
 {name:'expense negative amount',rpc:'fn_create_expense',
  payload:()=>({p_business_id:BIZ,p_location_id:LOC,p_expense_date:'2026-10-12',p_category:'QA',p_vendor:'QA',
   p_amount:-1,p_payment_method:'Card',p_recurring:false,p_notes:'negative-only'}),
  reason:/expense amount must be greater than zero/}
];
test('P0 QA transaction safeguards: reject invalid cash, sale, purchase and inventory requests', {skip,timeout:120000},async t=>{
 const c=config();
 const auth=await request(c,'/auth/v1/token?grant_type=password',null,{
  email:process.env.QA_TWO_TENANT_A_EMAIL,password:process.env.QA_TWO_TENANT_A_PASSWORD
 });
 assert.equal(auth.status,200,'TEST login failed');
 const jwt=auth.value?.access_token;assert.ok(jwt);
 for(const [table,id] of [['inventory_items',ITEM],['suppliers',SUPPLIER],['products',PRODUCT]]){
  const r=await request(c,'/rest/v1/'+table+'?select=id&id=eq.'+id,jwt);
  assert.equal(r.status,200);assert.equal(r.value.length,1,'Missing required fictitious QA fixture '+table);
 }
 const register=await request(c,'/rest/v1/cash_registers?select=id&business_id=eq.'+BIZ+'&location_id=eq.'+LOC+'&status=eq.open',jwt);
 assert.equal(register.status,200);assert.equal(register.value.length,0,'TEST fixture requires closed cash register');
 for(const scenario of scenarios){
  await t.test(scenario.name,async()=>{
   const response=await request(c,'/rest/v1/rpc/'+scenario.rpc,jwt,scenario.payload());
   assert.ok(response.status>=400&&response.status<500,'Must reject '+scenario.name+', HTTP '+response.status);
   assert.match(String(response.value?.message||''),scenario.reason,'Incorrect validation cause for '+scenario.name);
  });
 }
});
