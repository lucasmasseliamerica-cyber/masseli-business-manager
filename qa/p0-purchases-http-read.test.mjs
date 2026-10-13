import test from 'node:test';
import assert from 'node:assert/strict';

// P0.05 — read-only HTTP test with real isolated TEST owner tokens.
// Forbidden to write data. The same secure GET RPCs are used by the frontend.
const HOST='msinksoilkluooxenecy.supabase.co';
const A_BUSINESS='d627563b-2ce4-491d-8cf6-141ef28d0f63';
const A_OWNER='f37e9907-47c4-48bf-94b7-9a6fa5de1f88';
const B_BUSINESS='3849b750-20f7-4929-8699-737a4e1983c8';
const B_OWNER='88eddcda-d8b5-4474-b5d7-19860dd97fba';
const secrets=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'];
const absent=secrets.filter(n=>!process.env[n]);
const skip=process.env.QA_TWO_TENANT_ENABLED!=='true'?'QA two-tenant disabled':absent.length?'Missing TEST environment: '+absent.join(', '):false;

function setup(){
 const base=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(base.protocol,'https:');
 assert.equal(base.hostname,HOST,'Unsafe: HTTP reads MUST target isolated Supabase TEST');
 assert.equal(base.username,'');assert.equal(base.password,'');
 return {base,key:process.env.QA_SUPABASE_ANON_KEY};
}
async function request(c,path,token=null,payload=null){
 const response=await fetch(new URL(path,c.base),{
  method:payload==null?'GET':'POST',
  headers:{apikey:c.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
  ...(payload==null?{}:{body:JSON.stringify(payload)}),
  redirect:'error',signal:AbortSignal.timeout(22000)
 });
 const raw=await response.text();let data;
 try{data=JSON.parse(raw)}catch{data=raw}
 return {status:response.status,data};
}
async function login(c, email,password,expected){
 const v=await request(c,'/auth/v1/token?grant_type=password',null,{email,password});
 assert.equal(v.status,200,'TEST login was denied');
 const jwt=v.data?.access_token;assert.ok(jwt,'No TEST JWT');
 const who=await request(c,'/auth/v1/user',jwt);
 assert.equal(who.status,200);
 assert.equal(who.data?.id,expected,'Unexpected identity; abort cross-tenant checks');
 return jwt;
}
test('P0.05 real HTTP: purchase lines use tenant-safe cost-redacted read RPC',{skip,timeout:90000},async t=>{
 const c=setup();
 const [a,b]=await Promise.all([
  login(c,process.env.QA_TWO_TENANT_A_EMAIL,process.env.QA_TWO_TENANT_A_PASSWORD,A_OWNER),
  login(c,process.env.QA_TWO_TENANT_B_EMAIL,process.env.QA_TWO_TENANT_B_PASSWORD,B_OWNER)
 ]);
 let qaAOrderId='';
 await t.test('owner A has existing TEST purchase orders and securely readable line items',async()=>{
  const po=await request(c,'/rest/v1/purchase_orders?select=id,business_id&business_id=eq.'+A_BUSINESS+'&order=order_date.desc&limit=100',a);
  assert.equal(po.status,200);
  assert.ok(Array.isArray(po.data) && po.data.length>0,'QA A fixture must contain purchase orders');
  assert.ok(po.data.every(v=>v.business_id===A_BUSINESS));
  qaAOrderId=po.data[0].id;
  const lines=await request(c,'/rest/v1/rpc/fn_read_purchase_order_items_secure?select=id,purchase_order_id,unit_cost,received_qty&purchase_order_id=eq.'+qaAOrderId,a);
  assert.equal(lines.status,200,'Secure read of TEST purchase lines failed');
  assert.ok(Array.isArray(lines.data)&&lines.data.length>0,'QA purchase fixture has no detail lines');
  assert.ok(lines.data.every(v=>v.purchase_order_id===qaAOrderId));
  assert.ok(lines.data.every(v=>v.unit_cost!=null),'Authorized TEST OWNER A must see line costs');
 });
 await t.test('direct all-column access to purchase lines remains restricted',async()=>{
  const raw=await request(c,'/rest/v1/purchase_order_items?select=*&purchase_order_id=eq.'+qaAOrderId,a);
  assert.ok(raw.status>=400&&raw.status<500,'Direct select=* must not bypass restricted unit-cost privileges');
 });
 await t.test('owner B cannot see company A orders or line details',async()=>{
  const orders=await request(c,'/rest/v1/purchase_orders?select=id,business_id&business_id=eq.'+A_BUSINESS,b);
  assert.equal(orders.status,200);
  assert.deepEqual(orders.data,[],'Cross-business purchase order leaked');
  const lines=await request(c,'/rest/v1/rpc/fn_read_purchase_order_items_secure?select=id,purchase_order_id,unit_cost&purchase_order_id=eq.'+qaAOrderId,b);
  assert.equal(lines.status,200);
  assert.deepEqual(lines.data,[],'Cross-business purchase line leaked');
 });
 await t.test('secure lines and permitted payment history remain readable without a mutation',async()=>{
  const all=await request(c,'/rest/v1/rpc/fn_read_purchase_order_items_secure?select=id,purchase_order_id,unit_cost&limit=500',a);
  assert.equal(all.status,200);
  assert.ok(all.data.length>0,'No own-business purchase lines returned');
  const ledger=await request(c,'/rest/v1/purchase_order_payments?select=id,purchase_order_id,status&purchase_order_id=eq.'+qaAOrderId,a);
  assert.equal(ledger.status,200,'Payment history must be readable for an authorized owner');
  assert.ok(Array.isArray(ledger.data));
  const bSelf=await request(c,'/rest/v1/purchase_orders?select=id,business_id&business_id=eq.'+B_BUSINESS,b);
  assert.equal(bSelf.status,200);
  assert.ok(Array.isArray(bSelf.data));
 });
});
