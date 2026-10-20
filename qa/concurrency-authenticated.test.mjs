import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const EXPECTED_HOST='msinksoilkluooxenecy.supabase.co';
const enabled=process.env.QA_TWO_TENANT_ENABLED==='true';
const needed=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'];
const missing=needed.filter(k=>!process.env[k]);
const skipReason=process.env.NEXALVO_PERSISTENT_QA_AUTHORIZED!=='TEST_ONLY_EXPLICIT'?'BLOCKED: explicit TEST write authorization required':!enabled?'Not run: QA_TWO_TENANT_ENABLED is not true (no write permission granted)':
 missing.length?'Not run: missing dedicated QA fixture/credentials: '+missing.join(', '):false;
function config(){
 const base=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(base.protocol,'https:');
 assert.equal(base.hostname,EXPECTED_HOST,'REFUSING non-TEST project');
 assert.equal(base.username,'');
 assert.equal(base.password,'');
 return {base,key:process.env.QA_SUPABASE_ANON_KEY};
}
async function authenticate(base,key){
 const response=await fetch(new URL('/auth/v1/token?grant_type=password',base),{
  method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
  body:JSON.stringify({email:process.env.QA_TWO_TENANT_B_EMAIL,password:process.env.QA_TWO_TENANT_B_PASSWORD}),
  signal:AbortSignal.timeout(15000),redirect:'error'
 });
 assert.equal(response.status,200,'Dedicated QA account login failed: '+response.status);
 const auth=await response.json();
 assert.ok(auth.access_token,'TEST QA access token missing');
 return auth.access_token;
}
async function call(base,key,token,path,options={}){
 const response=await fetch(new URL(path,base),{
  ...options,
  headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})},
  signal:AbortSignal.timeout(25000),redirect:'error'
 });
 const body=await response.text();
 let value;try{value=JSON.parse(body)}catch{value=body}
 return {status:response.status,value};
}
test('ten parallel authenticated retries create exactly one sale and one payment entry', {skip:skipReason,timeout:120000},async()=>{
 const {base,key}=config();
 const token=await authenticate(base,key);
 const business='3849b750-20f7-4929-8699-737a4e1983c8';
 const location='1302346c-5197-46cb-a586-f8aeac394789';
 const product='a4cac86d-038d-418e-b953-9a3605f2df18';
 const businessRows=await call(base,key,token,'/rest/v1/businesses?select=id,name&id=eq.'+business+'&limit=1');
 assert.equal(businessRows.status,200,'Cannot verify TEST tenant');
 assert.equal(businessRows.value?.length,1,'TEST fixture B not visible');
 assert.equal(businessRows.value[0].name,'ZZ_QA_PLATFORM_20261009_AUTO','Wrong TEST company');
 const productRows=await call(base,key,token,'/rest/v1/products?select=id,sku,price,active&id=eq.'+product);
 assert.equal(productRows.status,200,'Cannot read TEST fixture product');
 assert.equal(productRows.value.length,1,'Missing TEST-only product');
 assert.equal(productRows.value[0].sku,'QA-CONCURRENCY-B-2350');
 assert.equal(Number(productRows.value[0].price),23.50);
 assert.equal(productRows.value[0].active,true);
 const id=randomUUID();
 const payload={p_sale_id:id,p_business_id:business,p_location_id:location,p_channel:'QA_CONCURRENCY',p_payment_method:'Card',
  p_employee_id:null,p_customer_id:null,p_discount:0,p_tax:0,p_notes:'AUTOMATED_QA_'+id,p_fulfillment_status:'Received',
  p_items:[{product_id:product,qty:1,unit_price:23.50}]};
 try {
 const responses=await Promise.allSettled(Array.from({length:10},()=>call(base,key,token,'/rest/v1/rpc/fn_create_sale',{
  method:'POST',body:JSON.stringify(payload)
 })));
 const failures=responses.filter(r=>r.status==='rejected');
 assert.equal(failures.length,0,failures.map(r=>String(r.reason)).join('; '));
 const statuses=responses.map(r=>r.value.status);
 assert.ok(statuses.every(s=>s===200), 'Concurrent request statuses: '+statuses.join(','));
 assert.ok(responses.every(r=>r.value.value?.id===id),'Responses did not return same sale id');
 const [sales,items,flow]=await Promise.all([
  call(base,key,token,'/rest/v1/sales?select=id&id=eq.'+id),
  call(base,key,token,'/rest/v1/rpc/fn_read_sale_items_secure?select=id,sale_id&sale_id=eq.'+id),
  call(base,key,token,'/rest/v1/cash_flow?select=id,amount,business_id&sale_id=eq.'+id)
 ]);
 for(const result of [sales,items,flow]) assert.equal(result.status,200,'QA validation read failed');
 assert.equal(sales.value.length,1,'Duplicate sales');
 assert.equal(items.value.length,1,'Duplicate sale items');
 assert.equal(flow.value.length,1,'Duplicate cash entries');
 assert.equal(Number(flow.value[0].amount),23.50,'Wrong payment amount');
 } finally {
  // A request may commit even when its HTTP response is lost. Query by unique ID
  // and attempt a reversal whenever the QA sale exists.
  // Cancelled QA audit rows intentionally remain in isolated TEST only.
  const check=await call(base,key,token,'/rest/v1/sales?select=id,status&id=eq.'+id);
  assert.equal(check.status,200,'Cannot verify compensating cleanup for QA sale '+id);
  if (check.value.length>0 && check.value[0].status!=='cancelled') {
   const reversal=await call(base,key,token,'/rest/v1/rpc/fn_reverse_sale',{method:'POST',body:JSON.stringify({p_sale_id:id})});
   assert.equal(reversal.status,200,'QA sale created but compensating reversal failed: '+reversal.status);
   assert.equal(reversal.value?.status,'cancelled','QA sale reversal did not cancel');
  }
 }
});
