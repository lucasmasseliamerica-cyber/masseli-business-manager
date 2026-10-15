// Local UI + intercepted HTTP only: never changes a real password or creates a session.
import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const testHost='msinksoilkluooxenecy.supabase.co';
const project=new URL(process.env.VITE_SUPABASE_URL||'');
assert.equal(project.protocol,'https:');assert.equal(project.hostname,testHost);
const local=process.env.QA_RECOVERY_BROWSER_URL||'http://127.0.0.1:4179/';
const target=new URL(local);assert.equal(target.protocol,'http:');assert.equal(target.hostname,'127.0.0.1');
for(const scenario of ['message','retry','network']){
 test('recovery UI mocked HTTP: '+scenario,{timeout:30000},async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.QA_BROWSER_EXECUTABLE?{executablePath:process.env.QA_BROWSER_EXECUTABLE}:{})});
  try{
   const page=await browser.newPage();let calls=0;const unexpected=[];
   await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin===target.origin)return route.continue();
    if(u.hostname===testHost&&u.pathname==='/auth/v1/user'&&req.method()==='PUT'){
     calls++;
     if(scenario==='network')return route.abort('failed');
     if(scenario==='retry'&&calls===2)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'mock-user-id'})});
     return route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({code:'same_password',message:'New password should be different from the old password.'})});
    }
    unexpected.push({method:req.method(),path:u.pathname});return route.abort();
   });
   await page.goto(local+'#access_token=MOCK_RECOVERY_NOT_A_REAL_SESSION&type=recovery');
   const fields=page.locator('input[type=password]');await fields.first().fill('Mock-valid-password-123');await fields.last().fill('Mock-valid-password-123');
   await page.getByRole('button',{name:'Set New Password',exact:true}).click();
   await page.getByText(scenario==='network'?/Failed to fetch|NetworkError|Load failed/:/New password should be different/).waitFor();
   if(scenario!=='network')await page.getByText('HTTP 422 · Code: same_password',{exact:true}).waitFor();
   assert.equal(calls,1);assert.equal(await page.getByText('PASSWORD UPDATED',{exact:true}).count(),0);assert.equal(new URL(page.url()).hash,'');
   if(scenario==='retry'){
    await page.getByRole('button',{name:'Set New Password',exact:true}).click();
    await page.getByText('PASSWORD UPDATED',{exact:true}).waitFor();assert.equal(calls,2);
   }
   const sessions=await page.evaluate(()=>Object.keys(localStorage).filter(k=>/supabase.*session|session.*supabase/i.test(k)).map(k=>localStorage.getItem(k)));
   assert.ok(sessions.every(v=>v===null||v==='null'),'Recovery must not persist a normal session');
   assert.deepEqual(unexpected,[],'Unexpected external request was blocked');
  }finally{await browser.close();}
 });
}

test('recovery isolates and locally clears a previously stored normal session',{timeout:30000},async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.QA_BROWSER_EXECUTABLE?{executablePath:process.env.QA_BROWSER_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage();
  const sessionKey='nexalvo.supabase.session.v1';
  const stored=JSON.stringify({accessToken:'MOCK_OLD_NORMAL_ACCESS',refreshToken:'MOCK_OLD_NORMAL_REFRESH',expiresAt:Date.now()+3600000,user:{id:'mock-old-user'}});
  await page.addInitScript(({key,value})=>{
   if(sessionStorage.getItem('qa-recovery-session-seeded')!=='true'){
    localStorage.setItem(key,value);
    sessionStorage.setItem('qa-recovery-session-seeded','true');
   }
  },{key:sessionKey,value:stored});
  let updates=0;const unexpected=[];
  await page.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===target.origin)return route.continue();
   if(u.hostname===testHost&&u.pathname==='/auth/v1/user'&&req.method()==='PUT'){
    updates++;assert.equal(req.headers().authorization,'Bearer MOCK_RECOVERY_ONLY');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:'mock-recovered-user'})});
   }
   unexpected.push({method:req.method(),path:u.pathname});return route.abort();
  });
  await page.goto(local+'#access_token=MOCK_RECOVERY_ONLY&refresh_token=MOCK_UNUSED_REFRESH&type=recovery');
  const fields=page.locator('input[type=password]');await fields.first().waitFor();
  await page.waitForTimeout(150);
  assert.deepEqual(unexpected,[],'Stored normal session must not restore or load tenant data during recovery');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key)!==null,sessionKey),true,'Prior session remains isolated before a successful update');
  await fields.first().fill('Mock-valid-password-456');await fields.last().fill('Mock-valid-password-456');
  await page.getByRole('button',{name:'Set New Password',exact:true}).click();
  await page.getByText('PASSWORD UPDATED',{exact:true}).waitFor();assert.equal(updates,1);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),sessionKey),null,'A successful update must clear the prior local session immediately');
  await page.reload();
  await page.locator('input[name=email]').waitFor();
  assert.equal(await page.getByText('PASSWORD UPDATED',{exact:true}).count(),0,'Recovery state must not reappear after reload');
  assert.deepEqual(unexpected,[],'Reload after recovery success must not restore tenant data');
  assert.deepEqual(unexpected,[],'Recovery isolation must not call REST, refresh, or global logout endpoints');
 }finally{await browser.close();}
});
