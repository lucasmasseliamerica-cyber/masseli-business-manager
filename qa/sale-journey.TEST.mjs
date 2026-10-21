// B-Jornada opt-in only: one TEST sale, one immutable sale ID, one successful reversal.
// Never run from ordinary CI. No Stripe, terminals, fixture creation, ledger deletion or DDL.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, existsSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { SALE_ACTORS, SaleSignal, requireSale, saleHash, saleConfiguration, validateSaleCatalog,
  validateSaleFixture, validateSalePayload, assertSaleObserved, safeSaleReport } from './sale-journey-core.mjs';

const LOCAL = 'http://127.0.0.1:4188';
const delay = ms => new Promise(r => setTimeout(r, ms));
const checks = ['catalog', 'owner_a_b', 'permissions', 'read_isolation', 'exclusive_fixture', 'snapshot',
  'ui_totals', 'ui_translation', 'same_id_replay', 'persist_reload', 'write_isolation', 'stock_deduction', 'single_income',
  'ui_reversal', 'history_preserved', 'stock_and_cost_restored', 'financial_net_zero'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const stableRows = rows => rows.map(row => Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)))).sort((a,b) => String(a.id).localeCompare(String(b.id)));

export async function recordSaleFailure(error, {report,args,snapshot,compensate,checkpoint}) {
  report.status=error instanceof SaleSignal?error.status:'BLOCKED';
  report.code=error instanceof SaleSignal?error.code:'SALE_EXECUTION_UNCONFIRMED';
  // Inspection modes must never fall through to a business write, even on a failed read.
  if(!args.includes('--reconcile-readonly')&&!args.includes('--preflight')&&snapshot&&compensate&&!report.restored){
    try{await compensate();}catch(e){report.compensation_code=e instanceof SaleSignal?e.code:'COMPENSATION_UNCONFIRMED';}
  }
  if(snapshot?.writeUncertain)report.code='UNKNOWN_SALE_RESULT_REQUIRES_RECONCILIATION';
  report.recovery_checkpoint_retained=!!checkpoint;
}

