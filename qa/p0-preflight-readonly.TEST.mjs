// Fail-closed preflight: password login + GETs only. No business RPC writes or password resets.
import assert from 'node:assert/strict';
const host='msinksoilkluooxenecy.supabase.co';
const names=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'];
const missing=names.filter(n=>!process.env[n]);
if(missing.length){console.error('PREFLIGHT BLOCKED: configure '+missing.join(', '));process.exit(2);}
let base;try{base=new URL(process.env.QA_SUPABASE_URL);}catch{throw new Error('Invalid TEST URL; value suppressed');}
if(base.protocol!=='https:'||base.hostname!==host||base.pathname!=='/'||base.username||base.password||base.search||base.hash)throw new Error('Unsafe TEST URL; value suppressed');
const key=process.env.QA_SUPABASE_ANON_KEY;
if(key.startsWith('sb_secret_'))throw new Error('Only a public project key is permitted');
if(key.split('.').length===3){
 let claims;try{claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());}catch{throw new Error('Invalid public key format');}
 if(claims.role!=='anon'||claims.ref!=='msinksoilkluooxenecy')throw new Error('Invalid public TEST key claims; values suppressed');
}
async function request(path,token,body){
 let r;try{r=await fetch(new URL(path,base),{method:body===undefined?'GET':'POST',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw new Error('TEST request unavailable; no response payload logged');}
 assert.equal(r.status,200,'TEST preflight HTTP '+r.status+'; payload suppressed');
 try{return await r.json();}catch{throw new Error('Invalid TEST response; payload suppressed');}
}
const actors=[
 {label:'A',business:'d627563b-2ce4-491d-8cf6-141ef28d0f63',owner:'f37e9907-47c4-48bf-94b7-9a6fa5de1f88'},
 {label:'B',business:'3849b750-20f7-4929-8699-737a4e1983c8',owner:'88eddcda-d8b5-4474-b5d7-19860dd97fba'}
];
try{
 for(const actor of actors){
  const login=await request('/auth/v1/token?grant_type=password',null,{email:process.env['QA_TWO_TENANT_'+actor.label+'_EMAIL'],password:process.env['QA_TWO_TENANT_'+actor.label+'_PASSWORD']});
  const token=login.access_token;assert.ok(typeof token==='string'&&token.length>0,'Missing TEST access token');actor.token=token;
  const user=await request('/auth/v1/user',token);assert.ok(user.id===actor.owner,'Wrong QA identity');
  const rows=await request('/rest/v1/users?select=id,business_id,role,active&id=eq.'+actor.owner,token);
  assert.ok(rows.length===1&&rows[0].id===actor.owner&&rows[0].business_id===actor.business&&rows[0].role==='OWNER'&&rows[0].active===true,'Inactive or unexpected OWNER profile');
  const business=await request('/rest/v1/rpc/current_business_id',token);assert.ok(business===actor.business,'Wrong session business');
  console.log('PASS: OWNER '+actor.label+' identity, active role and business');
 }
 const [a,b]=actors;
 for(const [table,id] of [['suppliers','f85b4931-6877-4664-969d-0ba59fe4feff'],['inventory_items','bb80c25b-5fd0-4716-8460-82202a2d74a9'],['locations','a3e4b2ed-eb00-4963-afd0-38c256aff87d']]){
  const path='/rest/v1/'+table+'?select=id,business_id,active&id=eq.'+id;
  const own=await request(path,a.token);assert.ok(own.length===1&&own[0].business_id===a.business&&own[0].active===true,'Missing/inactive QA A '+table+' fixture');
  const foreign=await request(path,b.token);assert.ok(Array.isArray(foreign)&&foreign.length===0,'Cross-company fixture exposed');
  console.log('PASS: owned active '+table+' fixture and cross-company denial');
 }
 const stock=await request('/rest/v1/rpc/fn_read_inventory_stock_secure?select=qty&inventory_item_id=eq.bb80c25b-5fd0-4716-8460-82202a2d74a9&location_id=eq.a3e4b2ed-eb00-4963-afd0-38c256aff87d',a.token);
 assert.ok(stock.length===1&&Number.isFinite(Number(stock[0].qty))&&Number(stock[0].qty)>=1,'QA stock prerequisite failed');
 console.log('PASS: secure stock read and reversal prerequisite');
 for(const actor of actors){
  const other=actors.find(x=>x!==actor);
  const rows=await request('/rest/v1/purchase_orders?select=id&business_id=eq.'+other.business+'&limit=1',actor.token);
  assert.ok(Array.isArray(rows)&&rows.length===0,'Cross-company purchase visible');
 }
 console.log('PASS: bidirectional purchase isolation (fixture probes above are non-vacuous)');
 console.log('PREFLIGHT PASS: no purchase writes performed; persistent run remains separately gated.');
}catch{
 console.error('PREFLIGHT FAILED: identity, permissions, isolation or fixture check failed. No credentials/payload logged.');process.exitCode=1;
}finally{
 for(const actor of actors)delete actor.token;
}
