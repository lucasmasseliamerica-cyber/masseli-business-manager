-- NEXALVO TEST-only rollback for 20261016_product_images_storage_TEST.sql.
-- PREPARED ONLY: do not run without explicit authorization.
-- Refuses to remove a bucket containing any object, preserving uploaded business data.

BEGIN;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1 FROM storage.objects WHERE bucket_id = 'nexalvo-product-images'
  ) THEN
    RAISE EXCEPTION 'rollback refused: product image objects exist';
  END IF;
END
$block$;

DROP POLICY IF EXISTS "nexalvo_product_images_select" ON storage.objects;
DROP POLICY IF EXISTS "nexalvo_product_images_insert" ON storage.objects;
DROP POLICY IF EXISTS "nexalvo_product_images_update" ON storage.objects;
DROP POLICY IF EXISTS "nexalvo_product_images_delete" ON storage.objects;

DELETE FROM storage.buckets WHERE id = 'nexalvo-product-images';

COMMIT;
