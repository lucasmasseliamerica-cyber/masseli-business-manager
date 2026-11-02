-- LOCAL DISPOSABLE TEST SCHEMA ONLY. Never deploy this file.
-- Three target tables reconstructed from the 02/11 catalog; parent/history tables are synthetic stubs.
CREATE TABLE public.businesses(id uuid PRIMARY KEY, platform_status text);
CREATE TABLE public.users(id uuid PRIMARY KEY,business_id uuid,role text,active boolean);
CREATE TABLE public.suppliers(id uuid PRIMARY KEY,business_id uuid);
CREATE TABLE public.locations(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"business_id" uuid NOT NULL,
"name" text NOT NULL,
"type" text DEFAULT 'Retail'::text,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.locations ADD CONSTRAINT "locations_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id);
ALTER TABLE public.locations ADD CONSTRAINT "locations_pkey" PRIMARY KEY (id);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.inventory_items(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"business_id" uuid NOT NULL,
"name" text NOT NULL,
"sku" text,
"category" text,
"unit" text NOT NULL,
"min_qty" numeric(12,3) DEFAULT 0,
"max_qty" numeric(12,3) DEFAULT 0,
"supplier_id" uuid,
"expires_at" timestamp with time zone,
"notes" text,
"active" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.inventory_items ADD CONSTRAINT "finite_max_qty" CHECK (((max_qty IS NULL) OR ((max_qty)::text <> ALL (ARRAY['NaN'::text, 'Infinity'::text, '-Infinity'::text]))));
ALTER TABLE public.inventory_items ADD CONSTRAINT "finite_min_qty" CHECK (((min_qty IS NULL) OR ((min_qty)::text <> ALL (ARRAY['NaN'::text, 'Infinity'::text, '-Infinity'::text]))));
ALTER TABLE public.inventory_items ADD CONSTRAINT "inventory_items_business_id_fkey" FOREIGN KEY (business_id) REFERENCES businesses(id);
ALTER TABLE public.inventory_items ADD CONSTRAINT "inventory_items_max_qty_nonnegative" CHECK ((max_qty >= (0)::numeric));
ALTER TABLE public.inventory_items ADD CONSTRAINT "inventory_items_min_not_above_max" CHECK (((max_qty = (0)::numeric) OR (min_qty <= max_qty)));
ALTER TABLE public.inventory_items ADD CONSTRAINT "inventory_items_min_qty_nonnegative" CHECK ((min_qty >= (0)::numeric));
ALTER TABLE public.inventory_items ADD CONSTRAINT "inventory_items_name_nonblank" CHECK ((NULLIF(btrim(name), ''::text) IS NOT NULL));
ALTER TABLE public.inventory_items ADD CONSTRAINT "inventory_items_pkey" PRIMARY KEY (id);
ALTER TABLE public.inventory_items ADD CONSTRAINT "inventory_items_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public.inventory_items ADD CONSTRAINT "inventory_items_unit_nonblank" CHECK ((NULLIF(btrim(unit), ''::text) IS NOT NULL));
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.inventory_stock(
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"inventory_item_id" uuid NOT NULL,
"location_id" uuid NOT NULL,
"qty" numeric(12,3) DEFAULT 0 NOT NULL,
"avg_cost_per_unit" numeric(12,4) DEFAULT 0 NOT NULL,
"last_purchase_cost" numeric(12,4),
"last_purchase_date" timestamp with time zone,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.inventory_stock ADD CONSTRAINT "finite_avg_cost_per_unit" CHECK (((avg_cost_per_unit IS NULL) OR ((avg_cost_per_unit)::text <> ALL (ARRAY['NaN'::text, 'Infinity'::text, '-Infinity'::text]))));
ALTER TABLE public.inventory_stock ADD CONSTRAINT "finite_last_purchase_cost" CHECK (((last_purchase_cost IS NULL) OR ((last_purchase_cost)::text <> ALL (ARRAY['NaN'::text, 'Infinity'::text, '-Infinity'::text]))));
ALTER TABLE public.inventory_stock ADD CONSTRAINT "finite_qty" CHECK (((qty IS NULL) OR ((qty)::text <> ALL (ARRAY['NaN'::text, 'Infinity'::text, '-Infinity'::text]))));
ALTER TABLE public.inventory_stock ADD CONSTRAINT "inventory_stock_avg_cost_nonnegative" CHECK ((avg_cost_per_unit >= (0)::numeric));
ALTER TABLE public.inventory_stock ADD CONSTRAINT "inventory_stock_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id);
ALTER TABLE public.inventory_stock ADD CONSTRAINT "inventory_stock_inventory_item_id_location_id_key" UNIQUE (inventory_item_id, location_id);
ALTER TABLE public.inventory_stock ADD CONSTRAINT "inventory_stock_last_purchase_cost_nonnegative" CHECK ((last_purchase_cost >= (0)::numeric));
ALTER TABLE public.inventory_stock ADD CONSTRAINT "inventory_stock_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE public.inventory_stock ADD CONSTRAINT "inventory_stock_pkey" PRIMARY KEY (id);
ALTER TABLE public.inventory_stock ADD CONSTRAINT "inventory_stock_qty_nonnegative" CHECK ((qty >= (0)::numeric));
ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.trg_validate_inventory_item_tenant_references()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.supplier_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.suppliers AS s
       WHERE s.id = NEW.supplier_id AND s.business_id = NEW.business_id
     ) THEN
    RAISE EXCEPTION 'inventory item supplier must belong to the same business'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER inventory_items_validate_tenant_references BEFORE INSERT OR UPDATE OF supplier_id, business_id ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION trg_validate_inventory_item_tenant_references();
CREATE UNIQUE INDEX uq_locations_active_name ON public.locations USING btree(business_id,name) WHERE active;
CREATE UNIQUE INDEX uq_locations_active_name_normalized ON public.locations USING btree(business_id,lower(btrim(name))) WHERE active;
CREATE UNIQUE INDEX inventory_items_business_sku_unique ON public.inventory_items USING btree(business_id,lower(btrim(sku))) WHERE (NULLIF(btrim(sku), ''::text) IS NOT NULL);
CREATE INDEX idx_fk_cf42ce6422129d6a ON public.inventory_items USING btree(supplier_id);
CREATE INDEX idx_fk_511ef7969f32ea93 ON public.inventory_stock USING btree(location_id);
CREATE TABLE public.inventory_transactions(id uuid PRIMARY KEY,inventory_item_id uuid,location_id uuid);
CREATE TABLE public.waste_transactions(id uuid PRIMARY KEY,inventory_item_id uuid,location_id uuid);
CREATE TABLE public.product_recipes(id uuid PRIMARY KEY,inventory_item_id uuid);
CREATE TABLE public.purchase_order_items(id uuid PRIMARY KEY,inventory_item_id uuid);
CREATE TABLE public.audit_logs(id uuid PRIMARY KEY,details text);
INSERT INTO public.businesses VALUES('d627563b-2ce4-491d-8cf6-141ef28d0f63','ACTIVE');
INSERT INTO public.users VALUES('f37e9907-47c4-48bf-94b7-9a6fa5de1f88','d627563b-2ce4-491d-8cf6-141ef28d0f63','OWNER',true);
