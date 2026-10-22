-- PREPARED ONLY. Supabase TEST msinksoilkluooxenecy; do not apply without separate approval.
-- Confirm connection externally. The explicit marker is authorization intent, not project proof.
-- ROLLBACK: preserve owner, ACL, schema, all historical rows and transaction atomicity.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE
  v_oid oid:=pg_catalog.to_regprocedure('public.fn_record_inventory_movement(uuid,uuid,uuid,text,numeric,numeric,uuid,uuid,uuid,text,boolean)');
  v_acl aclitem[]; v_owner oid;
BEGIN
  IF pg_catalog.current_setting('nexalvo.stock_precision_authorized',true) IS DISTINCT FROM 'msinksoilkluooxenecy:ROLLBACK_EXPLICIT' THEN
    RAISE EXCEPTION 'explicit TEST stock precision authorization required';
  END IF;
  IF v_oid IS NULL OR pg_catalog.md5(pg_catalog.pg_get_functiondef(v_oid)) IS DISTINCT FROM '27bb16e1ab20acc78ef5bb2f25eb9c04' THEN
    RAISE EXCEPTION 'stock precision baseline drift; stop and review';
  END IF;
  IF pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE') OR pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE') THEN
    RAISE EXCEPTION 'internal movement ACL drift; stop and review';
  END IF;
  SELECT proacl,proowner INTO v_acl,v_owner FROM pg_catalog.pg_proc WHERE oid=v_oid;
  -- JSON quoting preserves the exact captured body, including historical CRLF/LF in rollback.
  EXECUTE ($definition$"CREATE OR REPLACE FUNCTION public.fn_record_inventory_movement(p_business_id uuid, p_inventory_item_id uuid, p_location_id uuid, p_type text, p_qty_change numeric, p_unit_cost numeric, p_sale_id uuid, p_purchase_order_id uuid, p_related_transaction_id uuid, p_note text, p_allow_negative boolean)\n RETURNS inventory_transactions\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\r\ndeclare\r\n  v_stock inventory_stock;\r\n  v_new_qty numeric;\r\n  v_new_avg numeric;\r\n  v_prev_avg numeric;\r\n  v_tx inventory_transactions;\r\nBEGIN\n\n IF p_qty_change IS NOT NULL AND p_qty_change::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'p_qty_change must be finite'; END IF;\n IF p_unit_cost IS NOT NULL AND p_unit_cost::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'p_unit_cost must be finite'; END IF;\n  if p_business_id is distinct from current_business_id() then\r\n    raise exception 'business_id mismatch';\r\n  end if;\r\n\r\n  if not exists (\r\n    select 1 from inventory_items\r\n    where id = p_inventory_item_id and business_id = p_business_id\r\n  ) then\r\n    raise exception 'inventory item not found';\r\n  end if;\r\n\r\n  if not exists (\r\n    select 1 from locations\r\n    where id = p_location_id and business_id = p_business_id\r\n  ) then\r\n    raise exception 'location not found';\r\n  end if;\r\n\r\n  select * into v_stock\r\n  from inventory_stock\r\n  where inventory_item_id = p_inventory_item_id\r\n    and location_id = p_location_id\r\n  for update;\r\n\r\n  if v_stock.id is null then\r\n    insert into inventory_stock (\r\n      inventory_item_id, location_id, qty, avg_cost_per_unit\r\n    )\r\n    values (\r\n      p_inventory_item_id, p_location_id, 0, 0\r\n    )\r\n    returning * into v_stock;\r\n  end if;\r\n\r\n  v_prev_avg := v_stock.avg_cost_per_unit;\r\n  v_new_qty := round(v_stock.qty + p_qty_change, 3);\r\n\r\n  if v_new_qty < 0 and not p_allow_negative then\r\n    raise exception\r\n      'insufficient stock: item % at location % would go to % (negative not allowed)',\r\n      p_inventory_item_id, p_location_id, v_new_qty;\r\n  end if;\r\n\r\n  if p_type in ('PURCHASE','INITIAL_STOCK','TRANSFER_IN')\r\n     and p_qty_change > 0\r\n     and p_unit_cost is not null then\r\n\r\n    if v_new_qty > 0 then\r\n      v_new_avg := round(\r\n        (\r\n          (v_stock.qty * v_stock.avg_cost_per_unit)\r\n          + (p_qty_change * p_unit_cost)\r\n        ) / v_new_qty,\r\n        4\r\n      );\r\n    else\r\n      v_new_avg := p_unit_cost;\r\n    end if;\r\n  else\r\n    v_new_avg := v_stock.avg_cost_per_unit;\r\n  end if;\r\n\r\n  update inventory_stock\r\n  set\r\n    qty = v_new_qty,\r\n    avg_cost_per_unit = v_new_avg,\r\n    last_purchase_cost = case\r\n      when p_type in ('PURCHASE','INITIAL_STOCK') then p_unit_cost\r\n      else last_purchase_cost\r\n    end,\r\n    last_purchase_date = case\r\n      when p_type in ('PURCHASE','INITIAL_STOCK') then now()\r\n      else last_purchase_date\r\n    end,\r\n    updated_at = now()\r\n  where inventory_item_id = p_inventory_item_id\r\n    and location_id = p_location_id;\r\n\r\n  insert into inventory_transactions (\r\n    business_id,\r\n    inventory_item_id,\r\n    location_id,\r\n    type,\r\n    qty_change,\r\n    unit,\r\n    unit_cost,\r\n    total_cost,\r\n    sale_id,\r\n    purchase_order_id,\r\n    related_transaction_id,\r\n    prev_avg_cost,\r\n    new_avg_cost,\r\n    note,\r\n    created_by\r\n  )\r\n  select\r\n    p_business_id,\r\n    p_inventory_item_id,\r\n    p_location_id,\r\n    p_type,\r\n    p_qty_change,\r\n    i.unit,\r\n    coalesce(p_unit_cost, v_prev_avg),\r\n    round(p_qty_change * coalesce(p_unit_cost, v_prev_avg), 2),\r\n    p_sale_id,\r\n    p_purchase_order_id,\r\n    p_related_transaction_id,\r\n    v_prev_avg,\r\n    v_new_avg,\r\n    p_note,\r\n    auth.uid()\r\n  from inventory_items i\r\n  where i.id = p_inventory_item_id\r\n  returning * into v_tx;\r\n\r\n  return v_tx;\r\nend;\r\n$function$\n"$definition$::jsonb #>> '{}');
  IF pg_catalog.md5(pg_catalog.pg_get_functiondef(v_oid)) IS DISTINCT FROM 'b5ac605f98d630ec318651bfb70eda63'
    OR (SELECT proacl FROM pg_catalog.pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_acl
    OR (SELECT proowner FROM pg_catalog.pg_proc WHERE oid=v_oid) IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'stock precision postcondition mismatch';
  END IF;
END;
$guard$;
COMMIT;
