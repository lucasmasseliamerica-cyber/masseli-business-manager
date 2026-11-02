// Actual Chromium/React, all remote traffic intercepted. No Supabase access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { C2, reconcileC2, recoveryC2 } from './stock-c2-protocol.mjs';
import { STOCK_ACTORS } from './stock-journey-core.mjs';
import { fixture, commitLoss, commitAudit } from './stock-c2-test-support.mjs';
import { prepareC2Runtime } from './stock-c2-browser-runtime.mjs';
import { runC2Browser } from './stock-c2-browser.mjs';

async function harness(fault) {
  const v=fixture(),state={phase:'RESERVED',baseline:structuredClone(v),startedAt:Date.now()-1},report={stock_requests_forwarded:0,audit_requests_forwarded:0};
  const phases=[],sent=[];let persisted,remote=0;
  const runtime=await prepareC2Runtime({config:{origin:'https://msinksoilkluooxenecy.supabase.co',key:'sb_publishable_SYNTHETIC_ONLY'}});
  const actual=runtime.browser;
  const tables={users:[{id:STOCK_ACTORS.A.owner,business_id:STOCK_ACTORS.A.business,name:'SYNTHETIC C2 OWNER',role:'OWNER',active:true,permission_overrides:{}}],
    businesses:[{id:STOCK_ACTORS.A.business,name:'SYNTHETIC C2 TENANT',currency:'USD',timezone:'America/New_York',status:'ACTIVE',platform_status:'ACTIVE'}],
    locations:v.locations,inventory_items:[v.item],products:[],product_recipes:[]};
  const browser={newContext:async options=>{
    const ctx=await actual.newContext(options),routeImpl=ctx.route.bind(ctx);
    ctx.setDefaultTimeout=()=>{};
    // Bound failure scenarios without changing the real driver.
    let page;
    const pageImpl=ctx.newPage.bind(ctx);ctx.newPage=async()=>{page=await pageImpl();page.setDefaultTimeout(3000);return page;};
    ctx.route=async(pattern,guard)=>routeImpl(pattern,async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin==='http://127.0.0.1:4191')return guard(route);
      if(url.hostname!=='msinksoilkluooxenecy.supabase.co')return route.abort();
      const reply=(body,headers={})=>route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(body)});
      if(url.pathname==='/auth/v1/user')return reply({id:STOCK_ACTORS.A.owner,app_metadata:{}});
      if(['GET','HEAD','OPTIONS'].includes(req.method())){
        const name=url.pathname.replace('/rest/v1/','');
        let rows=name==='rpc/fn_read_inventory_stock_secure'?v.stocks:name==='rpc/fn_read_inventory_transactions_secure'?v.transactions:name==='rpc/fn_read_waste_transactions_secure'?v.waste:name==='audit_logs'?v.audit:tables[name]||[];
        for(const [key,value]of url.searchParams){if(value.startsWith('eq.'))rows=rows.filter(r=>String(r[key])===value.slice(3));if(value.startsWith('in.('))rows=rows.filter(r=>value.slice(4,-1).split(',').includes(r[key]));}
        const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||rows.length||1);
        return reply(rows.slice(offset,offset+limit),{'content-range':rows.length?`${offset}-${Math.min(offset+limit,rows.length)-1}/${rows.length}`:'*/0'});
      }
      const rpc=url.pathname.replace('/rest/v1/rpc/','');
      if(['fn_session_access_status','current_business_id','user_can'].includes(rpc))return reply([]);
      return guard({request:()=>req,abort:()=>route.abort(),continue:()=>{remote++;assert.fail('no remote network');},fetch:async options=>{
        assert.equal(options.maxRetries,0);assert.equal(options.maxRedirects,0);sent.push(rpc);
        assert.equal(persisted.phase,rpc==='fn_record_waste'?'LOSS_INTENT':'AUDIT_INTENT');
        const row=rpc==='fn_record_waste'?commitLoss(v):commitAudit(v);
        if(fault===rpc)throw Error('SYNTHETIC_COMMITTED_RESPONSE_LOST');
        return{ok:()=>true,json:async()=>row,body:row};},fulfill:({response})=>reply(response.body)});
    });return ctx;
  }};
  return {state,report,client:{view:async()=>structuredClone(v),browserSession:()=>({token:'SYNTHETIC_C2_SESSION',user:{id:STOCK_ACTORS.A.owner,app_metadata:{}}})},
    runtime:{browser},save:()=>{persisted=structuredClone(state);phases.push(state.phase);},gate:()=>{},
    observations:()=>({v,sent,phases,remote,persisted}),close:()=>runtime.close()};
}
test('SIMULATED C2 actual UI loss, separate audit, reload and history', {timeout:60000},async()=>{
  const h=await harness();try{await runC2Browser(h);const o=h.observations();
    assert.equal(h.report.ui_cycle,'PASS');assert.equal(h.report.persist_reload,'PASS');assert.equal(h.report.ui_history,'PASS');
    assert.deepEqual(o.sent,['fn_record_waste','fn_write_audit']);assert.equal(o.remote,0);
    assert.equal(reconcileC2(h.state.baseline,o.v,1,1,h.state.intentAt).final_quantity,1.875);
    assert.deepEqual(o.phases,['LOSS_INTENT','LOSS_CONFIRMED','AUDIT_INTENT','AUDIT_CONFIRMED']);
  }finally{await h.close();}
});
for(const fault of ['fn_record_waste','fn_write_audit'])test(`SIMULATED C2 UI committed ${fault} response lost stops without replay`,{timeout:45000},async()=>{
  const h=await harness(fault);try{await assert.rejects(()=>runC2Browser(h));const o=h.observations();assert.equal(o.remote,0);
    assert.deepEqual(o.sent,fault==='fn_record_waste'?['fn_record_waste']:['fn_record_waste','fn_write_audit']);
    const recovery=recoveryC2(o.persisted,o.v);assert.equal(recovery.resume_allowed,false);assert.equal(recovery.full_homologation,false);
    assert.equal(recovery.audit_rows,fault==='fn_write_audit'?1:0);
  }finally{await h.close();}
});
