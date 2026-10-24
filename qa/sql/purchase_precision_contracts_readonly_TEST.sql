-- Purchase precision and RPC contracts, TEST msinksoilkluooxenecy only. SELECT-only.
-- Confirm the SQL connection identity externally. This does not authorize purchases or migrations.
-- format_type includes the actual typmod; numeric_scale NULL can mean unconstrained numeric,
-- not zero precision and not a proven three-decimal operational lifecycle.
WITH required_columns(table_name,column_name) AS (VALUES
  ('purchase_order_items','qty_ordered'),('purchase_order_items','received_qty'),
  ('purchase_order_items','unit_cost'),('inventory_stock','qty'),
  ('inventory_stock','avg_cost_per_unit'),('inventory_transactions','qty_change'),
  ('inventory_transactions','unit_cost'),('inventory_transactions','total_cost')
), columns AS (
  SELECT e.table_name,e.column_name,a.attnum IS NOT NULL AS present,
    pg_catalog.format_type(a.atttypid,a.atttypmod) AS formatted_type,
    a.atttypmod AS typmod,a.attnotnull AS not_null,
    i.data_type,i.numeric_precision,i.numeric_precision_radix,i.numeric_scale,
    pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls,
    pg_catalog.has_column_privilege('anon',c.oid,a.attnum,'SELECT') AS anon_select,
    pg_catalog.has_column_privilege('authenticated',c.oid,a.attnum,'SELECT') AS authenticated_select
  FROM required_columns e LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=e.table_name AND c.relkind IN ('r','p')
  LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attname=e.column_name AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN information_schema.columns i ON i.table_schema='public'
    AND i.table_name=e.table_name AND i.column_name=e.column_name
), required_functions(name) AS (VALUES
  ('fn_create_purchase_order'),('fn_receive_purchase_order'),('fn_create_purchase_order_idempotent')
), functions AS (
  SELECT e.name,p.oid IS NOT NULL AS present,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_catalog.pg_get_function_result(p.oid) AS return_type,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS fingerprint,
    pg_catalog.md5(p.prosrc) AS body_fingerprint,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') AS body_sha256,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,
    l.lanname AS language,p.provolatile AS volatility,
    pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
    coalesce((SELECT pg_catalog.jsonb_agg(setting ORDER BY setting) FROM pg_catalog.unnest(p.proconfig) AS setting
      WHERE setting LIKE 'search_path=%'),'[]'::jsonb) AS search_path_settings,
    (SELECT count(*) FROM pg_catalog.unnest(p.proconfig) AS setting WHERE setting NOT LIKE 'search_path=%') AS other_settings_count,
    (SELECT count(*) FROM pg_catalog.pg_proc q WHERE q.pronamespace=p.pronamespace
      AND q.proname=p.proname AND q.prokind='f') AS overloads
  FROM required_functions e LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name AND p.prokind='f'
  LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected','msinksoilkluooxenecy','connection_identity','VERIFY_EXTERNALLY',
  'mode','READ_ONLY','captured_at',CURRENT_TIMESTAMP,
  'status','CAPTURED_PRECISION_AND_CONTRACTS_REQUIRES_REVIEW',
  'columns',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY table_name,column_name) FROM columns c),
  'functions',(SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY name,arguments) FROM functions f),
  'historical_reference_fingerprints',pg_catalog.jsonb_build_object(
    'fn_create_purchase_order','60a5ebb422936aae5d2b1abb38688c65',
    'fn_receive_purchase_order','51ae83d203731a294af7a19bf7e44944'),
  'live_precision_homologated',false,'persistent_authorized',false,
  'note','Read catalog attributes and compare exact definitions on drift; do not replace expected fingerprints or install prepared idempotency automatically.'
) AS purchase_precision_contracts;
