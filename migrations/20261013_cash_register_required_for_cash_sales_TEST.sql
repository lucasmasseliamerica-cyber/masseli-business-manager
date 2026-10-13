-- NEXALVO P0.03 — TEST ONLY: reject cash sales when no cash drawer is open.
-- Applied to Supabase QA TEST project msinksoilkluooxenecy on 2026-10-13.
-- DO NOT APPLY TO PRODUCTION WITHOUT SEPARATE REVIEW AND APPROVAL.
-- Source of truth: pg_get_functiondef(public.fn_create_sale) after successful TEST migration.
-- Existing function security, grants, idempotency and row-lock behavior remain preserved.
CREATE OR REPLACE FUNCTION public.fn_create_sale(p_sale_id uuid, p_business_id uuid, p_location_id uuid, p_channel text, p_payment_method text, p_employee_id uuid, p_customer_id uuid, p_discount numeric, p_tax numeric, p_notes text, p_fulfillment_status text, p_items jsonb)
 RETURNS sales
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sale sales; v_existing_business_id uuid; v_order_no integer; v_item jsonb; v_recipe_row record; v_subtotal numeric:=0; v_allow_negative boolean; v_product_cost numeric; v_cash_register_id uuid;
BEGIN

 IF p_discount IS NOT NULL AND p_discount::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'p_discount must be finite'; END IF;
 IF p_tax IS NOT NULL AND p_tax::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'p_tax must be finite'; END IF;
 IF p_items IS NOT NULL AND jsonb_typeof(p_items)='array' AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) j WHERE lower(btrim(j->>'qty')) IN ('nan','infinity','+infinity','-infinity','inf','+inf','-inf') OR lower(btrim(j->>'unit_price')) IN ('nan','infinity','+infinity','-infinity','inf','+inf','-inf')) THEN RAISE EXCEPTION 'Item quantity and cost/price must be finite'; END IF;
 if p_business_id is distinct from current_business_id() then raise exception 'business_id mismatch'; end if;
 if not user_can('manageSales') then raise exception 'permission denied: manageSales required'; end if;
 if p_sale_id is null then raise exception 'sale id is required'; end if;
 if nullif(btrim(p_channel),'') is null then raise exception 'sales channel is required'; end if;
 if nullif(btrim(p_payment_method),'') is null then raise exception 'payment method is required'; end if;
 if coalesce(p_discount,0)<0 or coalesce(p_tax,0)<0 then raise exception 'discount and tax cannot be negative'; end if;
 if p_fulfillment_status not in ('Received','Preparing','Ready','Completed') then raise exception 'invalid fulfillment status'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'at least one sale item is required'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) i where nullif(i->>'product_id','') is null or nullif(i->>'qty','') is null or nullif(i->>'unit_price','') is null) then raise exception 'sale items require product_id, qty and unit_price'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) i where (i->>'qty')::numeric<=0 or (i->>'unit_price')::numeric<0) then raise exception 'sale items require qty > 0 and unit_price >= 0'; end if;
 if exists(select 1 from (select i->>'product_id' id,count(*) c from jsonb_array_elements(p_items)i group by 1 having count(*)>1)d) then raise exception 'duplicate product in sale'; end if;
 if not exists(select 1 from locations where id=p_location_id and business_id=p_business_id) then raise exception 'location not found'; end if;
 if p_employee_id is not null and not exists(select 1 from employees where id=p_employee_id and business_id=p_business_id) then raise exception 'employee not found'; end if;
 if p_customer_id is not null and not exists(select 1 from customers where id=p_customer_id and business_id=p_business_id and active is not false) then raise exception 'customer not found'; end if;
 if exists(select 1 from jsonb_array_elements(p_items)i where not exists(select 1 from products p where p.id=(i->>'product_id')::uuid and p.business_id=p_business_id and p.active=true)) then raise exception 'product not found or inactive'; end if;

 perform pg_advisory_xact_lock(hashtextextended(p_sale_id::text,0));
 select business_id into v_existing_business_id from sales where id=p_sale_id;
 if v_existing_business_id is not null then
   if v_existing_business_id is distinct from p_business_id then raise exception 'sale id unavailable'; end if;
   select * into v_sale from sales where id=p_sale_id and business_id=p_business_id; return v_sale;
 end if;

 select allow_negative_inventory into v_allow_negative from businesses where id=p_business_id;
 v_order_no:=fn_next_order_no(p_business_id,'sale_order_no');
 for v_item in select * from jsonb_array_elements(p_items) loop
   v_subtotal:=v_subtotal+((v_item->>'qty')::numeric*(v_item->>'unit_price')::numeric);
 end loop;
 if round(v_subtotal-coalesce(p_discount,0)+coalesce(p_tax,0),2)<0 then raise exception 'sale total cannot be negative'; end if;

 insert into sales(id,business_id,order_no,location_id,channel,payment_method,employee_id,customer_id,subtotal,discount,tax,total,fulfillment_status,notes,created_by)
 values(p_sale_id,p_business_id,v_order_no,p_location_id,btrim(p_channel),btrim(p_payment_method),p_employee_id,p_customer_id,round(v_subtotal,2),coalesce(p_discount,0),coalesce(p_tax,0),round(v_subtotal-coalesce(p_discount,0)+coalesce(p_tax,0),2),p_fulfillment_status,p_notes,auth.uid())
 on conflict(id) do nothing returning * into v_sale;
 if v_sale.id is null then select * into v_sale from sales where id=p_sale_id and business_id=p_business_id; if v_sale.id is null then raise exception 'sale id unavailable'; end if; return v_sale; end if;

 for v_item in select * from jsonb_array_elements(p_items) loop
   select coalesce(sum(pr.qty_per_unit*s.avg_cost_per_unit),0) into v_product_cost from product_recipes pr join inventory_stock s on s.inventory_item_id=pr.inventory_item_id and s.location_id=p_location_id where pr.product_id=(v_item->>'product_id')::uuid;
   insert into sale_items(sale_id,product_id,product_name_snapshot,qty,unit_price,unit_cost_snapshot)
   select p_sale_id,p.id,p.name,(v_item->>'qty')::numeric,(v_item->>'unit_price')::numeric,v_product_cost from products p where p.id=(v_item->>'product_id')::uuid and p.business_id=p_business_id;
   for v_recipe_row in select pr.* from product_recipes pr join inventory_items ii on ii.id=pr.inventory_item_id where pr.product_id=(v_item->>'product_id')::uuid and ii.business_id=p_business_id loop
     perform fn_record_inventory_movement(p_business_id,v_recipe_row.inventory_item_id,p_location_id,'SALE',-(v_recipe_row.qty_per_unit*(v_item->>'qty')::numeric),null,p_sale_id,null,null,'Sold via Order #'||v_order_no,v_allow_negative);
   end loop;
 end loop;

 if lower(btrim(p_payment_method)) = 'cash' then
   select id into v_cash_register_id from public.cash_registers
   where business_id=p_business_id and location_id=p_location_id and status='open'
   order by opened_at desc limit 1 for update;
   if v_cash_register_id is null then
     raise exception 'cash register is closed for this location';
   end if;
 end if;
 insert into cash_flow(business_id,location_id,type,category,amount,payment_method,description,sale_id,related_cash_register_id,created_by)
 values(p_business_id,p_location_id,'income','Sales - '||btrim(p_channel),v_sale.total,case when lower(btrim(p_payment_method))='cash' then 'Cash' else btrim(p_payment_method) end,'Sale #'||v_order_no,p_sale_id,v_cash_register_id,auth.uid());
 insert into audit_logs(business_id,user_id,user_name_snapshot,role_snapshot,action,details)
 select p_business_id,u.id,u.name,u.role,'Sale Created','Order #'||v_order_no||' - '||v_sale.total from users u where u.id=auth.uid() and u.business_id=p_business_id;
 return v_sale;
end;$function$;