export async function saleJourney(env = process.env, args = process.argv.slice(2)) {
  const report = { scope: 'B_JOURNEY_REAL_TEST_SALE', status: 'BLOCKED', code: 'NOT_STARTED',
    checks: Object.fromEntries(checks.map(c => [c, 'BLOCKED'])), restored: false,
    sale_ids_forwarded: 0, create_requests_forwarded: 0, reversal_requests_forwarded: 0,
    denied_cross_tenant_write_probes: 0, payments_processed: 0, history_rows_deleted: 0 };
  const sessions = {};
  let config, snapshot, checkpoint, api, browser, server, routeFailure, stopped = false, browserWriteInFlight = false;
  const stop = () => { stopped = true; };
  const pass = name => { report.checks[name] = 'PASS'; };
  const save = phase => {
    snapshot.phase = phase;
    const encoded=JSON.stringify(snapshot);
    requireSale(!/Bearer\s|eyJ[A-Za-z0-9_-]{16,}\.|[?&](?:access_token|token)=|sb_secret_|-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(encoded),'SECRET_IN_SALE_SNAPSHOT');
    const next = checkpoint + '.next';
    writeFileSync(next, encoded, { mode: 0o600 }); renameSync(next, checkpoint);
  };
  let view, preserveFixture, compensate;
  try {
    config = saleConfiguration(env); // Missing credentials/authorization: no network, file or DB access.
    requireSale(git('branch','--show-current') === 'automation/nexalvo-qa-actions' && !git('status','--porcelain'), 'CLEAN_QA_BRANCH_REQUIRED');
    requireSale(/^[a-f0-9]{40}$/.test(env.QA_SALE_VALIDATED_CODE_SHA || ''), 'VALIDATED_CODE_SHA_REQUIRED');
    git('merge-base','--is-ancestor',env.QA_SALE_VALIDATED_CODE_SHA,'HEAD');
    requireSale(git('diff','--name-only',`${env.QA_SALE_VALIDATED_CODE_SHA}..HEAD`).split('\n').every(p => !p || p.startsWith('docs/')), 'UNVALIDATED_SALE_CODE_CHANGES');
    report.source_sha = git('rev-parse','HEAD');
    let catalog;
    try { catalog = validateSaleCatalog(JSON.parse(readFileSync(env.QA_SALE_CATALOG_FILE, 'utf8'))); }
    catch (e) { throw e instanceof SaleSignal ? e : new SaleSignal('READONLY_SALE_CATALOG_FILE_REQUIRED'); }
    report.catalog_sha256 = saleHash(catalog); pass('catalog');
    process.on('SIGINT',stop); process.on('SIGTERM',stop);
    api = async (path, label='A', { body, method, denied=false }={}) => {
      const target = new URL(path,config.origin);
      requireSale(target.origin === config.origin && !target.username && !target.password, 'API_TARGET_OUTSIDE_TEST');
      let response;
      try { response = await fetch(target, { method: method || (body===undefined ? 'GET':'POST'), redirect:'error',
        headers:{apikey:config.key,Prefer:'count=exact',...(label==='anon' ? (config.key.startsWith('eyJ') ? {Authorization:`Bearer ${config.key}`} : {}) : {Authorization:`Bearer ${sessions[label].token}`}),
          ...(body===undefined ? {} : {'Content-Type':'application/json'})}, ...(body===undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(25000) }); }
      catch { throw new SaleSignal('TEST_RESPONSE_UNKNOWN'); }
      let data; try { data = response.status===204 ? null : await response.json(); } catch { throw new SaleSignal('TEST_RESPONSE_INVALID'); }
      if (denied) return {ok:response.ok,status:response.status,data};
      requireSale(response.ok,'TEST_API_HTTP_'+response.status);
      if (Array.isArray(data)) {
        requireSale(data.length<1000,'SNAPSHOT_PAGE_LIMIT_REACHED');
        if(!target.searchParams.has('limit')||Number(target.searchParams.get('limit'))>=1000){
          const count=Number((response.headers.get('content-range')||'').match(/\/(\d+)$/)?.[1]??NaN);
          requireSale(Number.isFinite(count)&&count===data.length,'INCOMPLETE_SALE_SNAPSHOT');
        }
      }
      return data;
    };
    for (const label of ['A','B']) {
      let response;
      try { response = await fetch(config.origin+'/auth/v1/token?grant_type=password', {method:'POST',redirect:'error',
        headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({email:env[`QA_TWO_TENANT_${label}_EMAIL`],password:env[`QA_TWO_TENANT_${label}_PASSWORD`]}),signal:AbortSignal.timeout(20000)}); }
      catch { throw new SaleSignal('QA_LOGIN_UNAVAILABLE'); }
      requireSale(response.ok,'QA_LOGIN_REJECTED_'+label);
      const login = await response.json(); requireSale(typeof login.access_token==='string','QA_TOKEN_MISSING');
      sessions[label] = {token:login.access_token,user:{id:login.user?.id,app_metadata:login.user?.app_metadata||{}}};
      const identity = await api('/auth/v1/user',label);
      const profiles = await api(`/rest/v1/users?select=id,business_id,role,active&id=eq.${SALE_ACTORS[label].owner}`,label);
      requireSale(identity.id===SALE_ACTORS[label].owner && profiles.length===1 && profiles[0].id===identity.id
        && profiles[0].business_id===SALE_ACTORS[label].business && profiles[0].active===true && profiles[0].role==='OWNER','QA_OWNER_IDENTITY_MISMATCH');
      requireSale(await api('/rest/v1/rpc/current_business_id',label)===profiles[0].business_id,'QA_BUSINESS_CONTEXT_MISMATCH');
    }
    pass('owner_a_b');
    for (const permission of ['manageSales','reverseSales','viewFinancials','manageInventory']) {
      requireSale(await api('/rest/v1/rpc/user_can?p_permission_key='+permission)===true,'OWNER_A_PERMISSION_REQUIRED');
    }
    requireSale(await api('/rest/v1/rpc/user_can?p_permission_key=manageSales','B')===true,'OWNER_B_PERMISSION_REQUIRED'); pass('permissions');
    const b=SALE_ACTORS.A.business;
    const one = async (table,id) => {const rows=await api(`/rest/v1/${table}?select=*&id=eq.${id}&business_id=eq.${b}&limit=2`);requireSale(rows.length===1,'FIXTURE_ROW_MISSING');return rows[0];};
    const product=await one('products',config.productId), location=await one('locations',config.locationId);
    const businesses=await api(`/rest/v1/businesses?select=id,name,currency,tax_enabled,tax_rate,timezone,allow_negative_inventory&id=eq.${b}&limit=2`);
    requireSale(businesses.length===1,'BUSINESS_ROW_MISSING');
    const recipes=await api(`/rest/v1/product_recipes?select=*&product_id=eq.${product.id}&limit=1000`);
    const ids=recipes.map(r=>r.inventory_item_id).join(','); requireSale(ids.length>0 && recipes.length<=3,'SALE_RECIPE_REQUIRED');
    const readStocks=()=>api(`/rest/v1/rpc/fn_read_inventory_stock_secure?select=*&inventory_item_id=in.(${ids})&limit=1000`);
    const readItemHistory=()=>api(`/rest/v1/rpc/fn_read_inventory_transactions_secure?select=*&inventory_item_id=in.(${ids})&limit=1000`);
    const observedProduct=()=>one('products',product.id);
    const observedRecipes=()=>api(`/rest/v1/product_recipes?select=*&product_id=eq.${product.id}&limit=1000`);
    const registers=()=>api(`/rest/v1/cash_registers?select=*&business_id=eq.${b}&location_id=eq.${location.id}&limit=1000`);
    const baseline={schemaVersion:1,scope:'B_JOURNEY_TEST',runId:randomUUID(),product,location,business:businesses[0],recipes,
      inventoryItems:await api(`/rest/v1/inventory_items?select=*&business_id=eq.${b}&id=in.(${ids})&limit=1000`),
      stocks:await readStocks(),recipeUsage:await api(`/rest/v1/product_recipes?select=*&inventory_item_id=in.(${ids})&limit=1000`),
      salesHistory:await api(`/rest/v1/rpc/fn_read_sale_items_secure?select=id&product_id=eq.${product.id}&limit=1`),
      purchaseLines:await api(`/rest/v1/rpc/fn_read_purchase_order_items_secure?select=id&inventory_item_id=in.(${ids})&limit=1`),
      lists:await api(`/rest/v1/business_settings_lists?select=list_type,value,active&business_id=eq.${b}&active=eq.true&order=sort_order.asc&limit=1000`),
      inventoryHistory:await readItemHistory(),registers:await registers(),sourceSha:report.source_sha,catalogSha256:report.catalog_sha256,saleId:null,salePayload:null,writeUncertain:false,
      createForwards:0,reverseAttempted:false,startedAt:new Date().toISOString()};
    // Recovery must not reuse fixture eligibility (the authorized sale now exists in history).
    const recovery=args.includes('--recover')||args.includes('--reconcile-readonly');
    if (!recovery) {baseline.expected=validateSaleFixture(baseline); snapshot=baseline;pass('exclusive_fixture');}
    for (const label of ['B','anon']) {
      const result=await api(`/rest/v1/products?select=id&id=eq.${product.id}`,label,{denied:true});
      requireSale(result.ok ? Array.isArray(result.data)&&!result.data.length : [401,403].includes(result.status),'PRODUCT_ISOLATION_FAILED','FAIL');
    }
    pass('read_isolation');
    if (args.includes('--preflight')) {report.scope='B_JOURNEY_READONLY_PREFLIGHT';report.status='PASS';report.code='READY_WITHOUT_BUSINESS_WRITES';return safeSaleReport(report);}
    const directory=env.QA_SALE_PRIVATE_DIR;
    requireSale(typeof directory==='string'&&existsSync(directory),'PRIVATE_CHECKPOINT_DIRECTORY_REQUIRED');
    const actual=realpathSync(directory).toLowerCase(),temp=resolve(tmpdir()).toLowerCase();
    requireSale(actual.startsWith(temp+'/')||actual.startsWith(temp+'\\'),'SNAPSHOT_OUTSIDE_PRIVATE_TEMP');
    if(process.platform==='win32')requireSale(env.QA_SALE_PRIVATE_DIRECTORY_ACL==='CURRENT_USER_ONLY','WINDOWS_PRIVATE_ACL_REQUIRED');
    else chmodSync(directory,0o700);
    checkpoint=join(directory,'sale-recovery.json');
    if(recovery){
      const index=args.indexOf(args.includes('--recover')?'--recover':'--reconcile-readonly');
      requireSale(resolve(args[index+1]||'')===resolve(checkpoint),'RECOVERY_FILE_OUTSIDE_PRIVATE_DIRECTORY');
      snapshot=JSON.parse(readFileSync(checkpoint,'utf8'));
      requireSale(snapshot.schemaVersion===1 && snapshot.scope==='B_JOURNEY_TEST' && snapshot.product.id===product.id
        && snapshot.location.id===location.id && snapshot.business.id===b,'RECOVERY_SCOPE_MISMATCH');
      const expected=validateSaleFixture(snapshot);requireSale(saleHash(expected)===saleHash(snapshot.expected),'RECOVERY_TERMS_MISMATCH');
      if(snapshot.salePayload)validateSalePayload(snapshot.salePayload,snapshot);
    }else{requireSale(!existsSync(checkpoint),'UNFINISHED_SALE_CHECKPOINT_EXISTS');save('SNAPSHOT_RETAINED');}
    pass('exclusive_fixture');pass('snapshot');
    preserveFixture=async()=>{
      requireSale(saleHash(await observedProduct())===saleHash(snapshot.product),'PRODUCT_CHANGED_DURING_SALE');
      requireSale(saleHash(stableRows(await observedRecipes()))===saleHash(stableRows(snapshot.recipes)),'RECIPE_CHANGED_DURING_SALE');
      requireSale(saleHash(stableRows(await registers()))===saleHash(stableRows(snapshot.registers)),'DRAWER_CHANGED_DURING_SALE');
      const business=await api(`/rest/v1/businesses?select=id,name,currency,tax_enabled,tax_rate,timezone,allow_negative_inventory&id=eq.${b}&limit=2`);
      requireSale(business.length===1&&saleHash(business[0])===saleHash(snapshot.business),'BUSINESS_SETTINGS_CHANGED_DURING_SALE');
      const items=await api(`/rest/v1/inventory_items?select=*&business_id=eq.${b}&id=in.(${ids})&limit=1000`);
      requireSale(saleHash(stableRows(items))===saleHash(stableRows(snapshot.inventoryItems)),'INGREDIENT_CHANGED_DURING_SALE');
      const now=await readItemHistory();
      for(const original of snapshot.inventoryHistory)requireSale(saleHash(now.find(r=>r.id===original.id))===saleHash(original),'HISTORICAL_INVENTORY_ROW_CHANGED');
      const created=now.filter(r=>!snapshot.inventoryHistory.some(old=>old.id===r.id));
      const ownSales=created.filter(r=>r.type==='SALE'&&r.sale_id===snapshot.saleId).map(r=>r.id);
      requireSale(created.every(r=>r.sale_id===snapshot.saleId||(r.type==='REVERSAL'&&ownSales.includes(r.related_transaction_id))),'OTHER_WRITER_IN_STOCK_HISTORY');
    };
    view=async()=>{
      requireSale(snapshot.saleId,'SALE_ID_NOT_CAPTURED');
      const sales=await api(`/rest/v1/sales?select=*&id=eq.${snapshot.saleId}&business_id=eq.${b}`);
      const items=await api(`/rest/v1/rpc/fn_read_sale_items_secure?select=*&sale_id=eq.${snapshot.saleId}&limit=1000`);
      const cash=await api(`/rest/v1/cash_flow?select=*&business_id=eq.${b}&sale_id=eq.${snapshot.saleId}&limit=1000`);
      const all=await readItemHistory(),direct=all.filter(r=>r.sale_id===snapshot.saleId),ownIds=direct.filter(r=>r.type==='SALE').map(r=>r.id);
      const movements=all.filter(r=>r.sale_id===snapshot.saleId||(r.type==='REVERSAL'&&ownIds.includes(r.related_transaction_id)));
      return {sales,items,cash,movements,stocks:await readStocks()};
    };
    const reconcile=async()=>{
      const state=await view();
      report.stock_comparison=snapshot.stocks.map((before,index)=>{
        const after=state.stocks.find(row=>row.id===before.id);
        return{position:index+1,qty_before:Number(before.qty),qty_after:after?Number(after.qty):null,
          average_cost_before:Number(before.avg_cost_per_unit),average_cost_after:after?Number(after.avg_cost_per_unit):null};
      });
      report.financial_summary={currency:'USD',income_rows:state.cash.filter(r=>r.type==='income').length,
        refund_rows:state.cash.filter(r=>r.type==='expense').length,
        net_cents:state.cash.reduce((sum,row)=>sum+(row.type==='income'?1:-1)*Math.round(Number(row.amount)*100),0)};
      requireSale(snapshot.pending!=='probe_reverse','CROSS_TENANT_PROBE_UNSETTLED');
      // Absence is never evidence that an interrupted request rolled back.
      const cancelled=snapshot.pending==='reverse';assertSaleObserved(state,snapshot,cancelled);
      const originals={items:state.items,cash:state.cash.filter(row=>row.type==='income'),movements:state.movements.filter(row=>row.type==='SALE')};
      if(snapshot.committedRows){
        for(const key of ['items','cash','movements'])requireSale(saleHash(stableRows(originals[key]))===saleHash(stableRows(snapshot.committedRows[key])),'ORIGINAL_SALE_HISTORY_CHANGED');
      }else{requireSale(!cancelled,'ORIGINAL_SALE_HISTORY_SNAPSHOT_REQUIRED');snapshot.committedRows=originals;}
      snapshot.writeUncertain=false;snapshot.pending=null;save(cancelled?'REVERSAL_CONFIRMED':'SALE_CONFIRMED');return state;
    };
    compensate=async()=>{
      if(!snapshot.saleId){
        requireSale(!snapshot.writeUncertain,'WRITE_UNKNOWN_WITHOUT_SALE_ID');await preserveFixture();
        requireSale(saleHash(stableRows(await readStocks()))===saleHash(stableRows(snapshot.stocks)),'STOCK_CHANGED_WITHOUT_SALE');
        report.restored=true;save('RESTORED');return;
      }
      if(snapshot.writeUncertain)await reconcile();
      await preserveFixture();
      let state=await view();
      if(state.sales[0]?.status!=='cancelled'){
        assertSaleObserved(state,snapshot,false);
        requireSale(!snapshot.reverseAttempted,'REVERSAL_ALREADY_ATTEMPTED_RECONCILE_ONLY');
        snapshot.reverseAttempted=true;snapshot.writeUncertain=true;snapshot.pending='reverse';save('COMPENSATION_PENDING');
        report.reversal_requests_forwarded++;
        await api('/rest/v1/rpc/fn_reverse_sale','A',{body:{p_sale_id:snapshot.saleId}});
        state=await reconcile();
      }
      assertSaleObserved(state,snapshot,true);await preserveFixture();
      requireSale(snapshot.committedRows,'ORIGINAL_SALE_HISTORY_SNAPSHOT_REQUIRED');
      for(const [key,rows] of Object.entries({items:state.items,cash:state.cash.filter(row=>row.type==='income'),movements:state.movements.filter(row=>row.type==='SALE')})){
        requireSale(saleHash(stableRows(rows))===saleHash(stableRows(snapshot.committedRows[key])),'ORIGINAL_SALE_HISTORY_CHANGED');
      }
      const audit=await api(`/rest/v1/audit_logs?select=id,action,details&business_id=eq.${b}&details=like.${encodeURIComponent('Order #'+state.sales[0].order_no+' *')}&limit=1000`);
      requireSale(audit.filter(row=>row.action==='Sale Created').length===1&&audit.filter(row=>row.action==='Sale Cancelled').length===1,'SALE_AUDIT_NOT_CONFIRMED');
      report.audit_entries_observed=audit.length;
      const positions=rows=>stableRows(rows.map(({id,inventory_item_id,location_id,qty,avg_cost_per_unit})=>({id,inventory_item_id,location_id,qty:Number(qty),avg_cost_per_unit:Number(avg_cost_per_unit)})));
      report.stock_before_sha256=saleHash(positions(snapshot.stocks));report.stock_after_sha256=saleHash(positions(state.stocks));
      report.net_financial_cents=0;report.restored=true;
      pass('history_preserved');pass('stock_and_cost_restored');pass('financial_net_zero');save('RESTORED');
    };
    if(recovery){
      if(snapshot.writeUncertain)await reconcile();
      if(args.includes('--recover'))await compensate();
      else{
        await preserveFixture();
        if(snapshot.saleId){const state=await view();assertSaleObserved(state,snapshot,state.sales[0]?.status==='cancelled');}
        else requireSale(saleHash(stableRows(await readStocks()))===saleHash(stableRows(snapshot.stocks)),'STOCK_CHANGED_WITHOUT_SALE');
      }
      report.code=args.includes('--recover')?'RECOVERY_ONLY_NOT_FULL_HOMOLOGATION':'READONLY_RESULT_RECONCILED';
      return safeSaleReport(report);
    }
    await delay(1000);await preserveFixture();requireSale(saleHash(stableRows(await readStocks()))===saleHash(stableRows(snapshot.stocks)),'CONCURRENT_STOCK_WRITER');
    const {chromium}=await import('playwright');
    const childEnv=Object.fromEntries(['PATH','SystemRoot','ComSpec','PATHEXT','TEMP','TMP','USERPROFILE','WINDIR'].filter(n=>env[n]).map(n=>[n,env[n]]));
    childEnv.VITE_SUPABASE_URL=config.origin;childEnv.VITE_SUPABASE_ANON_KEY=config.key;
    requireSale(!await fetch(LOCAL).then(()=>true).catch(()=>false),'SALE_QA_PORT_IN_USE');
    server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4188','--strictPort'],{env:childEnv,stdio:'ignore'});
    let ready=false;for(let i=0;i<40;i++){if(await fetch(LOCAL).then(r=>r.ok).catch(()=>false)){ready=true;break;}await delay(250);}requireSale(ready,'SALE_VITE_UNAVAILABLE');
    browser=await chromium.launch({headless:true,...(env.NEXALVO_QA_CHROMIUM_PATH?{executablePath:env.NEXALVO_QA_CHROMIUM_PATH}:{})});
    const context=await browser.newContext({serviceWorkers:'block'});
    await context.addInitScript(({token,user})=>{localStorage.setItem('nexalvo.ui.language.v1','en');localStorage.setItem('nexalvo.supabase.session.v1',JSON.stringify({accessToken:token,expiresAt:Date.now()+1800000,user}));},{token:sessions.A.token,user:sessions.A.user});
    context.setDefaultTimeout(15000);
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      let ownsMutation=false;
      try{
        requireSale(!stopped,'SALE_JOURNEY_INTERRUPTED');
        if(url.origin===LOCAL)return route.continue();
        if(url.origin!==config.origin){if(req.method()==='GET')return route.abort();throw new SaleSignal('BROWSER_TARGET_OUTSIDE_TEST');}
        if(['GET','HEAD','OPTIONS'].includes(req.method()))return route.continue();
        if(url.pathname.startsWith('/storage/v1/object/sign/'))return route.continue();
        if(url.pathname==='/rest/v1/rpc/fn_reconcile_business_alerts')return route.abort();
        if(['/rest/v1/rpc/current_business_id','/rest/v1/rpc/user_can','/rest/v1/rpc/fn_session_access_status'].includes(url.pathname))return route.continue();
        if(['/rest/v1/rpc/fn_create_sale','/rest/v1/rpc/fn_reverse_sale'].includes(url.pathname)){
          requireSale(!browserWriteInFlight,'OVERLAPPING_SALE_MUTATION_FORBIDDEN');browserWriteInFlight=true;ownsMutation=true;
        }
        if(req.method()==='POST'&&url.pathname==='/rest/v1/rpc/fn_create_sale'){
          const payload=req.postDataJSON();validateSalePayload(payload,snapshot);
          requireSale(!snapshot.writeUncertain&&snapshot.createForwards<2,'UNKNOWN_OR_EXCESS_SALE_RETRY_FORBIDDEN');
          await preserveFixture();
          if(snapshot.saleId){assertSaleObserved(await view(),snapshot,false);}
          else{
            const previous=await api(`/rest/v1/sales?select=id&id=eq.${payload.p_sale_id}&limit=1`);
            requireSale(previous.length===0,'SALE_ID_ALREADY_EXISTS');
            snapshot.saleId=payload.p_sale_id;snapshot.salePayload=payload;report.sale_ids_forwarded=1;
          }
          snapshot.createForwards++;snapshot.writeUncertain=true;snapshot.pending='create';save('SALE_FORWARD_PENDING');
          report.create_requests_forwarded++;
          const response=await route.fetch({maxRetries:0,timeout:30000});requireSale(response.ok(),'SALE_WRITE_UNCONFIRMED');
          await reconcile();
          if(snapshot.createForwards===1)return route.abort(); // Deliberately lose a positively reconciled response.
          pass('same_id_replay');return route.fulfill({response});
        }
        if(req.method()==='POST'&&url.pathname==='/rest/v1/rpc/fn_reverse_sale'){
          requireSale(req.postDataJSON().p_sale_id===snapshot.saleId&&!snapshot.reverseAttempted&&!snapshot.writeUncertain,'REVERSAL_OUTSIDE_SCOPE_OR_REPLAY');
          await preserveFixture();assertSaleObserved(await view(),snapshot,false);
          snapshot.reverseAttempted=true;snapshot.writeUncertain=true;snapshot.pending='reverse';save('REVERSAL_FORWARD_PENDING');report.reversal_requests_forwarded++;
          const response=await route.fetch({maxRetries:0,timeout:30000});requireSale(response.ok(),'REVERSAL_WRITE_UNCONFIRMED');await reconcile();return route.fulfill({response});
        }
        if(req.method()==='POST'&&url.pathname==='/rest/v1/rpc/fn_write_audit'){
          const p=req.postDataJSON(),state=await view();
          requireSale(['Sale Created','Sale Reversed'].includes(p.p_action)&&typeof p.p_details==='string'&&p.p_details.startsWith(`Order #${state.sales[0].order_no} · `),'AUDIT_OUTSIDE_B_JOURNEY');return route.continue();
        }
        throw new SaleSignal('BROWSER_WRITE_OUTSIDE_B_JOURNEY');
      }catch(e){routeFailure=e instanceof SaleSignal?e:new SaleSignal('SALE_ROUTE_BLOCKED');await route.abort().catch(()=>{});}
      finally{if(ownsMutation)browserWriteInFlight=false;}
    });
    const page=await context.newPage();
    try{
      await page.goto(LOCAL,{waitUntil:'domcontentloaded'});await page.locator('main').waitFor();
      await page.getByText('Sales',{exact:true}).first().click();await page.getByRole('button',{name:'New Sale',exact:true}).click();
      let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:`Add ${snapshot.product.name}`,exact:true}).click();
      await dialog.getByText('Payment Method',{exact:true}).locator('..').locator('select').selectOption('Other');
      await dialog.getByText('Location',{exact:true}).locator('..').locator('select').selectOption(snapshot.location.id);
      await dialog.getByText('Sales Channel',{exact:true}).locator('..').locator('select').selectOption(snapshot.expected.channel);
      await dialog.locator('input[type=number]').last().fill(String(snapshot.expected.discount));await dialog.locator('textarea').fill(snapshot.expected.note);
      for(const [label,cents] of [['Subtotal',Math.round(Number(snapshot.product.price)*100)],['Discount',-Math.round(snapshot.expected.discount*100)],['Tax',Math.round(snapshot.expected.tax*100)],['Total',snapshot.expected.totalCents]]){
        const text=await dialog.getByText(label==='Tax'?/^Tax \(/:label,{exact:true}).locator('..').locator('span').last().innerText();
        requireSale(/^-?\$/.test(text.trim()),'PDV_USD_CURRENCY_DISPLAY_MISMATCH');
        requireSale(Math.round(Number(text.replace(/[^0-9.-]/g,''))*100)===cents,'PDV_DISPLAYED_TOTAL_MISMATCH');
      }
      pass('ui_totals');
      await dialog.getByRole('button',{name:/^Complete Sale/}).click();
      await dialog.getByRole('button',{name:'Retry Saving Same Sale',exact:true}).waitFor();
      requireSale(snapshot.saleId&&!snapshot.writeUncertain&&!routeFailure,'FIRST_SALE_COMMIT_NOT_RECONCILED');
      requireSale(await dialog.getByRole('button',{name:/^Complete Sale/}).count()===0,'NEW_SALE_AFTER_UNKNOWN_NOT_BLOCKED');
      await dialog.getByRole('button',{name:'Retry Saving Same Sale',exact:true}).click();await dialog.getByText('Payment Successful',{exact:true}).waitFor();
      await dialog.getByRole('button',{name:'Done',exact:true}).click();
      await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Sales',{exact:true}).first().click();
      let observed=await view();assertSaleObserved(observed,snapshot,false);await preserveFixture();
      pass('persist_reload');pass('stock_deduction');pass('single_income');
      for(const label of ['B','anon']){
        for(const resource of ['sales','cash_flow','rpc/fn_read_sale_items_secure']){
          const filter=resource==='sales'?'id':'sale_id';const r=await api(`/rest/v1/${resource}?select=id&${filter}=eq.${snapshot.saleId}`,label,{denied:true});
          requireSale(r.ok?Array.isArray(r.data)&&!r.data.length:[401,403].includes(r.status),'CROSS_TENANT_SALE_READ','FAIL');
        }
        // Explicit negative probes target ONLY this run's new sale; no historical IDs.
        snapshot.writeUncertain=true;snapshot.pending='probe_reverse';save('NEGATIVE_WRITE_PROBE_PENDING');
        const result=await api('/rest/v1/rpc/fn_reverse_sale',label,{body:{p_sale_id:snapshot.saleId},denied:true});
        requireSale(!result.ok&&[400,401,403].includes(result.status),'CROSS_TENANT_REVERSAL_ALLOWED','FAIL');
        assertSaleObserved(await view(),snapshot,false);snapshot.writeUncertain=false;snapshot.pending=null;save('NEGATIVE_WRITE_PROBE_DENIED');report.denied_cross_tenant_write_probes++;
      }
      pass('write_isolation');
      await page.getByText(`Order #${observed.sales[0].order_no} · ${snapshot.expected.channel}`,{exact:true}).click();
      await page.getByRole('dialog').getByRole('button',{name:'Cancel Sale',exact:true}).click();
      await page.getByRole('alertdialog').getByRole('button',{name:'Cancel Sale',exact:true}).click();
      await page.getByRole('dialog').waitFor({state:'hidden'});
      await page.reload({waitUntil:'domcontentloaded'});await page.getByText('Sales',{exact:true}).first().click();
      observed=await view();assertSaleObserved(observed,snapshot,true);
      await page.getByText(`Order #${observed.sales[0].order_no} · ${snapshot.expected.channel}`,{exact:true}).click();
      await page.getByRole('dialog').getByText('CANCELLED',{exact:false}).first().waitFor();pass('ui_reversal');
      await page.getByLabel('Language',{exact:true}).first().selectOption('pt-BR');
      await page.getByRole('dialog').getByText('CANCELADO',{exact:false}).first().waitFor();pass('ui_translation');
    }finally{await browser?.close().catch(()=>{});browser=null;await compensate();}
    requireSale(!routeFailure&&!stopped&&checks.every(name=>report.checks[name]==='PASS'),routeFailure?.code||'SALE_REQUIRED_CHECKS_INCOMPLETE');
    report.status='PASS';report.code='REAL_SALE_JOURNEY_REVERSED';
  }catch(e){
    await recordSaleFailure(e,{report,args,snapshot,compensate,checkpoint});
  }finally{
    await browser?.close().catch(()=>{});server?.kill();
    for(const label of Object.keys(sessions)){
      try{await fetch(config.origin+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:config.key,Authorization:`Bearer ${sessions[label].token}`},signal:AbortSignal.timeout(10000)});}catch{/* no secret-bearing output */}
      delete sessions[label];
    }
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
  }
  return safeSaleReport(report);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await saleJourney();console.log(JSON.stringify(report));process.exitCode=report.status==='PASS'?0:report.status==='FAIL'?1:2;
}
