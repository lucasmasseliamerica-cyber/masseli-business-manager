import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('qa/p0-purchase-browser-persistent.TEST.mjs','utf8');
const start=source.indexOf('async function verifyPaymentCompensation(');
const end=source.indexOf("test('P0.05 REAL TEST",start);
assert.ok(start>=0&&end>start,'Compensation helper boundaries missing');
function verify(payments,entries){
 const context=vm.createContext({assert,api:async path=>path.startsWith('/rest/v1/purchase_order_payments?')?payments:entries});
 vm.runInContext(source.slice(start,end)+';globalThis.verify=verifyPaymentCompensation;',context);
 return context.verify('mock-session','mock-order');
}
const reversed=[{id:'mock-payment',amount:2,status:'reversed'}];
test('failed purchase flow: reversed payment and offsetting ledger pass',()=>verify(reversed,[{type:'expense',amount:2},{type:'income',amount:2}]));
test('failed purchase flow: active payment cannot be accepted as compensated',()=>assert.rejects(verify([{id:'mock-payment',amount:2,status:'completed'}],[]),/non-reversed/));
test('failed purchase flow: unbalanced ledger fails compensation',()=>assert.rejects(verify(reversed,[{type:'expense',amount:2},{type:'income',amount:1}]),/nonzero financial/));
test('failed purchase flow: missing compensating entry fails',()=>assert.rejects(verify(reversed,[{type:'expense',amount:2}]),/missing ledger/));
test('cancelled purchase without payment requires no payment reversal',()=>verify([],[]));
