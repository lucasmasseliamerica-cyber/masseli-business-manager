import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';

const expected='msinksoilkluooxenecy.supabase.co';
const missing=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'].filter(k=>!process.env[k]);
const skip=process.env.QA_TWO_TENANT_ENABLED!=='true'?'QA test gate disabled':missing.length?'Missing TEST config '+missing.join(', '):false;
test('TEST-only bounded read latency: 25 requests in 5 sequential waves', {skip,timeout:120000},async t=>{
 const base=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(base.hostname,expected,'NO PRODUCTION BENCHMARK');
 assert.equal(base.protocol,'https:');
 const key=process.env.QA_SUPABASE_ANON_KEY;
 const login=await fetch(new URL('/auth/v1/token?grant_type=password',base),{
  method:'POST',headers:{apikey:key,'Content-Type':'application/json'},
  body:JSON.stringify({email:process.env.QA_TWO_TENANT_B_EMAIL,password:process.env.QA_TWO_TENANT_B_PASSWORD}),
  redirect:'error',signal:AbortSignal.timeout(15000)
 });
 assert.equal(login.status,200,'QA login failed');
 const token=(await login.json()).access_token;
 assert.ok(token);
 const samples=[];
 const urls=['/rest/v1/products?select=id,price&limit=20','/rest/v1/sales?select=id,total&limit=20','/rest/v1/customers?select=id,name&limit=20','/rest/v1/rpc/fn_read_inventory_stock_secure?select=id,qty&limit=20','/rest/v1/cash_flow?select=id,amount&limit=20'];
 for(let wave=0;wave<5;wave++){
  const results=await Promise.all(urls.map(async path=>{
   const start=performance.now();
   const res=await fetch(new URL(path,base),{
    method:'GET',headers:{apikey:key,Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
   const ms=performance.now()-start;
   const raw=await res.text();
   return {status:res.status,ms,raw};
  }));
  for(const r of results){
   assert.equal(r.status,200,'TEST read returned HTTP '+r.status+': '+r.raw.slice(0,160));
   assert.ok(r.raw.startsWith('['),'Expected read array');
   samples.push(r.ms);
  }
 }
 samples.sort((a,b)=>a-b);
 const p95=samples[Math.ceil(samples.length*.95)-1];
 const max=Math.max(...samples);
 const avg=samples.reduce((a,b)=>a+b,0)/samples.length;
 console.log('QA_READ_PERF_SAMPLES',samples.length);
 console.log('QA_READ_PERF_P95_MS',Math.round(p95));
 console.log('QA_READ_PERF_AVG_MS',Math.round(avg));
 console.log('QA_READ_PERF_MAX_MS',Math.round(max));
 await t.test('all 25 TEST reads returned correct HTTP and JSON',()=>assert.equal(samples.length,25));
 await t.test('p95 API latency below 10000ms for bounded 5-way reads',()=>assert.ok(p95<10000,'p95 degradation: '+Math.round(p95)+'ms'));
});
