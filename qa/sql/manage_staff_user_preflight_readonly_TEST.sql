-- NEXALVO manage-staff-user deployment preflight — Supabase TEST msinksoilkluooxenecy only.
-- Run only after external TEST project confirmation. No Auth or tenant rows are returned.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT jsonb_build_object(
  'rpc_collision', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'arguments', pg_get_function_identity_arguments(p.oid),
      'security_definer', p.prosecdef,
      'settings', p.proconfig,
      'owner', pg_get_userbyid(p.proowner)
    )), '[]'::jsonb)
    FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_manage_staff_profile'
  ),
  'required_columns', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', table_name, 'column', column_name, 'type', data_type,
      'nullable', is_nullable, 'default', column_default
    ) ORDER BY table_name, ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'users' AND column_name IN (
        'id','business_id','employee_id','name','username','role','permission_overrides','active','updated_at'
      )) OR (table_name = 'employees' AND column_name IN ('id','business_id','active'))
        OR (table_name = 'audit_logs' AND column_name IN (
          'business_id','user_id','user_name_snapshot','role_snapshot','action','details'
        )))
  ),
  'constraints', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', c.relname, 'name', con.conname, 'type', con.contype,
      'definition', pg_get_constraintdef(con.oid, true)
    ) ORDER BY c.relname, con.conname)
    FROM pg_constraint AS con
    JOIN pg_class AS c ON c.oid = con.conrelid
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('users', 'employees', 'audit_logs')
  ),
  'service_role_privileges', (
    SELECT jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'select', has_table_privilege('service_role', c.oid, 'SELECT'),
      'insert', has_table_privilege('service_role', c.oid, 'INSERT'),
      'update', has_table_privilege('service_role', c.oid, 'UPDATE')
    ) ORDER BY c.relname)
    FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('users', 'employees', 'audit_logs')
  )
) AS manage_staff_user_preflight;

ROLLBACK;
