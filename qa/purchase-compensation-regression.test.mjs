import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('qa/p0-purchase-browser-persistent.TEST.mjs','utf8');
const start=source.indexOf('async function verifyPaymentReversal(');
const journey=source.indexOf("test('P0.05 REAL TEST",start);
assert.ok(start>=0&&journey>start,'Purchase runner boundaries missing');

function verify(payments,entries){
 const context=vm.createContext({assert,api:async path=>path.startsWith('/rest/v1/purchase_order_payments?')?payments:entries});
 vm.runInContext(source.slice(start,journey)+';globalThis.verify=verifyPaymentReversal;',context);
 return context.verify('mock-session','mock-order');
}

const reversed=[{id:'mock-payment',amount:2,status:'reversed'}];
const offset=[{type:'expense',amount:2},{type:'income',amount:2}];
test('planned reversal verifies a single reversed payment and its two ledger entries',()=>verify(reversed,offset));
test('planned reversal requires one reversed payment',async()=>{
 await assert.rejects(verify([],[]),/exactly one supplier payment/);
 await assert.rejects(verify([{...reversed[0],status:'completed'}],[]),/must be reversed/);
});
test('planned reversal rejects a missing ledger entry or an incorrect amount',async()=>{
 await assert.rejects(verify(reversed,offset.slice(0,1)),/payment and reversal ledger entries/);
 await assert.rejects(verify(reversed,[offset[0],{...offset[1],amount:1}]),/amount differs/);
 await assert.rejects(verify(reversed,offset.map(entry=>({...entry,amount:1}))),/amount differs/);
});

test('an uncertain purchase submission stops the journey and closes only its browser',async()=>{
 const apiPaths=[],clicks=[],messages=[];
 let closed=0,run;
 const uncertainty=new Error('No purchase receipt observed');
 const locator=text=>({
  first:()=>locator(text),filter:()=>locator(text),locator:()=>locator(text),
  fill:async()=>{},waitFor:async()=>{},selectOption:async()=>{},
  click:async()=>{clicks.push(text)},
 });
 const page={goto:async()=>{},locator,getByText:locator};
 const context=vm.createContext({
  test(_name,_options,fn){run=fn},assert,
  console:{error:message=>messages.push(message)},
  BUSINESS:'mock-company',OWNER:'mock-owner',SUPPLIER:'mock-supplier',ITEM:'mock-item',LOCATION:'mock-location',TAG:'mock-tag',
  process:{env:{}},AbortSignal,fetch:async()=>({status:200}),stock:async()=>15,
  api:async path=>{
   apiPaths.push(path);
   if(path.startsWith('/auth/v1/token'))return {access_token:'synthetic'};
   if(path==='/auth/v1/user')return {id:'mock-owner'};
   if(path.startsWith('/rest/v1/suppliers?')||path.startsWith('/rest/v1/inventory_items?'))return [{business_id:'mock-company',active:true}];
   throw new Error('Unexpected API call');
  },
  chromium:{launch:async()=>({newPage:async()=>page,close:async()=>{closed++}})},
  waitForOrder:async()=>{throw uncertainty},
 });
 vm.runInContext(source.slice(journey),context);
 await assert.rejects(run(),error=>error===uncertainty);
 assert.equal(apiPaths.length,4);
 assert.equal(clicks.filter(text=>text==='Submit Order').length,1);
 assert.equal(clicks.at(-1),'Submit Order');
 assert.equal(closed,1);
 assert.deepEqual(messages,['P0.05 STOPPED {"tag":"mock-tag","poId":null,"next":"READ_ONLY_RECONCILIATION"}']);
});
