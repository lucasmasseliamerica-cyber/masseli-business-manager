-- NEXALVO P0.04 TEST-only SQL regression: adjust, waste, transfer, reject overdraw.
-- Transaction always ends in ROLLBACK. Tests are not a UI/HTTP certification.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f37e9907-47c4-48bf-94b7-9a6fa5de1f88',true);
SELECT set_config('request.jwt.claims','{"sub":"f37e9907-47c4-48bf-94b7-9a6fa5de1f88","role":"authenticated"}',true);
DO $qa$
DECLARE
 b uuid:='d627563b-2ce4-491d-8cf6-141ef28d0f63';
 src uuid:='a3e4b2ed-eb00-4963-afd0-38c256aff87d';
 dst uuid:='20000000-0000-4000-8000-000000000002';
 item uuid:='bb80c25b-5fd0-4716-8460-82202a2d74a9';
 base_src numeric; base_dst numeric; now_src numeric; now_dst numeric;
 tx public.inventory_transactions%rowtype;
 waste public.waste_transactions%rowtype;
 n int; err text; blocked boolean:=false;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=b AND name='NEXALVO QA - EMPRESA FICTICIA')
 THEN RAISE EXCEPTION 'TEST fixture identity mismatch'; END IF;
 SELECT qty INTO base_src FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=src;
 SELECT qty INTO base_dst FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=dst;
 IF base_src IS NULL OR base_src<10 OR base_dst IS NULL THEN RAISE EXCEPTION 'TEST fixture stock unavailable'; END IF;

 tx:=public.fn_adjust_inventory_count(b,item,src,base_src+3,'QA TEST ADJUST','ROLLBACK');
 IF tx.type<>'ADJUSTMENT' OR tx.qty_change<>3 THEN RAISE EXCEPTION 'Adjustment ledger wrong'; END IF;
 SELECT qty INTO now_src FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=src;
 IF now_src<>base_src+3 THEN RAISE EXCEPTION 'Adjusted stock mismatch'; END IF;

 waste:=public.fn_record_waste(b,item,src,2,'QA TEST WASTE','ROLLBACK');
 IF waste.id IS NULL OR waste.qty<>2 OR waste.inventory_transaction_id IS NULL
 THEN RAISE EXCEPTION 'Waste receipt wrong'; END IF;
 SELECT count(*) INTO n FROM public.inventory_transactions
 WHERE id=waste.inventory_transaction_id AND type='WASTE' AND qty_change=-2;
 IF n<>1 THEN RAISE EXCEPTION 'Waste inventory movement absent'; END IF;
 SELECT qty INTO now_src FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=src;
 IF now_src<>base_src+1 THEN RAISE EXCEPTION 'Waste stock mismatch'; END IF;

 tx:=public.fn_transfer_inventory(b,item,src,dst,3,'QA TEST TRANSFER ROLLBACK');
 IF tx.type<>'TRANSFER_OUT' OR tx.qty_change<>-3 THEN RAISE EXCEPTION 'Transfer source ledger wrong'; END IF;
 SELECT qty INTO now_src FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=src;
 SELECT qty INTO now_dst FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=dst;
 IF now_src<>base_src-2 OR now_dst<>base_dst+3 THEN RAISE EXCEPTION 'Transfer stock mismatch'; END IF;

 BEGIN
   PERFORM public.fn_record_waste(b,item,src,now_src+100,'QA TEST OVERDRAW','ROLLBACK');
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
   IF err NOT ILIKE '%cannot waste more than that%' THEN RAISE EXCEPTION 'Unexpected overdraw error: %',err; END IF;
   blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Overdraw was accepted'; END IF;
 SELECT qty INTO now_src FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=src;
 SELECT qty INTO now_dst FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=dst;
 IF now_src<>base_src-2 OR now_dst<>base_dst+3 THEN RAISE EXCEPTION 'Rejected waste changed balances'; END IF;
END $qa$;
ROLLBACK;
SELECT 'PASS P0.04: adjust, waste, transfer, invalid overdraw and stock accounting; rollback' AS qa_result;
