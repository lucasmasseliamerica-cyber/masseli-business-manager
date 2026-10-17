-- NEXALVO TEST role/permission configuration export — READ ONLY.
-- This reads only global authorization configuration, never tenant or auth identity rows.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'project_ref_external_assertion', NULL,
  'row_count', count(*),
  'roles', count(DISTINCT role),
  'permission_keys', count(DISTINCT permission_key),
  'defaults', COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'role', role,
        'permission_key', permission_key,
        'granted', granted
      ) ORDER BY role, permission_key
    ),
    '[]'::jsonb
  )
) AS final_permission_defaults
FROM public.role_default_permissions;

ROLLBACK;
