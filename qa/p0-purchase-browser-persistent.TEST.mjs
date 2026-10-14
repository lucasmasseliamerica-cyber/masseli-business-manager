// P0.05: persistent TEST-only Playwright journey. NOT part of default CI.
// Run only with QA_P005_PERSISTENT_E2E_ENABLED=true and dedicated isolated TEST credentials.
// Reversal/cancellation is compensating business activity: immutable audit rows remain by design.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const HOST='msinksoilkluooxenecy.supabase.co';
const BUSINESS='d627563b-2ce4-491d-8cf6-141ef28d0f63';
const OWNER='f37e9907-47c4-48bf-94b7-9a6fa5de1f88';
const SUPPLIER='f85b4931-6877-4664-969d-0ba59fe4feff';
const ITEM='bb80c25b-5fd0-4716-8460-82202a2d74a9';
const LOCATION='a3e4b2ed-eb00-4963-afd0-38c256aff87d';
const required=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_A_EMAIL','QA_TWO_TENANT_A_PASSWORD'];
const enabled=process.env.QA_P005_PERSISTENT_E2E_ENABLED==='true';
const missing=required.filter(k=>!process.env[k]);
if(!enabled) throw new Error('Persistent P0.05 TEST browser test is OFF. Explicit opt-in required.');
if(missing.length) throw new Error('Missing isolated TEST credentials: '+missing.join(', '));
const base=new URL(process.env.QA_SUPABASE_URL);
assert.equal(base.protocol,'https:');assert.equal(base.hostname,HOST);assert.equal(base.pathname,'/');
assert.equal(base.username,'');assert.equal(base.password,'');
const KEY=process.env.QA_SUPABASE_ANON_KEY;
const TAG='QA_P005_BROWSER_'+Date.now()+'_'+process.pid;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(path,token,body){
 const res=await fetch(new URL(path,base),{method:body===undefined?'GET':'POST',
  headers:{apikey:KEY,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(20000)});
 const txt=await res.text();let data;try{data=JSON.parse(txt)}catch{data=txt}
 if(!res.ok) throw new Error('TEST API '+res.status+' '+path+' '+JSON.stringify(data).slice(0,350));
 return data;
}
async function findOrder(token){
 const rows=await api('/rest/v1/purchase_orders?select=id,business_id,status,po_number,notes&business_id=eq.'+BUSINESS+'&notes=eq.'+encodeURIComponent(TAG),token);
 assert.ok(rows.length<=1,'Duplicate purchase from a single browser submission');
 return rows[0]||null;
}
async function stock(token){
 const rows=await api('/rest/v1/inventory_stock?select=qty&inventory_item_id=eq.'+ITEM+'&location_id=eq.'+LOCATION,token);
 assert.equal(rows.length,1);return Number(rows[0].qty);
}
async function waitForOrder(token){
 for(let i=0;i<15;i++){const po=await findOrder(token);if(po)return po;await sleep(750)}
 throw new Error('Browser submission did not persist a TEST purchase order');
}
async function waitStatus(token,id,expected){
 for(let i=0;i<15;i++){
  const po=await findOrder(token);
  if(po?.id===id&&po.status===expected)return po;
  await sleep(700);
 }
 throw new Error('Expected purchase status '+expected+' not observed');
}
async function waitStock(token,expected){
 for(let i=0;i<15;i++){const v=await stock(token);if(Math.abs(v-expected)<0.0001)return;await sleep(700)}
 throw new Error('Inventory did not reach expected '+expected);
}
async function cleanup(token){
 const po=await findOrder(token);
 if(!po)return {status:'no order persisted'};
 if(po.status==='Reversed'||po.status==='Cancelled')return {status:po.status,id:po.id};
 const lines=await api('/rest/v1/rpc/fn_read_purchase_order_items_secure?select=id,received_qty&purchase_order_id=eq.'+po.id,token);
 const received=lines.some(l=>Number(l.received_qty)>0);
 const rpc=received?'fn_reverse_purchase_order':'fn_cancel_purchase_order';
 const result=await api('/rest/v1/rpc/'+rpc,token,{p_purchase_order_id:po.id});
 const final=await waitStatus(token,po.id,received?'Reversed':'Cancelled');
 return {status:final.status,id:po.id,resultStatus:result?.status};
}
test('P0.05 REAL TEST browser purchase -> receipt -> payment -> reversal',{timeout:180000},async()=>{
 let browser,token,before,poId,primaryError=null,cleanupError=null;
 try{
  const login=await api('/auth/v1/token?grant_type=password',null,{email:process.env.QA_TWO_TENANT_A_EMAIL,password:process.env.QA_TWO_TENANT_A_PASSWORD});
  token=login.access_token;assert.ok(token);
  const who=await api('/auth/v1/user',token);assert.equal(who.id,OWNER,'Wrong TEST owner');
  const suppliers=await api('/rest/v1/suppliers?select=id,business_id,active&id=eq.'+SUPPLIER,token);
  assert.equal(suppliers.length,1);assert.equal(suppliers[0].business_id,BUSINESS);assert.equal(suppliers[0].active,true);
  const items=await api('/rest/v1/inventory_items?select=id,business_id,active&id=eq.'+ITEM,token);
  assert.equal(items.length,1);assert.equal(items[0].business_id,BUSINESS);assert.equal(items[0].active,true);
  before=await stock(token);assert.ok(before>=1,'Insufficient dedicated QA stock for reversal');
  const ready=await fetch('http://127.0.0.1:4179/',{signal:AbortSignal.timeout(3000)});
  assert.equal(ready.status,200,'Local TEST Vite preview is not running');
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  await page.goto('http://127.0.0.1:4179/',{waitUntil:'domcontentloaded'});
  await page.locator('input[name=email]').fill(process.env.QA_TWO_TENANT_A_EMAIL);
  await page.locator('input[name=password]').fill(process.env.QA_TWO_TENANT_A_PASSWORD);
  await page.locator('button[type=submit]').click();
  await page.getByText('Purchases',{exact:true}).first().waitFor({timeout:40000});
  await page.getByText('Purchases',{exact:true}).first().click();
  await page.getByText('New Purchase',{exact:true}).first().click();
  const modal=page.locator('h3').filter({hasText:'New Purchase Order'}).first();
  await modal.waitFor({timeout:15000});
  await page.getByText('Supplier',{exact:true}).locator('..').locator('select').selectOption(SUPPLIER);
  await page.getByText('Location',{exact:true}).locator('..').locator('select').selectOption(LOCATION);
  const select=page.locator('div.flex-1 select').first();
  await select.locator('option[value="'+ITEM+'"]').waitFor({state:'attached',timeout:25000});
  await select.selectOption(ITEM);
  await page.locator('.w-20 input[type="number"]').first().fill('1');
  await page.locator('.w-24 input[type="number"]').first().fill('2');
  await page.getByText('Notes',{exact:true}).locator('..').locator('textarea').fill(TAG);
  await page.getByText('Submit Order',{exact:true}).first().click();
  // Resolve uncertain RPC responses by querying the unique TEST tag; never retry creation.
  const po=await waitForOrder(token);poId=po.id;
  assert.equal(po.status,'Ordered');assert.equal(po.business_id,BUSINESS);
  await modal.waitFor({state:'detached',timeout:15000});
  await page.getByText('Purchases',{exact:true}).first().click();
  await page.getByText('All',{exact:true}).first().click();
  await page.getByText(String(po.po_number),{exact:false}).first().click();
  await page.getByText('Receive Items',{exact:true}).first().click();
  await page.getByText('Confirm Receipt',{exact:true}).first().click();
  await waitStatus(token,poId,'Received');
  await waitStock(token,before+1);
  await page.getByText('Record Payment',{exact:true}).first().click();
  await page.getByText('Record Payment',{exact:true}).last().click();
  for(let i=0;i<15;i++){
   const pays=await api('/rest/v1/purchase_order_payments?select=id,amount,status&purchase_order_id=eq.'+poId,token);
   if(pays.some(p=>p.status!=='reversed'&&Number(p.amount)>0))break;
   if(i===14)throw new Error('Supplier payment not persisted');
   await sleep(700);
  }
  // Exercise reversal through the actual UI. The finally block is an independent
  // authenticated API compensation fallback if UI reversal fails or the page crashes.
  await page.getByText('Reverse Purchase',{exact:true}).first().click();
  await page.getByText('Reverse Purchase',{exact:true}).last().click();
  await waitStatus(token,poId,'Reversed');
  await waitStock(token,before);
  const payments=await api('/rest/v1/purchase_order_payments?select=id,amount,status&purchase_order_id=eq.'+poId,token);
  assert.equal(payments.length,1,'Expected exactly one supplier payment');
  assert.equal(payments[0].status,'reversed','Supplier payment must be reversed');
  const entries=await api('/rest/v1/cash_flow?select=type,amount&purchase_order_payment_id=eq.'+payments[0].id,token);
  assert.equal(entries.length,2,'Payment and compensating cash-flow entries must both remain in audit history');
  const net=entries.reduce((sum,e)=>sum+(e.type==='income'?1:-1)*Number(e.amount),0);
  assert.ok(Math.abs(net)<0.001,'Purchase payment cash flow must net to zero after reversal');
  // A successful browser test still invokes compensation in finally.
 }catch(e){primaryError=e}
 finally{
  try{
   if(token){
    const result=await cleanup(token);
    if(before!==undefined)await waitStock(token,before);
    const final=await findOrder(token);
    if(final)assert.ok(['Reversed','Cancelled'].includes(final.status),'Active QA purchase left behind');
    console.log('P0.05 COMPENSATION '+JSON.stringify({tag:TAG,poId,status:result.status,stockRestored:before!==undefined}));
   }
  }catch(e){cleanupError=e;console.error('P0.05 CRITICAL: compensation failed; investigate QA tag '+TAG+': '+e.message)}
  if(browser)await browser.close();
 }
 if(cleanupError)throw new AggregateError([primaryError,cleanupError].filter(Boolean),'P0.05 cleanup failed; manual QA investigation required');
 if(primaryError)throw primaryError;
});
