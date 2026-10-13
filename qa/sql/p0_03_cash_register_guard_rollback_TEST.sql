-- NEXALVO QA P0.03 — SQL-level guarded cash sale regression.
-- TEST ONLY. Requires DB role permitted to SET LOCAL ROLE authenticated.
-- NO persistent test mutations: all SQL operations run inside BEGIN ... ROLLBACK.
-- Do not mistake this for live HTTP JWT or browser Playwright verification.
-- Invariant: TEST-only business names + IDs are checked before any business operation.

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','88eddcda-d8b5-4474-b5d7-19860dd97fba',true);
SELECT set_config('request.jwt.claims','{"sub":"88eddcda-d8b5-4474-b5d7-19860dd97fba","role":"authenticated"}',true);
DO $qa$
DECLARE
 b uuid:='3849b750-20f7-4929-8699-737a4e1983c8';
 l uuid:='f0715b85-af37-4bba-be7e-448732176446';
 lines jsonb:='[{"product_id":"a4cac86d-038d-418e-b953-9a3605f2df18","qty":1,"unit_price":23.50}]';
 r public.cash_registers%rowtype;
 sale public.sales%rowtype;
 v_id uuid;
 v_msg text;
 v_blocked boolean;
 v_count int;
 method text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id=b AND name='ZZ_QA_PLATFORM_20261009_AUTO')
 THEN RAISE EXCEPTION 'TEST-only safety guard failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.cash_registers WHERE business_id=b AND location_id=l AND status='open')
 THEN RAISE EXCEPTION 'Unsafe fixture: register already open'; END IF;

 FOREACH method IN ARRAY ARRAY['Cash','cash',' CASH '] LOOP
   v_id:=gen_random_uuid(); v_blocked:=false;
   BEGIN
     PERFORM public.fn_create_sale(v_id,b,l,'In Store',method,NULL,NULL,0,0,'QA SQL rollback','Completed',lines);
   EXCEPTION WHEN OTHERS THEN
     GET STACKED DIAGNOSTICS v_msg=MESSAGE_TEXT;
     IF v_msg NOT ILIKE '%cash register is closed for this location%' THEN RAISE EXCEPTION 'Unexpected validation error: %',v_msg; END IF;
     v_blocked:=true;
   END;
   IF NOT v_blocked THEN RAISE EXCEPTION 'Cash method % bypassed guard',method; END IF;
   IF EXISTS(SELECT 1 FROM public.sales WHERE id=v_id) OR EXISTS(SELECT 1 FROM public.cash_flow WHERE sale_id=v_id)
   THEN RAISE EXCEPTION 'Rejected cash sale left records'; END IF;
 END LOOP;

 r:=public.fn_open_cash_register(b,l,0,'QA SQL rollback');
 IF r.status<>'open' THEN RAISE EXCEPTION 'Open register failed'; END IF;
 v_id:=gen_random_uuid();
 sale:=public.fn_create_sale(v_id,b,l,'In Store','Cash',NULL,NULL,0,0,'QA SQL rollback','Completed',lines);
 IF sale.id IS DISTINCT FROM v_id THEN RAISE EXCEPTION 'Sale ID differs'; END IF;
 SELECT count(*) INTO v_count FROM public.cash_flow WHERE sale_id=v_id AND related_cash_register_id=r.id AND amount=23.50;
 IF v_count<>1 THEN RAISE EXCEPTION 'Cash ledger not correctly registered'; END IF;
 sale:=public.fn_create_sale(v_id,b,l,'In Store','Cash',NULL,NULL,0,0,'QA replay','Completed',lines);
 SELECT count(*) INTO v_count FROM public.cash_flow WHERE sale_id=v_id;
 IF v_count<>1 THEN RAISE EXCEPTION 'Sale replay duplicated ledger'; END IF;
 r:=public.fn_close_cash_register(r.id,23.50,NULL,'QA SQL rollback');
 IF r.status<>'closed' OR r.expected_cash<>23.50 THEN RAISE EXCEPTION 'Cash close mismatch'; END IF;
 sale:=public.fn_create_sale(v_id,b,l,'In Store','Cash',NULL,NULL,0,0,'QA replay after close','Completed',lines);
 SELECT count(*) INTO v_count FROM public.cash_flow WHERE sale_id=v_id;
 IF v_count<>1 THEN RAISE EXCEPTION 'Replay after closing duplicated ledger'; END IF;

 FOREACH method IN ARRAY ARRAY['Credit Card','Debit Card','Zelle','Other'] LOOP
   v_id:=gen_random_uuid();
   sale:=public.fn_create_sale(v_id,b,l,'In Store',method,NULL,NULL,0,0,'QA SQL rollback','Completed',lines);
   IF sale.id IS DISTINCT FROM v_id THEN RAISE EXCEPTION 'Noncash method % was rejected',method; END IF;
   SELECT count(*) INTO v_count FROM public.cash_flow WHERE sale_id=v_id AND related_cash_register_id IS NULL AND payment_method=method;
   IF v_count<>1 THEN RAISE EXCEPTION 'Noncash method % ledger mismatch',method; END IF;
 END LOOP;
END $qa$;
ROLLBACK;

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f37e9907-47c4-48bf-94b7-9a6fa5de1f88',true);
SELECT set_config('request.jwt.claims','{"sub":"f37e9907-47c4-48bf-94b7-9a6fa5de1f88","role":"authenticated"}',true);
DO $qa$
DECLARE
 b uuid:='d627563b-2ce4-491d-8cf6-141ef28d0f63';
 l uuid:='a3e4b2ed-eb00-4963-afd0-38c256aff87d';
 item uuid:='bb80c25b-5fd0-4716-8460-82202a2d74a9';
 lines jsonb:='[{"product_id":"4b81317e-0d1c-4a81-b2cf-2746bb9f7561","qty":1,"unit_price":10.00}]';
 v_id uuid:=gen_random_uuid();
 before_qty numeric;
 after_qty numeric;
 v_msg text;
 blocked boolean:=false;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id=b AND name='NEXALVO QA - EMPRESA FICTICIA')
 THEN RAISE EXCEPTION 'TEST-only safety guard failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.cash_registers WHERE business_id=b AND location_id=l AND status='open')
 THEN RAISE EXCEPTION 'Unsafe fixture: register is open'; END IF;
 SELECT qty INTO before_qty FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=l;
 IF before_qty IS NULL OR before_qty < 1 THEN RAISE EXCEPTION 'Missing QA inventory fixture'; END IF;
 BEGIN
  PERFORM public.fn_create_sale(v_id,b,l,'In Store','Cash',NULL,NULL,0,0,'QA SQL rejected','Completed',lines);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg=MESSAGE_TEXT;
  IF v_msg NOT ILIKE '%cash register is closed for this location%' THEN RAISE EXCEPTION 'Unexpected server validation: %',v_msg; END IF;
  blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Cash guard failed for stock-backed product'; END IF;
 SELECT qty INTO after_qty FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=l;
 IF after_qty IS DISTINCT FROM before_qty THEN RAISE EXCEPTION 'Cash rejection changed inventory'; END IF;
 IF EXISTS(SELECT 1 FROM public.sales WHERE id=v_id) OR EXISTS(SELECT 1 FROM public.cash_flow WHERE sale_id=v_id)
  OR EXISTS(SELECT 1 FROM public.inventory_transactions WHERE sale_id=v_id)
 THEN RAISE EXCEPTION 'Rejected sale left persisted records'; END IF;
END $qa$;
ROLLBACK;

SELECT 'PASS: P0.03 TEST cash guard SQL checks (rollback, no persistent test mutations)' AS qa_result;
