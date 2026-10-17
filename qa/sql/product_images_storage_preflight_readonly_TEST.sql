-- READ ONLY. Run against NEXALVO TEST msinksoilkluooxenecy before reviewing the Storage migration.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT
  b.id,
  b.name,
  b.public,
  b.file_size_limit,
  b.allowed_mime_types
FROM storage.buckets AS b
WHERE b.id = 'nexalvo-product-images';

SELECT
  p.policyname,
  p.cmd,
  p.roles,
  p.qual,
  p.with_check
FROM pg_policies AS p
WHERE p.schemaname = 'storage'
  AND p.tablename = 'objects'
  AND (
    p.policyname LIKE 'nexalvo_product_images_%'
    OR coalesce(p.qual, '') LIKE '%nexalvo-product-images%'
    OR coalesce(p.with_check, '') LIKE '%nexalvo-product-images%'
  )
ORDER BY p.policyname;

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('current_business_id', 'user_can')
ORDER BY p.proname, identity_arguments;

SELECT
  has_schema_privilege('authenticated', 'storage', 'USAGE') AS authenticated_storage_usage,
  has_table_privilege('authenticated', 'storage.objects', 'SELECT') AS authenticated_objects_select,
  has_table_privilege('authenticated', 'storage.objects', 'INSERT') AS authenticated_objects_insert,
  has_table_privilege('authenticated', 'storage.objects', 'UPDATE') AS authenticated_objects_update,
  has_table_privilege('authenticated', 'storage.objects', 'DELETE') AS authenticated_objects_delete;

SELECT
  c.column_name,
  c.data_type,
  c.character_maximum_length,
  c.is_nullable
FROM information_schema.columns AS c
WHERE c.table_schema = 'public'
  AND c.table_name = 'products'
  AND c.column_name IN ('id', 'business_id', 'image_url')
ORDER BY c.column_name;

SELECT
  con.conname,
  pg_get_constraintdef(con.oid, true) AS constraint_definition
FROM pg_constraint AS con
WHERE con.conrelid = 'public.products'::regclass
ORDER BY con.conname;

SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'fn_save_product'
ORDER BY identity_arguments;

ROLLBACK;
