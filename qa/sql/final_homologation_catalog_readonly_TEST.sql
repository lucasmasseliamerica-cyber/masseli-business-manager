-- NEXALVO final homologation catalog comparison — READ ONLY.
-- Run only after the operator independently confirms Supabase TEST msinksoilkluooxenecy.
-- This query reads catalog/storage metadata only. It does not read tenant business rows.
-- Save only the single JSON result; it contains no credentials or Auth identity data.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

WITH expected_tables(name) AS (
  VALUES
    ('audit_logs'), ('business_alerts'), ('business_settings_lists'), ('businesses'),
    ('cash_flow'), ('cash_registers'), ('customers'), ('employees'), ('expenses'),
    ('inventory_items'), ('locations'), ('loyalty_rewards'), ('loyalty_transactions'),
    ('product_recipes'), ('products'), ('purchase_order_payments'), ('purchase_orders'),
    ('sale_items'), ('sales'), ('shift_breaks'), ('shifts'), ('suppliers'),
    ('task_activity'), ('tasks'), ('users')
), expected_functions(name) AS (
  VALUES
    ('current_business_id'), ('fn_add_initial_stock'), ('fn_adjust_inventory_count'),
    ('fn_advance_sale_fulfillment'), ('fn_cancel_purchase_order'), ('fn_clock_in'),
    ('fn_clock_out'), ('fn_close_cash_register'), ('fn_commit_loyalty_for_sale'),
    ('fn_create_expense'), ('fn_create_purchase_order'), ('fn_create_sale'),
    ('fn_dismiss_alert'), ('fn_end_break'), ('fn_manual_loyalty_adjustment'),
    ('fn_manage_staff_profile'),
    ('fn_open_cash_register'), ('fn_pay_purchase_order'), ('fn_read_employees_secure'),
    ('fn_read_inventory_stock_secure'), ('fn_read_inventory_transactions_secure'),
    ('fn_read_purchase_order_items_secure'), ('fn_read_sale_items_secure'),
    ('fn_receive_manual_stock'), ('fn_receive_purchase_order'),
    ('fn_reconcile_business_alerts'), ('fn_record_cash_movement'), ('fn_record_waste'),
    ('fn_reverse_expense'), ('fn_reverse_loyalty_for_sale'), ('fn_reverse_po_payment'),
    ('fn_reverse_purchase_order'), ('fn_reverse_sale'), ('fn_save_product'),
    ('fn_save_task'), ('fn_start_break'), ('fn_toggle_task_status'),
    ('fn_transfer_inventory'), ('fn_write_audit'), ('user_can')
), tables AS (
  SELECT e.name,
         c.oid IS NOT NULL AS exists,
         COALESCE(c.relrowsecurity, false) AS rls,
         COALESCE(c.relforcerowsecurity, false) AS force_rls,
         CASE WHEN c.oid IS NULL THEN false ELSE has_table_privilege('anon', c.oid, 'SELECT') END AS anon_select,
         CASE WHEN c.oid IS NULL THEN false ELSE has_table_privilege('authenticated', c.oid, 'SELECT') END AS authenticated_select
  FROM expected_tables AS e
  LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_class AS c ON c.relnamespace = n.oid AND c.relname = e.name AND c.relkind IN ('r', 'p')
), functions AS (
  SELECT e.name,
         pg_get_function_identity_arguments(p.oid) AS arguments,
         p.prosecdef AS security_definer,
         p.proconfig AS settings,
         has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
         md5(pg_get_functiondef(p.oid)) AS fingerprint
  FROM expected_functions AS e
  LEFT JOIN pg_namespace AS n ON n.nspname = 'public'
  LEFT JOIN pg_proc AS p ON p.pronamespace = n.oid AND p.proname = e.name AND p.prokind = 'f'
  WHERE p.oid IS NOT NULL
), migration_markers AS (
  SELECT jsonb_build_object(
    'cash_sale_guard_fingerprint', (
      SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc AS p
      JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_create_sale'
      ORDER BY p.oid LIMIT 1
    ),
    'purchase_idempotency_table', to_regclass('public.purchase_order_request_keys') IS NOT NULL,
    'purchase_idempotency_rpc', to_regprocedure('public.fn_create_purchase_order_idempotent(uuid,uuid,uuid,uuid,date,date,text,text,text,numeric,numeric,jsonb)') IS NOT NULL,
    'expense_idempotency_table', to_regclass('public.expense_request_keys') IS NOT NULL,
    'expense_idempotency_rpc', to_regprocedure('public.fn_create_expense_idempotent(uuid,uuid,uuid,date,text,text,numeric,text,boolean,text)') IS NOT NULL,
    'staff_profile_rpc', to_regprocedure('public.fn_manage_staff_profile(text,uuid,uuid,uuid,uuid,text,text,text,jsonb,boolean)') IS NOT NULL,
    'platform_private_schema', EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'nexalvo_private'),
    'platform_business_columns', (
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'businesses'
        AND column_name IN ('platform_status', 'license_type', 'license_granted_at',
          'license_granted_by', 'license_revoked_at', 'license_revoked_by', 'platform_updated_at')
    ),
    'platform_admin_rpc_count', (
      SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (
        'fn_platform_admin_list_businesses', 'fn_platform_admin_list_audit_logs', 'fn_platform_admin_execute'
      )
    ),
    'product_image_bucket', EXISTS (
      SELECT 1 FROM storage.buckets WHERE id = 'nexalvo-product-images' AND public IS FALSE
    ),
    'product_image_policy_count', (
      SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN ('nexalvo_product_images_select', 'nexalvo_product_images_insert',
          'nexalvo_product_images_update', 'nexalvo_product_images_delete')
    )
  ) AS value
), sensitive_security AS (
  SELECT jsonb_build_object(
    'policies', (
      SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY tablename, policyname), '[]'::jsonb)
      FROM pg_policies AS p
      WHERE p.schemaname = 'public'
        AND p.tablename IN ('task_activity', 'users', 'sales', 'inventory_items',
          'inventory_stock', 'inventory_transactions', 'products')
    ),
    'grants', (
      SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY table_name, grantee, privilege_type), '[]'::jsonb)
      FROM information_schema.role_table_grants AS g
      WHERE g.table_schema = 'public'
        AND g.grantee IN ('anon', 'authenticated')
        AND g.table_name IN ('task_activity', 'users', 'sales', 'inventory_items',
          'inventory_stock', 'inventory_transactions', 'products')
    )
  ) AS value
)
SELECT jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'project_ref_external_assertion', NULL,
  'security_definitions_complete', false,
  'counts', jsonb_build_object(
    'public_tables', (SELECT count(*) FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')),
    'public_rls_tables', (SELECT count(*) FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity),
    'public_policies', (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'),
    'public_functions', (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f'),
    'public_security_definer_functions', (SELECT count(*) FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef),
    'public_role_table_grant_entries', (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema = 'public')
  ),
  'tables', (SELECT jsonb_agg(to_jsonb(t) ORDER BY name) FROM tables AS t),
  'functions', (SELECT jsonb_agg(to_jsonb(f) ORDER BY name, arguments) FROM functions AS f),
  'migration_markers', (SELECT value FROM migration_markers),
  'sensitive_security', (SELECT value FROM sensitive_security)
) AS final_homologation_catalog;

ROLLBACK;
