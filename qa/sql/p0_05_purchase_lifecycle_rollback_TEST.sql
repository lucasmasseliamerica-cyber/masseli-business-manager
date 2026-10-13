-- NEXALVO P0.05 automated SQL regression. TEST ONLY; nothing must commit.
-- Requires authorized TEST owner A context; fixtures verified by business name.
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','f37e9907-47c4-48bf-94b7-9a6fa5de1f88',true);
SELECT set_config('request.jwt.claims','{"sub":"f37e9907-47c4-48bf-94b7-9a6fa5de1f88","role":"authenticated"}',true);
DO $qa$
DECLARE
 b uuid:='d627563b-2ce4-491d-8cf6-141ef28d0f63';
 loc uuid:='a3e4b2ed-eb00-4963-afd0-38c256aff87d';
 item uuid:='bb80c25b-5fd0-4716-8460-82202a2d74a9';
 supplier uuid:='f85b4931-6877-4664-969d-0ba59fe4feff';
 po public.purchase_orders%rowtype;
 pi public.purchase_order_items%rowtype;
 pay1 public.purchase_order_payments%rowtype;
 pay2 public.purchase_order_payments%rowtype;
 original numeric; currentqty numeric; n int; err text; blocked boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=b AND name='NEXALVO QA - EMPRESA FICTICIA')
 THEN RAISE EXCEPTION 'Non-QA business; abort'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=supplier AND business_id=b)
 THEN RAISE EXCEPTION 'Missing QA supplier'; END IF;
 SELECT qty INTO original FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=loc;
 IF original IS NULL OR original<4 THEN RAISE EXCEPTION 'Bad QA stock fixture'; END IF;

 po:=public.fn_create_purchase_order(b,supplier,loc,current_date,NULL,'Ordered','Card','QA P005 ROLLBACK',1,0.50,
   jsonb_build_array(jsonb_build_object('inventory_item_id',item,'qty',4,'unit_cost',3)));
 IF po.id IS NULL OR po.status<>'Ordered' THEN RAISE EXCEPTION 'Creation failed'; END IF;
 -- Use authorized secure function: authenticated users are not granted raw SELECT on purchase_order_items.
 SELECT * INTO pi FROM public.fn_read_purchase_order_items_secure() WHERE purchase_order_id=po.id LIMIT 1;
 IF pi.id IS NULL OR pi.qty_ordered<>4 OR pi.received_qty<>0 THEN RAISE EXCEPTION 'PO line incorrect'; END IF;

 po:=public.fn_receive_purchase_order(po.id,jsonb_build_array(jsonb_build_object('po_item_id',pi.id,'qty',1.5)));
 IF po.status<>'Partially Received' THEN RAISE EXCEPTION 'Partial receipt status %',po.status; END IF;
 SELECT qty INTO currentqty FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=loc;
 IF currentqty<>original+1.5 THEN RAISE EXCEPTION 'Partial receipt stock mismatch'; END IF;
 pay1:=public.fn_pay_purchase_order(po.id,5,'Card');
 IF pay1.id IS NULL OR pay1.amount<>5 THEN RAISE EXCEPTION 'Partial payment failed'; END IF;
 SELECT count(*) INTO n FROM public.cash_flow cf WHERE cf.purchase_order_payment_id=pay1.id
 AND cf.type='expense' AND cf.amount=5;
 IF n<>1 THEN RAISE EXCEPTION 'Payment ledger missing'; END IF;

 blocked:=false;
 BEGIN
   PERFORM public.fn_receive_purchase_order(po.id,jsonb_build_array(jsonb_build_object('po_item_id',pi.id,'qty',3)));
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
   IF err NOT ILIKE '%cannot receive more than the remaining%' THEN
     RAISE EXCEPTION 'Unexpected overreceive error: %',err; END IF;
   blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Overreceive accepted'; END IF;
 SELECT qty INTO currentqty FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=loc;
 IF currentqty<>original+1.5 THEN RAISE EXCEPTION 'Rejected overreceive changed stock'; END IF;

 po:=public.fn_receive_purchase_order(po.id,jsonb_build_array(jsonb_build_object('po_item_id',pi.id,'qty',2.5)));
 IF po.status<>'Received' THEN RAISE EXCEPTION 'Full receive status %',po.status; END IF;
 SELECT qty INTO currentqty FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=loc;
 IF currentqty<>original+4 THEN RAISE EXCEPTION 'Full receipt stock mismatch'; END IF;
 pay2:=public.fn_pay_purchase_order(po.id,6.50,'Card');
 IF pay2.id IS NULL OR pay2.amount<>6.50 THEN RAISE EXCEPTION 'Final supplier payment incorrect'; END IF;

 blocked:=false;
 BEGIN
   PERFORM public.fn_pay_purchase_order(po.id,1,'Card');
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
   IF err NOT ILIKE '%no amount due%' THEN RAISE EXCEPTION 'Unexpected overpay error: %',err; END IF;
   blocked:=true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'Overpay accepted'; END IF;

 pay2:=public.fn_reverse_po_payment(pay2.id);
 IF pay2.status<>'reversed' THEN RAISE EXCEPTION 'Payment reversal status incorrect'; END IF;
 SELECT count(*) INTO n FROM public.cash_flow cf WHERE cf.purchase_order_payment_id=pay2.id;
 IF n<>2 THEN RAISE EXCEPTION 'Reversal ledger offset missing'; END IF;
 po:=public.fn_reverse_purchase_order(po.id);
 IF po.status<>'Reversed' THEN RAISE EXCEPTION 'PO reversal status incorrect'; END IF;
 SELECT qty INTO currentqty FROM public.inventory_stock WHERE inventory_item_id=item AND location_id=loc;
 IF currentqty<>original THEN RAISE EXCEPTION 'PO reversal did not restore stock'; END IF;

 po:=public.fn_create_purchase_order(b,supplier,loc,current_date,NULL,'Draft','Card','QA P005 CANCEL ROLLBACK',0,0,
   jsonb_build_array(jsonb_build_object('inventory_item_id',item,'qty',2,'unit_cost',3)));
 po:=public.fn_cancel_purchase_order(po.id);
 IF po.status<>'Cancelled' THEN RAISE EXCEPTION 'Draft cancellation failed'; END IF;
END $qa$;
ROLLBACK;
SELECT 'PASS P0.05: valid PO, partial/full receipts, payments, overreceive/overpay reject, reversals, cancellation; rollback' AS qa_result;
