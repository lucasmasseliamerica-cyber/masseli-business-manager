import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const HOST='msinksoilkluooxenecy.supabase.co';
const needs=['QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY','QA_TWO_TENANT_B_EMAIL','QA_TWO_TENANT_B_PASSWORD'];
const missing=needs.filter(k=>!process.env[k]);
const skip=process.env.QA_TWO_TENANT_ENABLED!=='true'?'TEST gate inactive':missing.length?'missing TEST secrets: '+missing.join(', '):false;
async function ready(){
 for(let i=0;i<60;i++){
  try{const r=await fetch('http://127.0.0.1:4179/',{signal:AbortSignal.timeout(1500)});if(r.ok)return}catch{}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 throw new Error('Isolated local TEST Vite server failed to start');
}
test('headless QA browser: real owner B login, navigation and desktop/mobile screenshots',{skip,timeout:180000},async t=>{
 const url=new URL(process.env.QA_SUPABASE_URL);
 assert.equal(url.protocol,'https:');assert.equal(url.hostname,HOST,'NO PRODUCTION UI CONNECTIVITY');
 await ready();
 await mkdir('qa-browser-artifacts',{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4179/',{waitUntil:'domcontentloaded',timeout:30000});
  await t.test('login renders with real fields',async()=>{
   await page.locator('input[name=email]').waitFor({timeout:20000});
   assert.equal(await page.locator('input[name=password]').count(),1);
  });
  await page.locator('input[name=email]').fill(process.env.QA_TWO_TENANT_B_EMAIL);
  await page.locator('input[name=password]').fill(process.env.QA_TWO_TENANT_B_PASSWORD);
  await page.locator('button[type=submit]').click();
  await t.test('QA owner session loads correct company and navigation',async()=>{
   await page.getByText('ZZ_QA_PLATFORM_20261009_AUTO',{exact:false}).first().waitFor({timeout:40000});
   assert.equal(await page.getByText('NEXALVO',{exact:false}).count()>0,true);
  });
  await page.screenshot({path:'qa-browser-artifacts/dashboard-desktop.png',fullPage:true});
  for(const section of ['Sales','Inventory','Products','Purchases','Customers','Employees']){
   await t.test('desktop navigation '+section,async()=>{
    const item=page.getByText(section,{exact:true}).first();
    assert.ok(await item.isVisible(),'Missing navigation '+section);
    await item.click({timeout:10000});
    await page.waitForTimeout(250);
    assert.equal(page.url().startsWith('http://127.0.0.1:4179/'),true);
   });
  }
  await t.test('desktop page has no uncaught JS exceptions',async()=>{assert.deepEqual(errors,[])});
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const mobileErrors=[];mobile.on('pageerror',e=>mobileErrors.push(e.message));
  await mobile.goto('http://127.0.0.1:4179/',{waitUntil:'domcontentloaded',timeout:30000});
  await mobile.locator('input[name=email]').fill(process.env.QA_TWO_TENANT_B_EMAIL);
  await mobile.locator('input[name=password]').fill(process.env.QA_TWO_TENANT_B_PASSWORD);
  await mobile.locator('button[type=submit]').click();
  await t.test('mobile owner can sign in and render dashboard',async()=>{
   await mobile.locator('input[name=email]').waitFor({state:'detached',timeout:40000});
   assert.ok(await mobile.getByText('ZZ_QA_PLATFORM_20261009_AUTO',{exact:false}).count()>0,'QA company must exist in authenticated DOM');
   assert.equal(await mobile.locator('input[name=password]').count(),0,'Mobile login form must be gone');
  });
  await mobile.screenshot({path:'qa-browser-artifacts/dashboard-mobile.png',fullPage:true});
  await t.test('mobile page has no uncaught JS exceptions',async()=>assert.deepEqual(mobileErrors,[]));
 }finally{await browser.close()}
});
