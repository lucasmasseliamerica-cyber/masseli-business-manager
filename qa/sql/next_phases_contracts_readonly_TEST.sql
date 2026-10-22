-- D/E discovery only. Supabase TEST msinksoilkluooxenecy; verify connection externally.
-- Absence, drift and historical matches are inventory facts, not permission to apply or execute.
WITH expected(name,historical_fingerprint) AS (VALUES
 ('fn_create_purchase_order','60a5ebb422936aae5d2b1abb38688c65'),
 ('fn_create_purchase_order_idempotent',NULL::text),
 ('fn_receive_purchase_order','51ae83d203731a294af7a19bf7e44944'),
 ('fn_pay_purchase_order','ca78a44774e353cc41a3d1fb848c18e3'),
 ('fn_reverse_purchase_order','c28d6e6a43093d03ceeaa4689262a198'),
 ('fn_cancel_purchase_order','d2fbddd81358e90640d9cbb0ce231829'),
 ('fn_open_cash_register','cd4e3943b0adc5856e89c15152f95e02'),
 ('fn_record_cash_movement','39688cba8b793bc3482925483cb03db2'),
 ('fn_close_cash_register','abc12e6f24daac827c1fea828377e7a0'),
 ('fn_create_expense','2d2e871c427eaa6110aff62d0a0f35e5'),
 ('fn_create_expense_idempotent',NULL::text),
 ('fn_reverse_expense','d9081382bd6cb3c654c234ee61c411c4')
), observed AS (
 SELECT e.name,e.historical_fingerprint,p.oid IS NOT NULL AS present,
   pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS fingerprint,
   pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
   pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
   pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
   p.prosecdef AS security_definer,p.proconfig AS settings
 FROM expected e LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
 LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name AND p.prokind='f'
)
SELECT jsonb_build_object('project_ref_expected','msinksoilkluooxenecy','mode','READ_ONLY','captured_at',CURRENT_TIMESTAMP,
 'functions',(SELECT jsonb_agg(to_jsonb(o) ORDER BY name) FROM observed o),
 'status','INVENTORY_ONLY_NOT_PHASE_APPROVAL','persistent_authorized',false,
 'note','Do not create orders, receive, pay, reverse, open cash, create expenses, apply migrations, modify baselines or enable CI write jobs from this result'
) AS next_phases_contracts;
