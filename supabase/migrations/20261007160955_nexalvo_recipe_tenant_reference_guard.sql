-- TEST-validated recipe tenant reference guard. No data rewrite.
CREATE FUNCTION public.trg_validate_recipe_tenant_references()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  product_business_id uuid;
  ingredient_business_id uuid;
BEGIN
  SELECT p.business_id INTO product_business_id
  FROM public.products p WHERE p.id = NEW.product_id;
  SELECT i.business_id INTO ingredient_business_id
  FROM public.inventory_items i WHERE i.id = NEW.inventory_item_id;
  IF product_business_id IS NULL
     OR ingredient_business_id IS NULL
     OR product_business_id IS DISTINCT FROM ingredient_business_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'product and ingredient must belong to the same accessible business';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_validate_recipe_tenant_references() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER product_recipes_validate_tenant_references
BEFORE INSERT OR UPDATE ON public.product_recipes
FOR EACH ROW EXECUTE FUNCTION public.trg_validate_recipe_tenant_references();
