import test from 'node:test';
import assert from 'node:assert/strict';
import { openC2Client } from './stock-c2-client.mjs';
import { STOCK_ACTORS } from './stock-journey-core.mjs';
import { C2 } from './stock-c2-protocol.mjs';
import { fixture } from './stock-c2-test-support.mjs';
test('C2 client only authenticates independent OWNERs and reads exact C2 scope, no business POST',async()=>{
  const calls=[],v=fixture();
  const fake=async(url,options)=>{
    calls.push({url:String(url),method:options.method});assert.equal(url.hostname,'msinksoilkluooxenecy.supabase.co');
    const actor=options.headers.Authorization?.includes('SYNTHETIC_B')?'B':'A',owner=STOCK_ACTORS[actor];let data=[];
    if(url.pathname==='/auth/v1/token')data={access_token:JSON.parse(options.body).email==='SYNTHETIC_A'?'SYNTHETIC_A':'SYNTHETIC_B'};
    else if(url.pathname==='/auth/v1/user')data={id:owner.owner};
    else if(url.pathname==='/rest/v1/users')data=[{id:owner.owner,business_id:owner.business,role:'OWNER',active:true}];
    else if(url.pathname.endsWith('/current_business_id'))data=owner.business;
    else if(url.pathname.endsWith('/user_can'))data=true;
    else if(options.headers.Authorization==='Bearer SYNTHETIC_A'){
      data=url.pathname.endsWith('/inventory_items')?[v.item]:url.pathname.endsWith('/locations')?v.locations:url.pathname.endsWith('/fn_read_inventory_stock_secure')?v.stocks:[];
    }
    return {ok:true,status:200,json:async()=>data,headers:{get:()=>Array.isArray(data)?`*/${data.length}`:null}};
  };
  const c=await openC2Client({origin:'https://msinksoilkluooxenecy.supabase.co',key:'sb_publishable_SYNTHETIC'},
    {QA_TWO_TENANT_A_EMAIL:'SYNTHETIC_A',QA_TWO_TENANT_B_EMAIL:'SYNTHETIC_B'},fake);
  try{const view=await c.view();assert.equal(view.item.id,C2.item);await c.isolation();assert.throws(()=>c.read('/rest/v1/rpc/fn_record_waste'));
    assert.ok(calls.filter(c=>c.method==='POST').every(c=>c.url.includes('/auth/v1/token')));
    assert.ok(calls.some(c=>c.url.includes(C2.location)));assert.ok(!calls.some(c=>c.url.includes('6ebfef52-f6c2-4561-b2ac-b3d4bfca1c5f')));
  }finally{await c.close();}
});
