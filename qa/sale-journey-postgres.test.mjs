import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SALE_TABLES, SALE_ACTORS, SALE_FINGERPRINTS } from './sale-journey-core.mjs';

// Exact read-only SQL on disposable PostgreSQL. No Supabase access or remote writes.
const name=`nexalvo-sale-preflight-${process.pid}-${randomBytes(4).toString('hex')}`;
const catalog=readFileSync(new URL('./sql/sale_journey_preflight_readonly_TEST.sql',import.meta.url),'utf8');
const fixtures=readFileSync(new URL('./sql/sale_journey_fixture_inventory_readonly_TEST.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/20261016_platform_admin_TEST.sql',import.meta.url),'utf8');
const historical=readFileSync(new URL('./fixtures/platform-admin-baseline.sql',import.meta.url),'utf8');
const reported={current_business_id:'8326e5f1bc2ecf720cb0aa3be9a0d0d6',user_can:'78e7ac15c93a208fdec8baf37e2b9c02'};
function helperDefinitions(source){
  return Object.keys(reported).map(name=>{
    const definition=source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$\\s*;`));
    assert.ok(definition,`versioned definition required: ${name}`);return definition[0];
  }).join('\n');
}
const businessA='aaaaaaaa-1111-4111-8111-111111111111',businessB='bbbbbbbb-2222-4222-8222-222222222222';
const ownerA='11111111-aaaa-4111-8111-111111111111',ownerB='22222222-bbbb-4222-8222-222222222222';
const employee='33333333-cccc-4333-8333-333333333333',manager='44444444-dddd-4444-8444-444444444444';
function actorContext(id,permission='viewFinancials',prefix=''){
  return JSON.parse(sql(`SET ROLE authenticated; SET request.jwt.claim.sub='${id}'; ${prefix}
    SELECT jsonb_build_object('business',public.current_business_id(),'allowed',public.user_can(${permission===null?'NULL':`'${permission}'`}));`));
}
let started=false;
function docker(args,input){return execFileSync('docker',args,{input,encoding:'utf8',timeout:30000,stdio:['pipe','pipe','pipe']});}
function sql(input){return docker(['exec','-i',name,'psql','-X','-U','postgres','-v','ON_ERROR_STOP=1','-Atq'],input).trim();}
function readonly(query){return JSON.parse(sql('BEGIN READ ONLY;\n'+query+'\nROLLBACK;'));}
before(async()=>{
  docker(['run','--rm','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','-d','postgres:17-alpine']);started=true;
  for(let i=0;i<100;i++){try{docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{if(i===99)throw Error('DISPOSABLE_POSTGRES_NOT_READY');await new Promise(r=>setTimeout(r,100));}}
  const columns={products:'business_id uuid,name text,active boolean,price numeric',businesses:'currency text,tax_enabled boolean,tax_rate numeric',
    locations:'business_id uuid,name text,active boolean',product_recipes:'product_id uuid,inventory_item_id uuid,qty_per_unit numeric',
    inventory_items:'business_id uuid,name text,active boolean',inventory_stock:'inventory_item_id uuid,location_id uuid,qty numeric,avg_cost_per_unit numeric',
    sale_items:'product_id uuid'};
  sql('CREATE ROLE anon; CREATE ROLE authenticated;'+SALE_TABLES.map(t=>`CREATE TABLE public.${t}(id uuid${columns[t]?', '+columns[t]:''}); ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`).join('\n')
    +`CREATE TABLE public.purchase_order_items(inventory_item_id uuid);
      ALTER TABLE public.businesses ADD COLUMN platform_status text DEFAULT 'ACTIVE';
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE public.users(id uuid PRIMARY KEY,business_id uuid,role text,active boolean,permission_overrides jsonb DEFAULT '{}');
      CREATE TABLE public.role_default_permissions(role text,permission_key text,granted boolean);`);
});
after(()=>{if(started)docker(['stop',name]);});
test('catalog SQL executes in a read-only transaction and fails closed for missing RPC definitions and anon grants',()=>{
  const result=readonly(catalog);
  assert.equal(result.status,'BLOCKED_CATALOG_DRIFT');assert.equal(result.functions.length,8);assert.equal(result.tables.length,13);
  assert.ok(result.functions.every(f=>f.present===false));assert.ok(result.tables.every(t=>t.rls===true&&t.anon_select===false));
  sql('GRANT SELECT ON public.products TO anon;');
  assert.equal(readonly(catalog).tables.find(t=>t.name==='products').anon_select,true);
  sql('REVOKE SELECT ON public.products FROM anon;');
});
test('fixture inventory SQL is read-only, identifies bounded QA stock and rejects history and excessive precision',()=>{
  assert.deepEqual(readonly(fixtures).candidates,[]);
  const b=SALE_ACTORS.A.business,p='11111111-1111-4111-8111-111111111111',l='22222222-2222-4222-8222-222222222222',i='33333333-3333-4333-8333-333333333333';
  sql(`INSERT INTO businesses(id,currency,tax_enabled,tax_rate) VALUES('${b}','USD',true,7.25);
    INSERT INTO products VALUES('${p}','${b}','ZZ_QA_SALE_LOCAL',true,0.5);
    INSERT INTO locations VALUES('${l}','${b}','QA LOCAL',true);
    INSERT INTO inventory_items VALUES('${i}','${b}','ZZ_QA_STOCK_LOCAL',true);
    INSERT INTO product_recipes(product_id,inventory_item_id,qty_per_unit) VALUES('${p}','${i}',0.25);
    INSERT INTO inventory_stock(id,inventory_item_id,location_id,qty,avg_cost_per_unit) VALUES('${i}','${i}','${l}',10,0.2);`);
  let r=readonly(fixtures);assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].potentially_eligible,true);
  assert.equal(Number(r.candidates[0].expected_total_usd),0.53);
  sql(`UPDATE product_recipes SET qty_per_unit=0.0001;`);assert.equal(readonly(fixtures).candidates[0].potentially_eligible,false);
  sql(`UPDATE product_recipes SET qty_per_unit=0.25; INSERT INTO sale_items(product_id) VALUES('${p}');`);
  assert.equal(readonly(fixtures).candidates[0].potentially_eligible,false);
  assert.equal(sql('SELECT count(*) FROM sale_items;'),'1','read-only inventory must never clean historical rows');
});
test('reported drift exactly matches compiled platform cutover, not formatting alone; SQL and JS pin only the new baseline',()=>{
  sql(helperDefinitions(historical));
  const fingerprints=()=>JSON.parse(sql(`SELECT jsonb_object_agg(proname,md5(pg_get_functiondef(oid))) FROM pg_proc
    WHERE oid IN ('public.current_business_id()'::regprocedure,'public.user_can(text)'::regprocedure);`));
  assert.deepEqual(fingerprints(),{current_business_id:'cb88feae5114dab5ff53ad35319544d4',user_can:'dda7b605c2b77befc9ec56f7af184103'});
  sql(`REVOKE ALL ON FUNCTION public.current_business_id(),public.user_can(text) FROM PUBLIC,anon;
    GRANT EXECUTE ON FUNCTION public.current_business_id(),public.user_can(text) TO authenticated;`);
  sql(helperDefinitions(migration)); // Only the exact versioned helpers, inside this isolated container.
  assert.deepEqual(fingerprints(),reported,'canonical pg_get_functiondef must reproduce the two independently reported hashes');
  for(const [name,fingerprint] of Object.entries(reported))assert.equal(SALE_FINGERPRINTS[name],fingerprint);
  const result=readonly(catalog);
  assert.equal(result.status,'BLOCKED_CATALOG_DRIFT','missing remaining RPCs must still block the overall preflight');
  for(const name of Object.keys(reported)){
    const row=result.functions.find(f=>f.name===name);
    assert.equal(row.fingerprint,reported[name]);assert.equal(row.expected_fingerprint,reported[name]);
    assert.equal(row.security_definer,true);assert.deepEqual(row.settings,['search_path=""']);
    assert.equal(row.anon_execute,false);assert.equal(row.authenticated_execute,true);
  }
});
test('post-cutover helpers deny missing/inactive profiles and suspended/missing businesses while keeping A/B isolated',()=>{
  sql(`INSERT INTO businesses(id,currency,platform_status) VALUES('${businessA}','USD','ACTIVE'),('${businessB}','USD','ACTIVE');
    INSERT INTO users(id,business_id,role,active) VALUES
      ('${ownerA}','${businessA}','OWNER',true),('${ownerB}','${businessB}','OWNER',true),
      ('${employee}','${businessA}','EMPLOYEE',true),('${manager}','${businessA}','MANAGER',true);`);
  assert.deepEqual(actorContext(ownerA),{business:businessA,allowed:true});
  assert.deepEqual(actorContext(ownerB),{business:businessB,allowed:true});
  assert.deepEqual(actorContext(''),{business:null,allowed:false});
  assert.deepEqual(actorContext('99999999-9999-4999-8999-999999999999'),{business:null,allowed:false});
  for(const active of ['false','NULL']){
    sql(`UPDATE users SET active=${active} WHERE id='${ownerA}';`);
    assert.deepEqual(actorContext(ownerA),{business:null,allowed:false});
  }
  sql(`UPDATE users SET active=true WHERE id='${ownerA}';`);
  for(const status of ["'SUSPENDED'",'NULL']){
    sql(`UPDATE businesses SET platform_status=${status} WHERE id='${businessA}';`);
    for(const id of [ownerA,employee,manager])assert.deepEqual(actorContext(id),{business:null,allowed:false});
    assert.deepEqual(actorContext(ownerB),{business:businessB,allowed:true});
  }
  sql(`UPDATE businesses SET platform_status='ACTIVE' WHERE id='${businessA}';
    UPDATE users SET business_id='99999999-9999-4999-8999-999999999999' WHERE id='${ownerA}';`);
  assert.deepEqual(actorContext(ownerA),{business:null,allowed:false});
  sql(`UPDATE users SET business_id='${businessA}' WHERE id='${ownerA}';`);
});
test('tenant defaults and boolean overrides stay fail-closed; global claims and caller search_path cannot grant tenant access',()=>{
  sql(`INSERT INTO role_default_permissions(role,permission_key,granted) VALUES
    ('MANAGER','viewFinancials',true),('EMPLOYEE','viewFinancials',false),('EMPLOYEE','manageSales',true);`);
  assert.deepEqual(actorContext(manager),{business:businessA,allowed:true});
  assert.deepEqual(actorContext(employee),{business:businessA,allowed:false});
  for(const [override,expected] of [['true',true],['false',false],['"true"',false],['null',false],['1',false],['[]',false]]){
    sql(`UPDATE users SET permission_overrides=jsonb_build_object('viewFinancials','${override}'::jsonb) WHERE id='${employee}';`);
    assert.deepEqual(actorContext(employee),{business:businessA,allowed:expected});
  }
  sql(`UPDATE users SET permission_overrides='{"manageSales":false}' WHERE id='${employee}';`);
  assert.equal(actorContext(employee,'manageSales').allowed,false,'explicit denial overrides a granted default');
  sql(`UPDATE users SET permission_overrides=NULL WHERE id='${employee}';`);
  assert.equal(actorContext(employee,'manageSales').allowed,true);
  assert.equal(actorContext(employee,'missingPermission').allowed,false);assert.equal(actorContext(employee,null).allowed,false);
  sql(`CREATE SCHEMA untrusted;
    CREATE TABLE untrusted.users AS SELECT '${employee}'::uuid AS id,'${businessB}'::uuid AS business_id,'OWNER'::text AS role,true AS active,'{}'::jsonb AS permission_overrides;
    GRANT USAGE ON SCHEMA untrusted TO authenticated; GRANT SELECT ON untrusted.users TO authenticated;`);
  const spoof=`SET request.jwt.claims='{"app_metadata":{"nexalvo_platform_role":"SUPERADMIN"}}'; SET search_path TO untrusted,public;`;
  assert.deepEqual(actorContext(employee,'viewFinancials',spoof),{business:businessA,allowed:false});
  assert.deepEqual(actorContext(manager,'missingPermission',spoof),{business:businessA,allowed:false});
  assert.equal(readonly(catalog).functions.find(f=>f.name==='user_can').fingerprint,reported.user_can);
});
