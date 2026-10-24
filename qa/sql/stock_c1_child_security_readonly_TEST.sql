-- C1 child security capture, NEXALVO TEST msinksoilkluooxenecy only.
-- Strictly SELECT-only. Confirm the SQL connection identity externally before execution.
-- No business rows, function bodies, column defaults or non-search_path GUC values are exported.
-- Policy/trigger definitions can contain literals: scan/review locally; do not version raw output.
-- This capture is NOT approval. Independently review all metadata/policies, then compute the
-- JS canonicalSecurityDigest. Never configure the executor with a self-observed hash blindly.
WITH required_functions(name) AS (VALUES
  ('current_business_id'),('user_can'),('fn_adjust_inventory_count'),('fn_record_waste'),
  ('fn_transfer_inventory'),('fn_record_inventory_movement'),('fn_read_inventory_stock_secure'),
  ('fn_read_inventory_transactions_secure'),('fn_read_purchase_order_items_secure'),
  ('fn_read_waste_transactions_secure'),('fn_write_audit'),('fn_session_access_status')
), functions AS (
  SELECT e.name,p.oid IS NOT NULL AS present,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS fingerprint,
    pg_catalog.md5(p.prosrc) AS body_fingerprint,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') AS body_sha256,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_function_result(p.oid) AS return_type,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,p.prosecdef AS security_definer,
    l.lanname AS language,p.provolatile AS volatility,p.proisstrict AS is_strict,
    p.proleakproof AS leakproof,p.proretset AS returns_set,p.pronargdefaults AS argument_defaults,
    pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
    (SELECT count(*) FROM pg_catalog.pg_proc q WHERE q.pronamespace=p.pronamespace
      AND q.proname=p.proname AND q.prokind='f') AS overloads,
    coalesce(pg_catalog.cardinality(p.proconfig),0) AS settings_count,
    (SELECT count(*) FROM pg_catalog.unnest(p.proconfig) AS setting
      WHERE setting NOT LIKE 'search_path=%') AS other_settings_count,
    coalesce((SELECT pg_catalog.jsonb_agg(setting ORDER BY setting)
      FROM pg_catalog.unnest(p.proconfig) AS setting WHERE setting LIKE 'search_path=%'),'[]'::jsonb) AS settings
  FROM required_functions e
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_proc p ON p.pronamespace=n.oid AND p.proname=e.name AND p.prokind='f'
  LEFT JOIN pg_catalog.pg_language l ON l.oid=p.prolang
), required_tables(name) AS (VALUES
  ('inventory_items'),('inventory_stock'),('inventory_transactions'),('waste_transactions'),
  ('locations'),('product_recipes'),('purchase_orders'),('purchase_order_items'),('cash_flow'),
  ('audit_logs'),('users'),('businesses'),('role_default_permissions')
), table_oids AS (
  SELECT e.name,c.oid,c.oid IS NOT NULL AS present,pg_catalog.pg_get_userbyid(c.relowner) AS owner,
    c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
    (SELECT count(*) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid
      AND a.attnum>0 AND NOT a.attisdropped) AS column_count
  FROM required_tables e LEFT JOIN pg_catalog.pg_namespace n ON n.nspname='public'
  LEFT JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=e.name AND c.relkind IN ('r','p')
), tables AS (
  SELECT t.name,t.present,t.owner,t.rls,t.force_rls,t.column_count,
    pg_catalog.has_table_privilege('anon',t.oid,'SELECT') AS anon_select,
    pg_catalog.has_table_privilege('anon',t.oid,'INSERT') AS anon_insert,
    pg_catalog.has_table_privilege('anon',t.oid,'UPDATE') AS anon_update,
    pg_catalog.has_table_privilege('anon',t.oid,'DELETE') AS anon_delete,
    pg_catalog.has_table_privilege('anon',t.oid,'TRUNCATE') AS anon_truncate,
    pg_catalog.has_table_privilege('anon',t.oid,'REFERENCES') AS anon_references,
    pg_catalog.has_table_privilege('anon',t.oid,'TRIGGER') AS anon_trigger,
    pg_catalog.has_table_privilege('authenticated',t.oid,'SELECT') AS authenticated_select,
    pg_catalog.has_table_privilege('authenticated',t.oid,'INSERT') AS authenticated_insert,
    pg_catalog.has_table_privilege('authenticated',t.oid,'UPDATE') AS authenticated_update,
    pg_catalog.has_table_privilege('authenticated',t.oid,'DELETE') AS authenticated_delete,
    pg_catalog.has_table_privilege('authenticated',t.oid,'TRUNCATE') AS authenticated_truncate,
    pg_catalog.has_table_privilege('authenticated',t.oid,'REFERENCES') AS authenticated_references,
    pg_catalog.has_table_privilege('authenticated',t.oid,'TRIGGER') AS authenticated_trigger
  FROM table_oids t
), columns AS (
  SELECT t.name AS table_name,a.attname AS name,a.attnum AS ordinal,
    pg_catalog.format_type(a.atttypid,a.atttypmod) AS formatted_type,a.attnotnull AS not_null,
    pg_catalog.has_column_privilege('anon',t.oid,a.attnum,'SELECT') AS anon_select,
    pg_catalog.has_column_privilege('anon',t.oid,a.attnum,'INSERT') AS anon_insert,
    pg_catalog.has_column_privilege('anon',t.oid,a.attnum,'UPDATE') AS anon_update,
    pg_catalog.has_column_privilege('anon',t.oid,a.attnum,'REFERENCES') AS anon_references,
    pg_catalog.has_column_privilege('authenticated',t.oid,a.attnum,'SELECT') AS authenticated_select,
    pg_catalog.has_column_privilege('authenticated',t.oid,a.attnum,'INSERT') AS authenticated_insert,
    pg_catalog.has_column_privilege('authenticated',t.oid,a.attnum,'UPDATE') AS authenticated_update,
    pg_catalog.has_column_privilege('authenticated',t.oid,a.attnum,'REFERENCES') AS authenticated_references
  FROM table_oids t JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
), policies AS (
  SELECT p.tablename AS table_name,p.policyname AS name,p.permissive,p.roles,p.cmd AS command,
    p.qual,p.with_check
  FROM pg_catalog.pg_policies p JOIN required_tables t ON t.name=p.tablename
  WHERE p.schemaname='public'
), triggers AS (
  SELECT t.name AS table_name,g.tgname AS name,g.tgenabled AS enabled,
    pg_catalog.pg_get_triggerdef(g.oid,true) AS definition,
    n.nspname AS function_schema,p.proname AS function_name,
    pg_catalog.pg_get_userbyid(p.proowner) AS function_owner,
    p.prosecdef AS function_security_definer,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS function_fingerprint,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p.prosrc,'UTF8')),'hex') AS function_body_sha256
  FROM table_oids t JOIN pg_catalog.pg_trigger g ON g.tgrelid=t.oid AND NOT g.tgisinternal
  JOIN pg_catalog.pg_proc p ON p.oid=g.tgfoid
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
), api_roles AS (
  SELECT e.name,r.oid IS NOT NULL AS present,r.rolsuper AS superuser,r.rolbypassrls AS bypass_rls,
    r.rolcreaterole AS create_role,r.rolcreatedb AS create_db,r.rolinherit AS inherit,
    coalesce((SELECT pg_catalog.jsonb_agg(member.rolname ORDER BY member.rolname)
      FROM pg_catalog.pg_roles member WHERE member.oid<>r.oid
      AND pg_catalog.pg_has_role(r.oid,member.oid,'MEMBER')),'[]'::jsonb) AS member_of
  FROM (VALUES ('anon'),('authenticated')) AS e(name)
  LEFT JOIN pg_catalog.pg_roles r ON r.rolname=e.name
), schema_security AS (
  SELECT pg_catalog.pg_get_userbyid(n.nspowner) AS owner,
    pg_catalog.has_schema_privilege('anon',n.oid,'CREATE') AS anon_create,
    pg_catalog.has_schema_privilege('authenticated',n.oid,'CREATE') AS authenticated_create,
    pg_catalog.has_schema_privilege('anon',n.oid,'USAGE') AS anon_usage,
    pg_catalog.has_schema_privilege('authenticated',n.oid,'USAGE') AS authenticated_usage
  FROM pg_catalog.pg_namespace n WHERE n.nspname='public'
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected','msinksoilkluooxenecy','connection_identity','VERIFY_EXTERNALLY',
  'mode','READ_ONLY','captured_at',CURRENT_TIMESTAMP,
  'status','CAPTURED_REQUIRES_INDEPENDENT_REVIEW',
  'public_schema',(SELECT pg_catalog.to_jsonb(s) FROM schema_security s),
  'api_roles',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY name) FROM api_roles r),'[]'::jsonb),
  'functions',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY name,identity_arguments) FROM functions f),'[]'::jsonb),
  'tables',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY name) FROM tables t),'[]'::jsonb),
  'columns',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY table_name,ordinal) FROM columns c),'[]'::jsonb),
  'policies',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY table_name,name) FROM policies p),'[]'::jsonb),
  'triggers',coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY table_name,name) FROM triggers t),'[]'::jsonb),
  'counts',pg_catalog.jsonb_build_object('functions',(SELECT count(*) FROM functions),
    'tables',(SELECT count(*) FROM tables),'columns',(SELECT count(*) FROM columns),
    'policies',(SELECT count(*) FROM policies),'triggers',(SELECT count(*) FROM triggers)),
  'execution_authorized',false,
  'note','Metadata capture only. Independently review policies, triggers and effective privileges before configuring a reviewed digest.'
) AS stock_c1_child_security;
