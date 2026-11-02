// Local PostgreSQL 17 WASM only; no connection string or TEST client is imported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const {PGlite}=await import(process.env.NEXALVO_C2_PGLITE_MODULE || '@electric-sql/pglite');
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const source=read('stock-c2-provision-review.sql'),schema=read('stock-c2-provision-test-schema.sql'),recovery=read('stock-c2-provision-reconcile-readonly.sql');
// PGlite 0.3.15 uses template1. Adapt ONLY this database-name predicate in memory;
// all production catalog hashes, IDs, INSERTs, locks, assertions and COMMIT remain exact.
assert.equal(source.split("current_database() <> 'postgres'").length,2);
const local=source.replace("current_database() <> 'postgres'","current_database() <> 'template1'");
const settings="SET nexalvo.c2.project_ref='msinksoilkluooxenecy'; SET nexalvo.c2.provision_approval='TEST_ONLY_THREE_ROW_SEED_WITHOUT_INITIAL_MOVEMENT_20261102';";
async function db(){const d=new PGlite();await d.exec(schema);return d;}
const counts=async d=>(await d.query('select (select count(*) from public.locations) l,(select count(*) from public.inventory_items) i,(select count(*) from public.inventory_stock) s')).rows[0];
const observe=async d=>(await d.exec(recovery)).flatMap(r=>r.rows||[])[0].c2_provision_reconciliation;
test('review SQL has exactly one transaction and three target INSERTs, no replay/upsert/cleanup path',()=>{
  const s=source.replace(/--[^\n]*/g,'');assert.equal((s.match(/\bINSERT\s+INTO\s+public\./gi)||[]).length,3);
  assert.equal((s.match(/^BEGIN;/gm)||[]).length,1);assert.equal((s.match(/^COMMIT;/gm)||[]).length,1);
  assert.ok(!/\b(?:UPDATE\s+public|DELETE\s+FROM|ON\s+CONFLICT|CREATE\s+(?:TABLE|FUNCTION)|ALTER\s+TABLE|TRUNCATE)\b/i.test(s));
});
test('unmodified SQL rejects local database identity and missing approval with no writes',async()=>{
  const d=await db();try{await assert.rejects(()=>d.exec(source),/C2_SEED_CONTEXT_OR_SPECIFIC_APPROVAL_REQUIRED/);await d.exec('ROLLBACK');assert.deepEqual(await counts(d),{l:0,i:0,s:0});}finally{await d.close();}
});
test('exact transaction body commits only three rows; no movement/audit, proper immutable initial costs',async()=>{
  const d=await db();try{await d.exec(settings);await d.exec(local);assert.deepEqual(await counts(d),{l:1,i:1,s:1});const o=await observe(d);
    assert.equal(o.status,'SEED_OBSERVED_NO_EXECUTION_AUTHORIZATION');assert.equal(o.observation.position.qty,2);assert.equal(o.observation.movements,0);assert.equal(o.observation.audits,0);assert.equal(o.c2_loss_authorized,false);
    await assert.rejects(()=>d.exec(local),/C2_SEED_COLLISION_NO_RETRY/);await d.exec('ROLLBACK');assert.deepEqual(await counts(d),{l:1,i:1,s:1});
  }finally{await d.close();}
});
for(const fault of ['company','owner','collision','trigger_drift','indirect_dml_trigger','column_drift','final_assertion'])test(`SQL rejects ${fault}; no partial fixture survives`,async()=>{
  const d=await db();try{await d.exec(settings);let sql=local;
    if(fault==='company')await d.exec("UPDATE public.businesses SET platform_status='SUSPENDED'");
    if(fault==='owner')await d.exec('UPDATE public.users SET active=false');
    if(fault==='collision')await d.exec("INSERT INTO public.locations(id,business_id,name) VALUES('11111111-1111-4111-8111-111111111111','d627563b-2ce4-491d-8cf6-141ef28d0f63',' ZZ_QA_STOCK_C2_20261102_LOCATION ')");
    if(fault==='trigger_drift')await d.exec('CREATE TRIGGER unexpected_write AFTER INSERT ON public.inventory_stock FOR EACH ROW EXECUTE FUNCTION public.trg_validate_inventory_item_tenant_references()');
    if(fault==='indirect_dml_trigger')await d.exec("CREATE FUNCTION public.synthetic_indirect_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN INSERT INTO public.audit_logs(id,details) VALUES('11111111-1111-4111-8111-111111111111','SYNTHETIC_INDIRECT'); RETURN NEW; END$$; CREATE TRIGGER indirect_write AFTER INSERT ON public.inventory_stock FOR EACH ROW EXECUTE FUNCTION public.synthetic_indirect_write()");
    if(fault==='column_drift')await d.exec('ALTER TABLE public.inventory_stock ADD COLUMN unexpected text');
    if(fault==='final_assertion')sql=local.replace('2.000,0.1000,0.1000,NULL','1.999,0.1000,0.1000,NULL');
    const before=await counts(d);await assert.rejects(()=>d.exec(sql),/C2_SEED_/);await d.exec('ROLLBACK');assert.deepEqual(await counts(d),before);
    if(fault==='indirect_dml_trigger')assert.equal((await d.query('SELECT count(*)::integer n FROM public.audit_logs')).rows[0].n,0);
  }finally{await d.close();}
});
test('readonly absent and divergent reconciliation never enables retry or cleanup',async()=>{
  const d=await db();try{let o=await observe(d);assert.equal(o.status,'ABSENT_UNCONFIRMED_NO_RETRY');assert.equal(o.retry_allowed,false);
    await d.exec(settings);await d.exec(local);await d.exec('UPDATE public.inventory_stock SET qty=1.875');o=await observe(d);assert.equal(o.status,'DIVERGENT_STOP_MANUAL_REVIEW');assert.equal(o.cleanup_allowed,false);
  }finally{await d.close();}
});
