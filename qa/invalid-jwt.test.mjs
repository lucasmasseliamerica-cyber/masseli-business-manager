import test from 'node:test';
import assert from 'node:assert/strict';

const HOST='msinksoilkluooxenecy.supabase.co';
function target(){
 const raw=process.env.QA_SUPABASE_URL;
 const key=process.env.QA_SUPABASE_ANON_KEY;
 assert.ok(raw && key,'TEST-only URL and anon key are required');
 const base=new URL(raw);
 assert.equal(base.protocol,'https:');
 assert.equal(base.hostname,HOST,'Never run against non-TEST Supabase');
 assert.equal(base.username,'');
 assert.equal(base.password,'');
 return {base,key};
}
const paths=[
 '/rest/v1/sales?select=id&limit=1',
 '/rest/v1/cash_flow?select=id&limit=1',
 '/rest/v1/employees?select=id&limit=1'
];
test('invalid bearer token is rejected on three sensitive read endpoints', {timeout:45000},async()=>{
 const {base,key}=target();
 const results=await Promise.allSettled(paths.map(async path=>{
  const response=await fetch(new URL(path,base),{
   headers:{apikey:key,Authorization:'Bearer definitely-not-a-valid-jwt'},
   redirect:'error',signal:AbortSignal.timeout(12000)
  });
  assert.ok([401,403].includes(response.status),path+' accepted malformed bearer: '+response.status);
 }));
 const failures=results.filter(x=>x.status==='rejected');
 assert.equal(failures.length,0,failures.map(x=>String(x.reason)).join('; '));
});
