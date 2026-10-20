-- NEXALVO TEST msinksoilkluooxenecy ONLY. Read-only operational inventory, not an apply script.
-- The project ref is an expected marker, NOT proof of connection identity. Confirm TEST in the
-- SQL integration before running. Definitions are fingerprinted; no bodies, identities or PII.
WITH required_functions(name, phase) AS (
  VALUES
    ('fn_create_sale','core'),('fn_reverse_sale','core'),
    ('fn_create_purchase_order','core'),('fn_receive_purchase_order','core'),
    ('fn_pay_purchase_order','core'),('fn_reverse_purchase_order','core'),
    ('fn_create_expense','core'),('fn_reverse_expense','core'),
    ('fn_adjust_inventory_count','core'),('fn_transfer_inventory','core'),
    ('fn_read_employees_secure','core'),('fn_read_sale_items_secure','core'),
    ('fn_create_purchase_order_idempotent','prepared'),
    ('fn_create_expense_idempotent','prepared'),('fn_manage_staff_profile','prepared')
), function_inventory AS (
  SELECT r.name, r.phase, count(p.oid) AS overloads,
    coalesce(jsonb_agg(jsonb_build_object(
      'identity_arguments',pg_catalog.pg_get_function_identity_arguments(p.oid),
      'definition_fingerprint',pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)),
      'security_definer',p.prosecdef,'settings',p.proconfig,
      'anon_execute',pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
      'authenticated_execute',pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
    ) ORDER BY p.oid) FILTER (WHERE p.oid IS NOT NULL),'[]'::jsonb) AS definitions,
    bool_or(pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE')) AS anon_execute
  FROM required_functions r
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=r.name
  GROUP BY r.name,r.phase
), required_tables(name) AS (
  VALUES ('products'),('sales'),('inventory_items'),('purchase_orders'),('expenses'),
    ('cash_flow'),('users'),('employees'),('customers')
), table_inventory AS (
  SELECT r.name,c.oid IS NOT NULL AS present,coalesce(c.relrowsecurity,false) AS rls
  FROM required_tables r
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=r.name AND c.relkind IN ('r','p')
), counts AS (
  SELECT (SELECT count(*) FROM function_inventory WHERE phase='core' AND overloads<>1) AS missing_or_ambiguous_core,
    (SELECT count(*) FROM function_inventory WHERE phase='prepared' AND overloads<>1) AS pending_function_packages,
    (SELECT count(*) FROM function_inventory WHERE anon_execute IS TRUE) AS anon_functions,
    (SELECT count(*) FROM table_inventory WHERE NOT present OR NOT rls) AS missing_or_unprotected_tables,
    (SELECT count(*) FROM storage.buckets WHERE id='nexalvo-product-images' AND public=false) AS private_photo_buckets
)
SELECT jsonb_build_object(
  'project_ref_expected','msinksoilkluooxenecy',
  'project_identity','EXTERNAL_CONFIRMATION_REQUIRED',
  'mode','READ_ONLY',
  'status',CASE
    WHEN missing_or_ambiguous_core>0 OR anon_functions>0 OR missing_or_unprotected_tables>0 THEN 'FAIL_CATALOG_GUARD'
    WHEN pending_function_packages>0 OR private_photo_buckets<>1 THEN 'BLOCKED_PREPARED_PACKAGES'
    ELSE 'PASS_CATALOG_ONLY_NOT_OPERATIONAL_HOMOLOGATION' END,
  'counts',to_jsonb(counts),
  'functions',(SELECT jsonb_agg(to_jsonb(f) ORDER BY name) FROM function_inventory f),
  'tables',(SELECT jsonb_agg(to_jsonb(t) ORDER BY name) FROM table_inventory t),
  'requires_separate_authorization',jsonb_build_array('migrations','persistent_QA_flows','identity_links_or_invites'),
  'remaining','Catalog PASS does not prove UI persistence, profiles, photos, finance or backup restoration'
) AS operational_release_preflight
FROM counts;
