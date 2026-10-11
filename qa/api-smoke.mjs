import test from 'node:test';
import assert from 'node:assert/strict';
const EXPECTED_TEST_REF='msinksoilkluooxenecy';
test('QA credentials point to the isolated Supabase TEST project',async()=>{
 const url=process.env.QA_SUPABASE_URL;
 const key=process.env.QA_SUPABASE_ANON_KEY;
 assert.ok(url,'Set environment variable QA_SUPABASE_URL in nexalvo-test');
 assert.ok(key,'Set environment secret QA_SUPABASE_ANON_KEY in nexalvo-test');
 const parsed=new URL(url);
 assert.equal(parsed.protocol,'https:');
 assert.equal(parsed.hostname,`${EXPECTED_TEST_REF}.supabase.co`,'Refusing to contact any other project');
 const response=await fetch(new URL('/auth/v1/health',parsed),{
   headers:{apikey:key},signal:AbortSignal.timeout(10000)
 });
 assert.equal(response.ok,true,`TEST auth health status ${response.status}`);
});
