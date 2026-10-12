import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const HOST='msinksoilkluooxenecy.supabase.co';
const ENABLED=process.env.QA_TWO_TENANT_ENABLED==='true';
const REQUIRED=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'];
const FIXTURES={
 A:{business:'d627563b-2ce4-491d-8cf6-141ef28d0f63',price:11.25},
 B:{business:'3849b750-20f7-4929-8699-737a4e1983c8',price:23.50}
};
function config(){
 const missing=REQUIRED.filter(k=>!process.env[k]);
 assert.deepEqual(missing,[],'Missing TEST-only GitHub secrets/variables: '+missing.join(', '));
 const base=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(base.protocol,'https:');assert.equal(base.hostname,HOST,'REFUSING non-TEST project');
 assert.equal(base.username,'');assert.equal(base.password,'');
 return {base,key:process.env.QA_SUPABASE_ANON_KEY};
}
async function api(base,key,path,token,payload){
 const begin=performance.now();
 const response=await fetch(new URL(path,base),{
  method:payload===undefined?'GET':'POST',
  headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},
  ...(payload===undefined?{}:{body:JSON.stringify(payload)}),
  redirect:'error',signal:AbortSignal.timeout(30000)
 });
 const raw=await response.text();let value;
 try{value=JSON.parse(raw)}catch{value=raw}
 return {status:response.status,value,begin,end:performance.now()};
}
async function login(base,key,label){
 const email=process.env['QA_TWO_TENANT_'+label+'_EMAIL'];
 const password=process.env['QA_TWO_TENANT_'+label+'_PASSWORD'];
 const r=await api(base,key,'/auth/v1/token?grant_type=password',null,{email,password});
 assert.equal(r.status,200,'TEST login '+label+' failed with HTTP '+r.status);
 assert.ok(r.value?.access_token,'Missing TEST JWT for '+label);
 return r.value.access_token;
}
test('two TEST companies overlap within PostgreSQL transactions and cannot read each other', {
 skip:ENABLED?false:'Not certified: QA_TWO_TENANT_ENABLED is not true',
 timeout:120000
},async()=>{
 const {base,key}=config();
 const [tokenA,tokenB]=await Promise.all([login(base,key,'A'),login(base,key,'B')]);
 const cases=[
  {label:'A',token:tokenA,...FIXTURES.A,id:randomUUID()},
  {label:'B',token:tokenB,...FIXTURES.B,id:randomUUID()}
 ];
 let testError;
 try{
  const [a,b]=await Promise.all(cases.map(t=>api(base,key,'/rest/v1/rpc/fn_qa_two_tenant_overlap',t.token,{p_sale_id:t.id,p_fixture_label:t.label})));
  const results=[a,b];
  const requestOverlap=Math.min(a.end,b.end)-Math.max(a.begin,b.begin);
  assert.ok(requestOverlap>0,'HTTP requests were not simultaneous');
  for(let i=0;i<2;i++){
   const t=cases[i],r=results[i];
   assert.equal(r.status,200,'TEST RPC '+t.label+' returned HTTP '+r.status+': '+JSON.stringify(r.value).slice(0,300));
   assert.ok(Array.isArray(r.value)&&r.value.length===1,'Expected one test-only RPC timing row for '+t.label);
   const row=r.value[0];t.row=row;
   assert.equal(row.sale_id,t.id,'Unexpected ID for '+t.label);
   assert.equal(row.tenant_id,t.business,'Wrong tenant for '+t.label);
   assert.equal(Number(row.sale_total),t.price,'Wrong price for '+t.label);
   assert.ok(Number.isInteger(row.backend_pid)&&row.backend_pid>0,'Missing PostgreSQL backend PID');
   assert.ok(Number.isFinite(Date.parse(row.started_at))&&Number.isFinite(Date.parse(row.finished_at)),'Missing database transaction timestamps');
   assert.ok(Date.parse(row.finished_at)>Date.parse(row.started_at),'Invalid transaction duration');
  }
  assert.notEqual(cases[0].row.backend_pid,cases[1].row.backend_pid,'Expected independent PostgreSQL connections');
  const databaseOverlapMs=Math.min(...cases.map(t=>Date.parse(t.row.finished_at)))-
   Math.max(...cases.map(t=>Date.parse(t.row.started_at)));
  console.log('QA_POSTGRES_OVERLAP_MS',databaseOverlapMs);
  console.log('QA_POSTGRES_PIDS',cases.map(t=>t.row.backend_pid).join(','));
  console.log('QA_HTTP_OVERLAP_MS',Math.round(requestOverlap));
  assert.ok(databaseOverlapMs>=1000,'PostgreSQL transactions did not overlap by at least 1 second');
  for(const [self,other] of [[cases[0],cases[1]],[cases[1],cases[0]]]){
   const [sales,flow,foreignSales,foreignFlow]=await Promise.all([
    api(base,key,'/rest/v1/sales?select=id,total,business_id&id=eq.'+self.id,self.token),
    api(base,key,'/rest/v1/cash_flow?select=id,amount,business_id&sale_id=eq.'+self.id,self.token),
    api(base,key,'/rest/v1/sales?select=id&id=eq.'+other.id,self.token),
    api(base,key,'/rest/v1/cash_flow?select=id&sale_id=eq.'+other.id,self.token)
   ]);
   for(const r of [sales,flow,foreignSales,foreignFlow])assert.equal(r.status,200,'Verification read denied for '+self.label);
   assert.equal(sales.value.length,1,'Own sale count for '+self.label);
   assert.equal(flow.value.length,1,'Own cash ledger count for '+self.label);
   assert.equal(Number(sales.value[0].total),self.price,'Own sale amount for '+self.label);
   assert.equal(Number(flow.value[0].amount),self.price,'Own cash flow amount for '+self.label);
   assert.equal(flow.value[0].business_id,self.business,'Cash flow cross-posted for '+self.label);
   assert.equal(foreignSales.value.length,0,'Foreign sale leaked to '+self.label);
   assert.equal(foreignFlow.value.length,0,'Foreign cash flow leaked to '+self.label);
  }
 }catch(error){testError=error}
 finally{
  // A successful commit can happen despite a lost HTTP response; check by ID.
  const cleanupErrors=[];
  for(const t of cases){
   try{
    const check=await api(base,key,'/rest/v1/sales?select=id,status&id=eq.'+t.id,t.token);
    assert.equal(check.status,200,'Cannot query cleanup status for '+t.label);
    if(check.value.length&&check.value[0].status!=='cancelled'){
     const reversal=await api(base,key,'/rest/v1/rpc/fn_reverse_sale',t.token,{p_sale_id:t.id});
     assert.equal(reversal.status,200,'Failed to reverse TEST sale for '+t.label);
     assert.equal(reversal.value?.status,'cancelled','Sale remains active for '+t.label);
    }
   }catch(e){cleanupErrors.push(t.label+': '+String(e))}
  }
  assert.deepEqual(cleanupErrors,[],'Compensating cleanup failed');
 }
 if(testError)throw testError;
});
