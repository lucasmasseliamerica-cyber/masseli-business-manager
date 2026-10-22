-- PREPARED ONLY. Supabase TEST msinksoilkluooxenecy; do not apply without separate approval.
-- Confirm connection externally. The explicit marker is authorization intent, not project proof.
-- APPLY: preserve owner, ACL, schema, all historical rows and transaction atomicity.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE
  v_oid oid:=pg_catalog.to_regprocedure('public.fn_record_inventory_movement(uuid,uuid,uuid,text,numeric,numeric,uuid,uuid,uuid,text,boolean)');
  v_acl aclitem[]; v_owner oid;
BEGIN
  IF pg_catalog.current_setting('nexalvo.stock_precision_authorized',true) IS DISTINCT FROM 'msinksoilkluooxenecy:APPLY_EXPLICIT' THEN
    RAISE EXCEPTION 'explicit TEST stock precision authorization required';
  END IF;
  IF v_oid IS NULL OR pg_catalog.md5(pg_catalog.pg_get_functiondef(v_oid)) IS DISTINCT FROM 'b5ac605f98d630ec318651bfb70eda63' THEN
    RAISE EXCEPTION 'stock precision baseline drift; stop and review';
  END IF;
  IF pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE') OR pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'internal movement ACL drift; stop and review';
  END IF;
  IF EXISTS(SELECT 1 FROM public.inventory_stock WHERE qty::text IN ('NaN','Infinity','-Infinity') OR qty IS NULL OR qty <> pg_catalog.round(qty,3)) THEN
    RAISE EXCEPTION 'noncanonical stock balance; review data without automatic repair';
  END IF;
  SELECT proacl,proowner INTO v_acl,v_owner FROM pg_catalog.pg_proc WHERE oid=v_oid;
  -- JSON quoting preserves the exact captured body, including historical CRLF/LF in rollback.
  EXECUTE ($definition$"CREATE OR REPLACE FUNCTION public.fn_record_inventory_movement(p_business_id uuid, p_inventory_item_id uuid, p_location_id uuid, p_type text, p_qty_change numeric, p_unit_cost numeric, p_sale_id uuid, p_purchase_order_id uuid, p_related_transaction_id uuid, p_note text, p_allow_negative boolean)\n RETURNS inventory_transactions\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\ndeclare\n  v_stock inventory_stock;\n  v_new_qty numeric;\n  v_new_avg numeric;\n  v_prev_avg numeric;\n  v_tx inventory_transactions;\nBEGIN\n\n IF p_qty_change IS NOT NULL AND p_qty_change::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'p_qty_change must be finite'; END IF;\n IF p_unit_cost IS NOT NULL AND p_unit_cost::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'p_unit_cost must be finite'; END IF;\n  if p_business_id is distinct from current_business_id() then\n    raise exception 'business_id mismatch';\n  end if;\n\n  if not exists (\n    select 1 from inventory_items\n    where id = p_inventory_item_id and business_id = p_business_id\n  ) then\n    raise exception 'inventory item not found';\n  end if;\n\n  if not exists (\n    select 1 from locations\n    where id = p_location_id and business_id = p_business_id\n  ) then\n    raise exception 'location not found';\n  end if;\n\n  -- Reject fractions the stock balance cannot represent; ledger and balance must agree.\n  IF p_qty_change IS NULL OR p_qty_change <> pg_catalog.round(p_qty_change, 3) THEN\n    RAISE EXCEPTION 'inventory quantity must use at most 3 decimal places';\n  END IF;\n\n  select * into v_stock\n  from inventory_stock\n  where inventory_item_id = p_inventory_item_id\n    and location_id = p_location_id\n  for update;\n\n  if v_stock.id is null then\n    insert into inventory_stock (\n      inventory_item_id, location_id, qty, avg_cost_per_unit\n    )\n    values (\n      p_inventory_item_id, p_location_id, 0, 0\n    )\n    returning * into v_stock;\n  end if;\n\n  v_prev_avg := v_stock.avg_cost_per_unit;\n  v_new_qty := round(v_stock.qty + p_qty_change, 3);\n\n  if v_new_qty < 0 and not p_allow_negative then\n    raise exception\n      'insufficient stock: item % at location % would go to % (negative not allowed)',\n      p_inventory_item_id, p_location_id, v_new_qty;\n  end if;\n\n  if p_type in ('PURCHASE','INITIAL_STOCK','TRANSFER_IN')\n     and p_qty_change > 0\n     and p_unit_cost is not null then\n\n    if v_new_qty > 0 then\n      v_new_avg := round(\n        (\n          (v_stock.qty * v_stock.avg_cost_per_unit)\n          + (p_qty_change * p_unit_cost)\n        ) / v_new_qty,\n        4\n      );\n    else\n      v_new_avg := p_unit_cost;\n    end if;\n  else\n    v_new_avg := v_stock.avg_cost_per_unit;\n  end if;\n\n  update inventory_stock\n  set\n    qty = v_new_qty,\n    avg_cost_per_unit = v_new_avg,\n    last_purchase_cost = case\n      when p_type in ('PURCHASE','INITIAL_STOCK') then p_unit_cost\n      else last_purchase_cost\n    end,\n    last_purchase_date = case\n      when p_type in ('PURCHASE','INITIAL_STOCK') then now()\n      else last_purchase_date\n    end,\n    updated_at = now()\n  where inventory_item_id = p_inventory_item_id\n    and location_id = p_location_id;\n\n  insert into inventory_transactions (\n    business_id,\n    inventory_item_id,\n    location_id,\n    type,\n    qty_change,\n    unit,\n    unit_cost,\n    total_cost,\n    sale_id,\n    purchase_order_id,\n    related_transaction_id,\n    prev_avg_cost,\n    new_avg_cost,\n    note,\n    created_by\n  )\n  select\n    p_business_id,\n    p_inventory_item_id,\n    p_location_id,\n    p_type,\n    p_qty_change,\n    i.unit,\n    coalesce(p_unit_cost, v_prev_avg),\n    round(p_qty_change * coalesce(p_unit_cost, v_prev_avg), 2),\n    p_sale_id,\n    p_purchase_order_id,\n    p_related_transaction_id,\n    v_prev_avg,\n    v_new_avg,\n    p_note,\n    auth.uid()\n  from inventory_items i\n  where i.id = p_inventory_item_id\n  returning * into v_tx;\n\n  return v_tx;\nend;\n$function$\n"$definition$::jsonb #>> '{}');
  IF pg_catalog.md5(pg_catalog.pg_get_functiondef(v_oid)) IS DISTINCT FROM '27bb16e1ab20acc78ef5bb2f25eb9c04'
    OR (SELECT proacl FROM pg_catalog.pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_acl
    OR (SELECT proowner FROM pg_catalog.pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'stock precision postcondition mismatch';
  END IF;
END;
$guard$;
COMMIT;
