import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SALE_TABLES, SALE_ACTORS } from './sale-journey-core.mjs';

// Exact read-only SQL on disposable PostgreSQL. No Supabase access or remote writes.
const name=`nexalvo-sale-preflight-${process.pid}-${randomBytes(4).toString('hex')}`;
const catalog=readFileSync(new URL('./sql/sale_journey_preflight_readonly_TEST.sql',import.meta.url),'utf8');
const fixtures=readFileSync(new URL('./sql/sale_journey_fixture_inventory_readonly_TEST.sql',import.meta.url),'utf8');
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
    +'CREATE TABLE public.purchase_order_items(inventory_item_id uuid);');
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
