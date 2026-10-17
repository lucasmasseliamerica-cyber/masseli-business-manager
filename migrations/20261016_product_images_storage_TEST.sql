-- NEXALVO TEST-only private product image bucket and tenant policies.
-- PREPARED ONLY: do not apply without explicit authorization and readonly preflight review.

BEGIN;

DO $block$
DECLARE
  v_bucket storage.buckets%ROWTYPE;
BEGIN
  SELECT * INTO v_bucket FROM storage.buckets WHERE id = 'nexalvo-product-images';
  IF FOUND THEN
    IF v_bucket.public IS DISTINCT FROM false
       OR v_bucket.file_size_limit IS DISTINCT FROM 5242880
       OR v_bucket.allowed_mime_types IS DISTINCT FROM ARRAY['image/jpeg', 'image/png', 'image/webp']::text[] THEN
      RAISE EXCEPTION 'existing product image bucket configuration does not match the reviewed contract';
    END IF;
  ELSE
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'nexalvo-product-images',
      'nexalvo-product-images',
      false,
      5242880,
      ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
    );
  END IF;
END
$block$;

CREATE POLICY "nexalvo_product_images_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'nexalvo-product-images'
  AND (storage.foldername(name))[1] = public.current_business_id()::text
);

CREATE POLICY "nexalvo_product_images_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'nexalvo-product-images'
  AND (storage.foldername(name))[1] = public.current_business_id()::text
  AND public.user_can('manageRecipesAndCosts')
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
);

CREATE POLICY "nexalvo_product_images_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'nexalvo-product-images'
  AND (storage.foldername(name))[1] = public.current_business_id()::text
  AND public.user_can('manageRecipesAndCosts')
)
WITH CHECK (
  bucket_id = 'nexalvo-product-images'
  AND (storage.foldername(name))[1] = public.current_business_id()::text
  AND public.user_can('manageRecipesAndCosts')
  AND name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
);

CREATE POLICY "nexalvo_product_images_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'nexalvo-product-images'
  AND (storage.foldername(name))[1] = public.current_business_id()::text
  AND public.user_can('manageRecipesAndCosts')
);

COMMIT;
