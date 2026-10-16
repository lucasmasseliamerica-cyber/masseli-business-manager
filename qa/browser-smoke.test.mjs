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
  await t.test('P0.02 UI: expired recovery link is rejected without showing a password form',async()=>{
   const expired=await browser.newPage();
   try{
    await expired.goto('http://127.0.0.1:4179/#error=access_denied&error_code=otp_expired&error_description=Email%20link%20is%20invalid%20or%20has%20expired&type=recovery',{waitUntil:'domcontentloaded'});
    await expired.getByText(/Email link is invalid or has expired/i).first().waitFor({timeout:15000});
    assert.equal(await expired.getByText('Back to Sign In',{exact:true}).count(),1);
    assert.equal(await expired.locator('input[type=password]').count(),0,'Expired recovery cannot show password-reset form');
    assert.equal(new URL(expired.url()).hash,'','Recovery tokens/errors must be stripped from address bar');
    await expired.getByText('Back to Sign In',{exact:true}).click();
    await expired.locator('input[name=email]').waitFor({timeout:15000});
   }finally{await expired.close()}
  });
  await t.test('P0.02 UI: expired invitation link is rejected and returns to login',async()=>{
   const invite=await browser.newPage();
   try{
    await invite.goto('http://127.0.0.1:4179/#error=access_denied&error_code=otp_expired&error_description=Invitation%20expired&type=invite',{waitUntil:'domcontentloaded'});
    await invite.getByText('Invitation expired',{exact:false}).first().waitFor({timeout:15000});
    assert.equal(await invite.locator('input[type=password]').count(),0);
    assert.equal(new URL(invite.url()).hash,'');
    await invite.getByText('Back to Sign In',{exact:true}).click();
    await invite.locator('input[name=email]').waitFor({timeout:15000});
   }finally{await invite.close()}
  });
  await t.test('P0.02 UI: short recovery password is blocked before any account update request',async()=>{
   const recovery=await browser.newPage();
   let attempted=0;
   await recovery.route('**/auth/v1/user',async route=>{
    if(route.request().method()==='PUT') attempted++;
    await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({msg:'Invalid token'})});
   });
   try{
    await recovery.goto('http://127.0.0.1:4179/#access_token=QA_FAKE_RECOVERY_TOKEN&type=recovery',{waitUntil:'domcontentloaded'});
    const fields=recovery.locator('input[type=password]');
    await fields.first().waitFor({timeout:15000});
    assert.equal(await fields.count(),2);
    assert.equal(new URL(recovery.url()).hash,'','Recovery link must not remain in URL');
    await fields.nth(0).fill('short');
    await fields.nth(1).fill('short');
    await recovery.getByText('Set New Password',{exact:true}).last().click();
    await recovery.getByText(/Password must be at least 8 characters/i).first().waitFor({timeout:10000});
    assert.equal(attempted,0,'Weak password must not issue PUT /auth/v1/user');
    assert.equal(await recovery.getByText('PASSWORD UPDATED',{exact:true}).count(),0);
   }finally{await recovery.close()}
  });
  await t.test('P0.02 UI: nonmatching recovery passwords are rejected without a write',async()=>{
   const recovery=await browser.newPage();
   let attempted=0;
   await recovery.route('**/auth/v1/user',async route=>{
    if(route.request().method()==='PUT') attempted++;
    await route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({msg:'Invalid token'})});
   });
   try{
    await recovery.goto('http://127.0.0.1:4179/#access_token=QA_FAKE_RECOVERY_TOKEN&type=recovery',{waitUntil:'domcontentloaded'});
    const fields=recovery.locator('input[type=password]');
    await fields.first().waitFor({timeout:15000});
    await fields.nth(0).fill('QA_testing_only_12345');
    await fields.nth(1).fill('QA_testing_only_DIFFERENT');
    await recovery.getByText('Set New Password',{exact:true}).last().click();
    await recovery.getByText(/Passwords don't match/i).first().waitFor({timeout:10000});
    assert.equal(attempted,0,'Mismatched password must not issue PUT /auth/v1/user');
    assert.equal(await recovery.getByText('PASSWORD UPDATED',{exact:true}).count(),0);
   }finally{await recovery.close()}
  });
  await t.test('P0.02 UI: forged recovery JWT is refused and cannot confirm a password change',async()=>{
   const recovery=await browser.newPage();
   let attempts=0;
   try{
    await recovery.route('**/auth/v1/user',async route=>{
     if(route.request().method()==='PUT') {
      attempts++;
      assert.equal(route.request().headers()['authorization'],'Bearer QA_INVALID_NEVER_REAL_TOKEN');
     }
     await route.continue();
    });
    await recovery.goto('http://127.0.0.1:4179/#access_token=QA_INVALID_NEVER_REAL_TOKEN&type=recovery',{waitUntil:'domcontentloaded'});
    const fields=recovery.locator('input[type=password]');
    await fields.first().waitFor({timeout:15000});
    await fields.nth(0).fill('QA_only_invalid_token_12345');
    await fields.nth(1).fill('QA_only_invalid_token_12345');
    await recovery.getByText('Set New Password',{exact:true}).last().click();
    await recovery.getByText(/invalid|expired|could not update|JWT/i).first().waitFor({timeout:20000});
    assert.equal(attempts,1,'Only one invalid-token change attempt is expected');
    assert.equal(await recovery.getByText('PASSWORD UPDATED',{exact:true}).count(),0);
    assert.equal(new URL(recovery.url()).hash,'','Sensitive hash must be removed');
   }finally{await recovery.close()}
  });
  const page=await browser.newPage({viewport:{width:1366,height:768},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4179/',{waitUntil:'domcontentloaded',timeout:30000});
  await t.test('login renders with real fields',async()=>{
   await page.locator('input[name=email]').waitFor({timeout:20000});
   assert.equal(await page.locator('input[name=password]').count(),1);
  });
  await t.test('P0.02 UI: incorrect password is rejected without creating a session',async()=>{
   await page.locator('input[name=email]').fill(process.env.QA_TWO_TENANT_B_EMAIL);
   await page.locator('input[name=password]').fill('QA_KNOWN_INVALID_PASSWORD_DO_NOT_ACCEPT');
   await page.locator('button[type=submit]').click();
   await page.getByText(/invalid login credentials|sign-in failed|invalid credentials/i).first().waitFor({state:'visible',timeout:20000});
   assert.equal(await page.locator('input[name=password]').count(),1,'Rejected login must remain on login screen');
   assert.equal(await page.getByText('ZZ_QA_PLATFORM_20261009_AUTO',{exact:false}).count(),0,'Rejected login cannot show tenant dashboard');
  });
  await page.locator('input[name=email]').fill(process.env.QA_TWO_TENANT_B_EMAIL);
  await page.locator('input[name=password]').fill(process.env.QA_TWO_TENANT_B_PASSWORD);
  await page.locator('button[type=submit]').click();
  await t.test('QA owner session loads correct company and navigation',async()=>{
   await page.getByText('ZZ_QA_PLATFORM_20261009_AUTO',{exact:false}).first().waitFor({timeout:40000});
   assert.equal(await page.getByText('NEXALVO',{exact:false}).count()>0,true);
  });
  await page.screenshot({path:'qa-browser-artifacts/dashboard-desktop.png',fullPage:true});
  for(const section of ['Orders','Sales','Cash Flow','Inventory','Products','Purchases','Expenses','Suppliers','Customers','Employees','Reports','Settings']){
   await t.test('desktop navigation '+section,async()=>{
    const item=page.getByText(section,{exact:true}).first();
    assert.ok(await item.isVisible(),'Missing navigation '+section);
    await item.click({timeout:10000});
    await page.waitForTimeout(250);
    assert.equal(page.url().startsWith('http://127.0.0.1:4179/'),true);
   });
  }
  await t.test('product form Save button is reachable after scrolling modal',async()=>{
    await page.getByText('Products',{exact:true}).first().click();
    await page.getByText('New Product',{exact:true}).first().click();
    const save=page.getByText('Save Product',{exact:true}).first();
    await save.scrollIntoViewIfNeeded({timeout:12000});
    assert.equal(await save.isVisible(),true,'Save Product must be visible and reachable');
    await page.screenshot({path:'qa-browser-artifacts/product-modal-desktop.png'});
    await page.locator('h3').filter({hasText:'New Product'}).locator('..').locator('button').first().click();
  });
  await t.test('new customer form prevents empty-name creation without sending writes',async()=>{
    await page.getByText('Customers',{exact:true}).first().click();
    await page.getByText('New Customer',{exact:true}).first().click();
    const submit=page.getByText('Create Customer',{exact:true}).first();
    await submit.scrollIntoViewIfNeeded({timeout:12000});
    assert.equal(await submit.isVisible(),true);
    assert.equal(await submit.isDisabled(),true,'Create Customer must be disabled without a name');
    await page.screenshot({path:'qa-browser-artifacts/customer-modal-desktop.png'});
    await page.locator('h3').filter({hasText:'New Customer'}).locator('..').locator('button').first().click();
  });
  await t.test('P0.03 UI sale form rejects duplicate product without write RPC',async()=>{
    await page.getByText('Sales',{exact:true}).first().click();
    await page.getByText('New Sale',{exact:true}).first().click();
    const modalTitle=page.locator('h3').filter({hasText:'New Sale'}).first();
    await modalTitle.waitFor({timeout:15000});
    let writes=0;
    const onRequest=req=>{if(req.method()==='POST'&&req.url().includes('/rest/v1/rpc/fn_create_sale'))writes++;};
    page.on('request',onRequest);
    try{
      await page.getByText('+ Add another product',{exact:true}).first().click();
      await page.getByText('+ Add another product',{exact:true}).first().click();
      await page.getByText(/Complete Sale|Charge Card/i).last().click();
      await page.getByText(/same product can't appear more than once on a sale/i).first().waitFor({timeout:12000});
      assert.equal(writes,0,'Duplicate sale must be rejected locally before transaction RPC');
    }finally{
      page.off('request',onRequest);
      await modalTitle.locator('..').locator('button').first().click();
    }
  });
  await t.test('P0.03 UI sale rejects discount greater than subtotal without write RPC',async()=>{
    await page.getByText('Sales',{exact:true}).first().click();
    await page.getByText('New Sale',{exact:true}).first().click();
    const modalTitle=page.locator('h3').filter({hasText:'New Sale'}).first();
    await modalTitle.waitFor({timeout:15000});
    let writes=0;
    const onRequest=req=>{if(req.method()==='POST'&&req.url().includes('/rest/v1/rpc/fn_create_sale'))writes++;};
    page.on('request',onRequest);
    try{
      await page.getByText('Discount ($)',{exact:true}).locator('..').locator('input').fill('999999999');
      await page.getByText(/Complete Sale|Charge Card/i).last().click();
      await page.getByText(/Discount can't make the sale total negative/i).first().waitFor({timeout:12000});
      assert.equal(writes,0,'Excessive sale discount must be rejected before transaction RPC');
    }finally{
      page.off('request',onRequest);
      await modalTitle.locator('..').locator('button').first().click();
    }
  });
  await t.test('P0.04 UI inventory form rejects unnamed new stock item without write RPC',async()=>{
    await page.getByText('Inventory',{exact:true}).first().click();
    await page.getByText('New Item',{exact:true}).first().click();
    const modalTitle=page.locator('h3').filter({hasText:'New Inventory Item'}).first();
    await modalTitle.waitFor({timeout:15000});
    let writes=0;
    const onRequest=req=>{if(req.method()==='POST'&&req.url().includes('/rest/v1/rpc/'))writes++;};
    page.on('request',onRequest);
    try{
      await page.getByText('Save Item',{exact:true}).first().click();
      await page.getByText(/Item name is required/i).first().waitFor({timeout:12000});
      assert.equal(writes,0,'Unnamed item must not invoke any stock write RPC');
    }finally{
      page.off('request',onRequest);
      await modalTitle.locator('..').locator('button').first().click();
    }
  });
  await t.test('P0.04 UI inventory rejects minimum stock greater than maximum without RPC',async()=>{
    await page.getByText('Inventory',{exact:true}).first().click();
    await page.getByText('New Item',{exact:true}).first().click();
    const modalTitle=page.locator('h3').filter({hasText:'New Inventory Item'}).first();
    await modalTitle.waitFor({timeout:15000});
    let writes=0;
    const onRequest=req=>{if(req.method()==='POST'&&req.url().includes('/rest/v1/rpc/'))writes++;};
    page.on('request',onRequest);
    try{
      await page.getByText('Item Name',{exact:true}).locator('..').locator('input').fill('QA_VALIDATION_ONLY_UNSAVED');
      await page.getByText('Minimum Stock',{exact:true}).locator('..').locator('input').fill('10');
      await page.getByText('Maximum Stock',{exact:true}).locator('..').locator('input').fill('5');
      await page.getByText('Save Item',{exact:true}).first().click();
      await page.getByText(/Minimum stock can't exceed maximum stock/i).first().waitFor({timeout:12000});
      assert.equal(writes,0,'Inconsistent stock bounds must not submit any write RPC');
    }finally{
      page.off('request',onRequest);
      await modalTitle.locator('..').locator('button').first().click();
    }
  });
  // UI-only validation against the TEST tenant: malformed inventory inputs must never reach the write API.
  for (const {label,negative,error} of [
    {label:'Starting Quantity',negative:'-5',error:/Starting quantity must be a valid nonnegative number/i},
    {label:'Minimum Stock',negative:'-1',error:/Minimum stock must be a valid nonnegative number/i},
    {label:'Cost per Unit ($)',negative:'-2',error:/Cost per unit must be a valid nonnegative number/i}
  ]) {
    await t.test('P0.04 UI inventory rejects invalid negative numeric fields: '+label,async()=>{
      await page.getByText('Inventory',{exact:true}).first().click();
      await page.getByText('New Item',{exact:true}).first().click();
      const modalTitle=page.locator('h3').filter({hasText:'New Inventory Item'}).first();
      await modalTitle.waitFor({timeout:15000});
      let writeCalls=0;
      const onRequest=req=>{if(req.method()==='POST' && req.url().includes('/rest/v1/rpc/fn_add_initial_stock')) writeCalls++;};
      page.on('request',onRequest);
      try{
        await page.getByText('Item Name',{exact:true}).locator('..').locator('input').fill('QA_INPUT_VALIDATION_NOT_SAVED');
        await page.getByText(label,{exact:true}).locator('..').locator('input').fill(negative);
        await page.getByText('Save Item',{exact:true}).first().click();
        await page.getByText(error).first().waitFor({timeout:12000});
        assert.equal(writeCalls,0,'Invalid '+label+' must be rejected before stock-creation RPC');
      } finally {
        page.off('request',onRequest);
        await modalTitle.locator('..').locator('button').first().click();
      }
    });
  }
  await t.test('P0.05 UI purchase form rejects invalid order locally without creation RPC',async()=>{
    await page.getByText('Purchases',{exact:true}).first().click();
    await page.getByText('New Purchase',{exact:true}).first().click();
    const modalTitle=page.locator('h3').filter({hasText:'New Purchase Order'}).first();
    await modalTitle.waitFor({timeout:15000});
    let writes=0;
    const onRequest=req=>{if(req.method()==='POST'&&/\/rest\/v1\/rpc\/fn_create_purchase_order/.test(req.url()))writes++;};
    page.on('request',onRequest);
    try{
      await page.getByText('+ Add another item',{exact:true}).first().click();
      await page.getByText('Save as Draft',{exact:true}).first().click();
      await page.getByText(/Select a supplier|same inventory item can't appear more than once on a purchase order/i).first().waitFor({timeout:12000});
      assert.equal(writes,0,'Missing supplier or duplicate lines must not create a PO');
    }finally{
      page.off('request',onRequest);
      await modalTitle.locator('..').locator('button').first().click();
    }
  });
  // Fake supplier exists ONLY as an intercepted GET in this separate TEST browser page.
  // No supplier is persisted, and even valid purchase writes are intercepted and simulated.
  await t.test('P0.05 UI purchase form validates bad inputs and submits mocked valid order',async t=>{
    const purchasePage=await browser.newPage({viewport:{width:1366,height:768}});
    let writeCalls=0, allowMockSuccess=false, recordedPurchase=null;
    const qaBusiness='3849b750-20f7-4929-8699-737a4e1983c8';
    const supplierLabel='QA_UI_ONLY_SUPPLIER_NOT_PERSISTED';
    try{
      await purchasePage.route('**/rest/v1/suppliers?*',async route=>{
        if(route.request().method()!=='GET') return route.continue();
        const target=new URL(route.request().url());
        assert.equal(target.hostname,HOST,'Supplier route must be TEST only');
        assert.equal(target.searchParams.get('business_id'), 'eq.'+qaBusiness,'Do not fake suppliers for another tenant');
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{
          id:'10000000-0000-4000-8000-000000000099',
          business_id:qaBusiness,name:supplierLabel,active:true,created_at:'2026-10-13T00:00:00Z'
        }])});
      });
      await purchasePage.route('**/rest/v1/rpc/fn_create_purchase_order*',async route=>{
        writeCalls++;
        const req=route.request();
        const target=new URL(req.url());
        if(target.hostname!==HOST || req.method()!=='POST') return route.abort();
        if(!allowMockSuccess) return route.abort();
        recordedPurchase=req.postDataJSON();
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          id:'10000000-0000-4000-8000-000000000098',business_id:qaBusiness,status:recordedPurchase.p_status,po_number:990099
        })});
      });
      await purchasePage.goto('http://127.0.0.1:4179/',{waitUntil:'domcontentloaded',timeout:30000});
      await purchasePage.locator('input[name=email]').fill(process.env.QA_TWO_TENANT_B_EMAIL);
      await purchasePage.locator('input[name=password]').fill(process.env.QA_TWO_TENANT_B_PASSWORD);
      await purchasePage.locator('button[type=submit]').click();
      await purchasePage.getByText('ZZ_QA_PLATFORM_20261009_AUTO',{exact:false}).first().waitFor({timeout:40000});
      await purchasePage.getByText('Purchases',{exact:true}).first().click();
      await purchasePage.getByText('New Purchase',{exact:true}).first().click();
      const modal=purchasePage.locator('h3').filter({hasText:'New Purchase Order'}).first();
      await modal.waitFor({timeout:15000});
      await purchasePage.locator('option').filter({hasText:supplierLabel}).first().waitFor({state:'attached',timeout:10000});
      // Supplier and inventory arrive asynchronously; the first list being ready
      // does NOT prove the other is ready. Require the actual isolated TEST item
      // before testing any purchase form validation or simulated submission.
      const expectedQaItem='b226d34d-650d-46ae-a81d-5bd48c611c68';
      const itemSelect=purchasePage.locator('div.flex-1 select').first();
      await itemSelect.locator('option[value="'+expectedQaItem+'"]').waitFor({state:'attached',timeout:25000});
      await itemSelect.selectOption(expectedQaItem);
      const qty=purchasePage.locator('.w-20 input[type="number"]').first();
      const cost=purchasePage.locator('.w-24 input[type="number"]').first();
      await t.test('zero purchase quantity is rejected before RPC',async()=>{
        await qty.fill('0');
        await purchasePage.getByText('Save as Draft',{exact:true}).first().click();
        await purchasePage.getByText(/at least one item with a quantity greater than zero/i).first().waitFor({timeout:12000});
        assert.equal(writeCalls,0);
      });
      await t.test('negative supplier unit cost is rejected before RPC',async()=>{
        await qty.fill('1');
        await cost.fill('-2');
        await purchasePage.getByText('Save as Draft',{exact:true}).first().click();
        console.log('QA_P005_DIAG_NEGATIVE_COST '+JSON.stringify({
          quantity:await qty.inputValue(),cost:await cost.inputValue(),
          itemId:await purchasePage.locator('div.flex-1 select').first().inputValue(),
          itemOptions:await purchasePage.locator('div.flex-1 select').first().locator('option').count(),
          supplier:await purchasePage.getByText('Supplier',{exact:true}).locator('..').locator('select').inputValue(),
          errors:await purchasePage.locator('div.text-xs.font-semibold.mb-3.px-3.py-2.rounded-xl').allTextContents()
        }));
        await purchasePage.getByText(/Unit cost must be a valid number greater than or equal to zero/i).first().waitFor({timeout:12000});
        assert.equal(writeCalls,0);
      });
      await t.test('discount greater than subtotal is rejected before RPC',async()=>{
        await cost.fill('1');
        await purchasePage.getByText('Discount ($)',{exact:true}).locator('..').locator('input').fill('999999');
        await purchasePage.getByText('Save as Draft',{exact:true}).first().click();
        console.log('QA_P005_DIAG_DISCOUNT '+JSON.stringify({
          quantity:await qty.inputValue(),cost:await cost.inputValue(),
          itemId:await purchasePage.locator('div.flex-1 select').first().inputValue(),
          discount:await purchasePage.getByText('Discount ($)',{exact:true}).locator('..').locator('input').inputValue(),
          errors:await purchasePage.locator('div.text-xs.font-semibold.mb-3.px-3.py-2.rounded-xl').allTextContents()
        }));
        await purchasePage.getByText(/Discount can't make the purchase order total negative/i).first().waitFor({timeout:12000});
        assert.equal(writeCalls,0);
      });
      assert.equal(writeCalls,0,'No purchase-create RPC should be sent in any invalid scenario');
      await t.test('valid purchase form submits correct payload and confirms mocked success, with zero DB writes',async()=>{
        const expectedItem='b226d34d-650d-46ae-a81d-5bd48c611c68';
        await purchasePage.locator('div.flex-1 select').first().selectOption(expectedItem);
        await qty.fill('2');
        await cost.fill('3.50');
        await purchasePage.getByText('Discount ($)',{exact:true}).locator('..').locator('input').fill('0');
        allowMockSuccess=true;
        await purchasePage.getByText('Submit Order',{exact:true}).first().click();
        await modal.waitFor({state:'detached',timeout:15000});
        assert.equal(writeCalls,1,'One mocked creation request expected');
        assert.equal(recordedPurchase?.p_business_id,qaBusiness,'Must not submit a purchase to another tenant');
        assert.equal(recordedPurchase?.p_supplier_id,'10000000-0000-4000-8000-000000000099');
        assert.equal(recordedPurchase?.p_status,'Ordered');
        assert.equal(recordedPurchase?.p_request_id,undefined,'TEST purchase idempotency flag must remain OFF');
        assert.equal(recordedPurchase?.p_items?.length,1);
        assert.equal(recordedPurchase.p_items[0].inventory_item_id,expectedItem);
        assert.equal(recordedPurchase.p_items[0].qty,2);
        assert.equal(recordedPurchase.p_items[0].unit_cost,3.5);
      });
      await t.test('valid draft purchase submits once and stays isolated to mocked HTTP',async()=>{
        // Reopen a fresh modal, so the draft has an independent request ID and status.
        await purchasePage.getByText('New Purchase',{exact:true}).first().click();
        await modal.waitFor({state:'visible',timeout:15000});
        await purchasePage.locator('option').filter({hasText:supplierLabel}).first().waitFor({state:'attached',timeout:10000});
        const draftItem=purchasePage.locator('div.flex-1 select').first();
        await draftItem.locator('option[value="'+expectedQaItem+'"]').waitFor({state:'attached',timeout:15000});
        await draftItem.selectOption(expectedQaItem);
        await purchasePage.locator('.w-20 input[type="number"]').first().fill('3');
        await purchasePage.locator('.w-24 input[type="number"]').first().fill('2');
        const before=writeCalls;
        await purchasePage.getByText('Save as Draft',{exact:true}).first().click();
        await modal.waitFor({state:'detached',timeout:15000});
        assert.equal(writeCalls,before+1,'Exactly one mocked draft-creation request expected');
        assert.equal(recordedPurchase.p_business_id,qaBusiness);
        assert.equal(recordedPurchase.p_status,'Draft');
        assert.equal(recordedPurchase.p_request_id,undefined,'Purchase idempotency migration must remain OFF');
        assert.equal(recordedPurchase.p_items.length,1);
        assert.equal(recordedPurchase.p_items[0].inventory_item_id,expectedQaItem);
        assert.equal(recordedPurchase.p_items[0].qty,3);
        assert.equal(recordedPurchase.p_items[0].unit_cost,2);
      });
    }finally{
      await purchasePage.close();
    }
  });
  await t.test('dashboard desktop screenshot was captured',async()=>{
   const {stat}=await import('node:fs/promises');
   const shot=await stat('qa-browser-artifacts/dashboard-desktop.png');
   assert.ok(shot.size>10000,'Dashboard screenshot too small to review');
  });
  await t.test('desktop still allows scrolling with navigation available',async()=>{
   const metrics=await page.evaluate(()=>({height:document.documentElement.scrollHeight,viewport:window.innerHeight}));
   assert.ok(metrics.height>0 && metrics.viewport>0);
   assert.equal(await page.getByText('NEXALVO',{exact:false}).count()>0,true);
  });
  await t.test('desktop page has no uncaught JS exceptions',async()=>{assert.deepEqual(errors,[])});
  await t.test('P0.02 UI: logout clears authentication and returns to login form',async()=>{
    await page.getByText('Settings',{exact:true}).first().click();
    await page.getByText('Log Out',{exact:true}).first().click();
    await page.locator('input[name=email]').waitFor({state:'visible',timeout:20000});
    assert.equal(await page.locator('input[name=password]').count(),1);
  });
  await t.test('P0.02 UI: page reload does not resurrect logged-out session',async()=>{
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('input[name=email]').waitFor({state:'visible',timeout:15000});
    assert.equal(await page.locator('input[name=password]').count(),1);
  });
  await t.test('P0.02 UI: re-login after logout restores TEST owner session',async()=>{
    await page.locator('input[name=email]').fill(process.env.QA_TWO_TENANT_B_EMAIL);
    await page.locator('input[name=password]').fill(process.env.QA_TWO_TENANT_B_PASSWORD);
    await page.locator('button[type=submit]').click();
    await page.locator('input[name=email]').waitFor({state:'detached',timeout:40000});
    await page.getByText('ZZ_QA_PLATFORM_20261009_AUTO',{exact:false}).first().waitFor({state:'attached',timeout:40000});
  });
  await t.test('P0.06 browser: temporary offline state keeps existing TEST interface visible',async()=>{
    const ctx=page.context();
    await ctx.setOffline(true);
    try{
      const nav=page.getByText('Inventory',{exact:true}).first();
      await nav.click({timeout:10000});
      assert.equal(await page.getByText('NEXALVO',{exact:false}).count()>0,true,'Offline must not immediately crash shell');
      assert.equal(await page.locator('input[name=password]').count(),0,'Transient outage must not force logout');
    }finally{
      await ctx.setOffline(false);
    }
  });
  await t.test('P0.06 browser: reconnect and reload restores authenticated TEST dashboard',async()=>{
    await page.reload({waitUntil:'domcontentloaded',timeout:30000});
    await page.getByText('ZZ_QA_PLATFORM_20261009_AUTO',{exact:false}).first().waitFor({state:'attached',timeout:40000});
    assert.equal(await page.locator('input[name=password]').count(),0);
    assert.equal(await page.getByText('NEXALVO',{exact:false}).count()>0,true);
  });
  const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const mobileErrors=[];mobile.on('pageerror',e=>mobileErrors.push(e.message));
  await mobile.goto('http://127.0.0.1:4179/',{waitUntil:'domcontentloaded',timeout:30000});
  await mobile.locator('input[name=email]').fill(process.env.QA_TWO_TENANT_B_EMAIL);
  await mobile.locator('input[name=password]').fill(process.env.QA_TWO_TENANT_B_PASSWORD);
  await mobile.locator('button[type=submit]').click();
  await t.test('mobile owner can sign in and render dashboard',async()=>{
   await mobile.locator('input[name=email]').waitFor({state:'detached',timeout:40000});
   await mobile.getByText('ZZ_QA_PLATFORM_20261009_AUTO',{exact:false}).first().waitFor({state:'attached',timeout:40000});
   assert.equal(await mobile.locator('input[name=password]').count(),0,'Mobile login form must be gone');
  });
  await mobile.screenshot({path:'qa-browser-artifacts/dashboard-mobile.png',fullPage:true});
  await t.test('mobile page has no uncaught JS exceptions',async()=>assert.deepEqual(mobileErrors,[]));
 }finally{await browser.close()}
});
