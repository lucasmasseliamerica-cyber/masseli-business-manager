import test from 'node:test';
import assert from 'node:assert/strict';

const TEST_HOST='msinksoilkluooxenecy.supabase.co';
const TABLES=['sales','expenses','cash_flow','employees','inventory_stock','purchase_order_payments'];
function credentials(){
 const url=process.env.QA_SUPABASE_URL;
 const key=process.env.QA_SUPABASE_ANON_KEY;
 assert.ok(url && key,'Missing TEST-only environment configuration');
 const base=new URL(url);
 assert.equal(base.protocol,'https:');
 assert.equal(base.hostname,TEST_HOST,'Refusing to query anything except Supabase TEST');
 return {base,key};
}
test('anonymous users cannot read financial and employee records, including in parallel', {timeout:45000},async()=>{
 const {base,key}=credentials();
 const results=await Promise.allSettled(TABLES.flatMap(table=>Array.from({length:3},async()=>{
  const endpoint=new URL('/rest/v1/'+table,base);
  endpoint.searchParams.set('select','*');
  endpoint.searchParams.set('limit','1');
  const response=await fetch(endpoint,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(15000)});
  if([401,403,404].includes(response.status)) return;
  assert.equal(response.status,200,table+' unexpected status '+response.status);
  const rows=await response.json();
  assert.ok(Array.isArray(rows),table+' must return an array');
  assert.equal(rows.length,0,table+' leaked rows to anon');
 })));
 const failures=results.filter(r=>r.status==='rejected');
 assert.equal(failures.length,0,failures.map(r=>String(r.reason)).join('; '));
});
