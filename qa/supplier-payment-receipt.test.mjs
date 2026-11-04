// Actual RPC wrapper, synthetic HTTP receipts only. No supplier payment is executed.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const start=source.indexOf('let _unconfirmedRpcWrite ='),end=source.indexOf('function encodeStorageObjectPath(',start);
assert.ok(start>=0&&end>start);
const order='11111111-1111-4111-8111-111111111111',payment='22222222-2222-4222-8222-222222222222';
const request={p_purchase_order_id:order,p_amount:10,p_payment_method:'Card'};
function actualRpc(receipt){let calls=0;const context=vm.createContext({Date,Set,Map,Number,JSON,Object,String,supabaseFetch:async()=>{calls++;return{ok:true,status:200,json:async()=>receipt};}});vm.runInContext(source.slice(start,end)+';globalThis.api=supabaseRest;',context);return{api:context.api,count:()=>calls};}

test('empty successful supplier payment response cannot confirm or permit another payment',async()=>{
 const {api,count}=actualRpc(null);
 await assert.rejects(api.rpc('fn_pay_purchase_order',request),e=>e.commitUncertain===true);
 await assert.rejects(api.rpc('fn_pay_purchase_order',request),e=>e.commitUncertain===true);
 assert.equal(count(),1);
});

const valid={id:payment,purchase_order_id:order,amount:'10.00',payment_method:'Card',status:'completed'};
for(const [name,changed]of[
 ['missing ID',{id:undefined}],['invalid ID',{id:'not-a-payment'}],
 ['different order',{purchase_order_id:payment}],['different amount',{amount:'9.99'}],
 ['nonfinite amount',{amount:'Infinity'}],['boolean amount',{amount:true}],
 ['different method',{payment_method:'Cash'}],['reversed payment',{status:'reversed'}],
 ['missing status',{status:undefined}],
])test(`${name} in a 200 receipt is uncertain and blocks forwarding again`,async()=>{
 const {api,count}=actualRpc({...valid,...changed});
 await assert.rejects(api.rpc('fn_pay_purchase_order',request),e=>e.commitUncertain===true&&e.code==='PAYMENT_RECEIPT_UNCONFIRMED');
 await assert.rejects(api.rpc('fn_pay_purchase_order',request));assert.equal(count(),1);
});
test('a collection is not a single payment receipt',async()=>{
 const {api}=actualRpc([valid]);await assert.rejects(api.rpc('fn_pay_purchase_order',request),e=>e.commitUncertain===true);
});
test('matching payment receipt confirms numeric and numeric-string amounts',async()=>{
 for(const amount of [10,'10.00']){const receipt={...valid,amount},{api,count}=actualRpc(receipt);assert.deepEqual(await api.rpc('fn_pay_purchase_order',request),receipt);assert.equal(count(),1);}
});
test('validation is specific to payment receipt and preserves other RPC contracts',async()=>{
 const {api}=actualRpc(true);assert.equal(await api.rpc('user_can',{p_permission_key:'paySuppliers'}),true);
});
