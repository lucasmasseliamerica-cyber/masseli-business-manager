-- NEXALVO P0.01 — READ-ONLY discovery for real MANAGER/EMPLOYEE preparation.
-- Run only against Supabase TEST msinksoilkluooxenecy through an approved catalog connection.
-- This file never creates identities, changes profiles or reads password/token columns.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

-- Confirm the known QA A tenant and owner binding.
SELECT b.id AS business_id, b.name AS business_name,
       u.id AS owner_id, u.role AS owner_role, u.active AS owner_active
FROM public.businesses AS b
JOIN public.users AS u ON u.business_id = b.id
WHERE b.id = 'd627563b-2ce4-491d-8cf6-141ef28d0f63'
  AND u.id = 'f37e9907-47c4-48bf-94b7-9a6fa5de1f88';

-- Deployed columns and defaults. No row data is returned here.
SELECT table_schema, table_name, ordinal_position, column_name, data_type,
       udt_schema, udt_name, is_nullable, column_default, is_identity, is_generated
FROM information_schema.columns
WHERE (table_schema = 'public' AND table_name IN ('users','employees','audit_logs'))
   OR (table_schema = 'auth' AND table_name = 'users'
       AND column_name IN ('id','email_confirmed_at','deleted_at','banned_until','created_at','updated_at'))
ORDER BY table_schema, table_name, ordinal_position;

-- PK, unique, check and FK definitions, including both sides of auth/public relationships.
SELECT con.conname AS constraint_name,
       con.contype AS constraint_type,
       con.conrelid::regclass::text AS source_relation,
       NULLIF(con.confrelid, 0::oid)::regclass::text AS target_relation,
       pg_get_constraintdef(con.oid, true) AS definition
FROM pg_constraint AS con
WHERE con.conrelid IN ('public.users'::regclass, 'public.employees'::regclass)
   OR con.confrelid IN ('public.users'::regclass, 'public.employees'::regclass)
   OR (con.conrelid = 'auth.users'::regclass AND con.contype IN ('p','u'))
ORDER BY source_relation, constraint_type, constraint_name;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('users','employees')
ORDER BY tablename, indexname;

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('users','employees')
ORDER BY tablename, policyname;

SELECT table_name, grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name IN ('users','employees')
  AND grantee IN ('anon','authenticated')
ORDER BY table_name, grantee, privilege_type;

SELECT table_name, column_name, grantee, privilege_type, is_grantable
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name IN ('users','employees')
  AND grantee IN ('anon','authenticated')
ORDER BY table_name, column_name, grantee, privilege_type;

-- Sanitized candidate inventory: deliberately omits auth e-mail, phone and metadata.
SELECT u.id AS profile_id, u.name, u.username, u.role, u.active,
       u.business_id, u.employee_id,
       e.id IS NOT NULL AS employee_exists,
       e.active AS employee_active,
       e.name AS employee_name,
       e.job_title, e.manager_id,
       au.id IS NOT NULL AS auth_identity_exists,
       au.email_confirmed_at IS NOT NULL AS auth_email_confirmed,
       au.deleted_at IS NULL AS auth_not_deleted,
       CASE
         WHEN au.id IS NULL THEN 'REJECT_NO_AUTH_IDENTITY'
         WHEN au.deleted_at IS NOT NULL THEN 'REJECT_AUTH_DELETED'
         WHEN u.active = true AND u.role = 'EMPLOYEE' AND u.employee_id IS NULL
           THEN 'CONDITIONAL_LINK_ONLY_AFTER_DEPENDENCY_REVIEW'
         WHEN u.active = false OR e.active = false
           THEN 'HISTORICAL_INACTIVE_REVIEW_REQUIRED'
         WHEN u.employee_id IS NOT NULL AND e.id IS NOT NULL AND e.active = true
           THEN 'CONDITIONAL_EXISTING_LINK_REVIEW_REQUIRED'
         ELSE 'REJECT_INCOMPLETE_BINDING'
       END AS reuse_classification
FROM public.users AS u
LEFT JOIN public.employees AS e ON e.id = u.employee_id
LEFT JOIN auth.users AS au ON au.id = u.id
WHERE u.business_id = 'd627563b-2ce4-491d-8cf6-141ef28d0f63'
  AND u.role IN ('MANAGER','EMPLOYEE')
ORDER BY u.role, u.active DESC, u.created_at, u.id;

-- Narrow function definitions needed to evaluate identity, permissions and employee masking.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer, p.proconfig AS settings,
       pg_get_userbyid(p.proowner) AS owner,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('current_business_id','user_can','fn_read_employees_secure','fn_save_user_profile')
ORDER BY p.proname, arguments;

ROLLBACK;
