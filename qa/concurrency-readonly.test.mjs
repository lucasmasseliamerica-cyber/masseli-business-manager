import test from 'node:test';
import assert from 'node:assert/strict';

const EXPECTED_HOST='msinksoilkluooxenecy.supabase.co';
const url=process.env.QA_SUPABASE_URL;
const key=process.env.QA_SUPABASE_ANON_KEY;
function config(){
 assert.ok(url && key,'QA environment variables required');
 const u=new URL(url);
 assert.equal(u.protocol,'https:');
 assert.equal(u.hostname,EXPECTED_HOST,'Refusing non-TEST Supabase target');
 return u;
}
test('10 concurrent read-only TEST auth health requests', {timeout:30000},async()=>{
 const base=config();
 const results=await Promise.allSettled(Array.from({length:10},async()=>{
  const r=await fetch(new URL('/auth/v1/health',base),{headers:{apikey:key},signal:AbortSignal.timeout(15000)});
  assert.equal(r.ok,true,`health returned ${r.status}`);
  return r.status;
 }));
 const failures=results.filter(x=>x.status==='rejected');
 assert.equal(failures.length,0,failures.map(x=>String(x.reason)).join('; '));
});
test('10 concurrent anonymous calls cannot create a sale', {timeout:30000},async()=>{
 const base=config();
 const results=await Promise.allSettled(Array.from({length:10},async()=>{
  const r=await fetch(new URL('/rest/v1/rpc/fn_create_sale',base),{
   method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
   body:JSON.stringify({p_sale_id:'00000000-0000-4000-8000-000000000001',p_business_id:'00000000-0000-4000-8000-000000000002',p_location_id:'00000000-0000-4000-8000-000000000003',p_channel:'QA',p_payment_method:'Card',p_discount:0,p_tax:0,p_items:[]}),
   signal:AbortSignal.timeout(15000)
  });
  assert.ok([401,403,404].includes(r.status),`anonymous write returned ${r.status}`);
 }));
 const failures=results.filter(x=>x.status==='rejected');
 assert.equal(failures.length,0,failures.map(x=>String(x.reason)).join('; '));
});
