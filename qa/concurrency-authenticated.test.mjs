import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const EXPECTED_HOST='msinksoilkluooxenecy.supabase.co';
const enabled=process.env.QA_CONCURRENCY_ENABLED==='true';
const needed=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_CONCURRENCY_EMAIL','QA_CONCURRENCY_PASSWORD','QA_CONCURRENCY_BUSINESS_ID','QA_CONCURRENCY_LOCATION_ID','QA_CONCURRENCY_PRODUCT_ID'];
const missing=needed.filter(k=>!process.env[k]);
const skipReason=!enabled?'Not run: QA_CONCURRENCY_ENABLED is not true (no write permission granted)':
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
  body:JSON.stringify({email:process.env.QA_CONCURRENCY_EMAIL,password:process.env.QA_CONCURRENCY_PASSWORD}),
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
 const business=process.env.QA_CONCURRENCY_BUSINESS_ID;
 const location=process.env.QA_CONCURRENCY_LOCATION_ID;
 const product=process.env.QA_CONCURRENCY_PRODUCT_ID;
 for(const id of [business,location,product]) assert.match(id,/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
 // An isolated QA-only tenant is mandatory; refuse legacy tenant IDs.
 assert.notEqual(business,'d627563b-2ce4-491d-8cf6-141ef28d0f63');
 assert.notEqual(business,'3849b750-20f7-4929-8699-737a4e1983c8');
 const businessRows=await call(base,key,token,'/rest/v1/businesses?select=id,name&id=eq.'+business+'&limit=1');
 assert.equal(businessRows.status,200,'Cannot verify isolated TEST tenant');
 assert.equal(businessRows.value?.length,1,'QA fixture business is inaccessible');
 assert.match(businessRows.value[0].name,/^NEXALVO_QA_/i,'Business must start NEXALVO_QA_');
 const id=randomUUID();
 const payload={p_sale_id:id,p_business_id:business,p_location_id:location,p_channel:'QA_CONCURRENCY',p_payment_method:'Card',
  p_employee_id:null,p_customer_id:null,p_discount:0,p_tax:0,p_notes:'AUTOMATED_QA_'+id,p_fulfillment_status:'Received',
  p_items:[{product_id:product,qty:1,unit_price:1}]};
 let created=false;
 try {
 const responses=await Promise.allSettled(Array.from({length:10},()=>call(base,key,token,'/rest/v1/rpc/fn_create_sale',{
  method:'POST',body:JSON.stringify(payload)
 })));
 const failures=responses.filter(r=>r.status==='rejected');
 assert.equal(failures.length,0,failures.map(r=>String(r.reason)).join('; '));
 const statuses=responses.map(r=>r.value.status);
 created=statuses.some(s=>s===200);
 assert.ok(statuses.every(s=>s===200), 'Concurrent request statuses: '+statuses.join(','));
 assert.ok(responses.every(r=>r.value.value?.id===id),'Responses did not return same sale id');
 const [sales,items,flow]=await Promise.all([
  call(base,key,token,'/rest/v1/sales?select=id&id=eq.'+id),
  call(base,key,token,'/rest/v1/sale_items?select=id&sale_id=eq.'+id),
  call(base,key,token,'/rest/v1/cash_flow?select=id&sale_id=eq.'+id)
 ]);
 for(const result of [sales,items,flow]) assert.equal(result.status,200,'QA validation read failed');
 assert.equal(sales.value.length,1,'Duplicate sales');
 assert.equal(items.value.length,1,'Duplicate sale items');
 assert.equal(flow.value.length,1,'Duplicate cash entries');
 } finally {
  // Always attempt reversal if an RPC succeeded, even when result assertions fail.
  // Cancelled QA audit rows intentionally remain in isolated TEST only.
  if (created) {
   const reversal=await call(base,key,token,'/rest/v1/rpc/fn_reverse_sale',{method:'POST',body:JSON.stringify({p_sale_id:id})});
   assert.equal(reversal.status,200,'QA sale created but compensating reversal failed: '+reversal.status);
   assert.equal(reversal.value?.status,'cancelled','QA sale reversal did not cancel');
  }
 }
});
