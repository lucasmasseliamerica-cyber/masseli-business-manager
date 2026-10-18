-- NEXALVO TEST legacy platform authority alignment — READ ONLY.
-- Run only after independently selecting Supabase TEST msinksoilkluooxenecy.
-- Returns aggregate counts only: no user id, email, token, claim document or tenant row is exposed.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

WITH operator_alignment AS (
  SELECT
    count(*) AS operator_rows,
    count(DISTINCT o.user_id) AS distinct_operator_users,
    count(*) FILTER (WHERE o.active) AS active_operators,
    count(*) FILTER (WHERE o.active AND u.id IS NOT NULL AND u.active) AS active_operators_with_active_profile,
    count(*) FILTER (
      WHERE o.active
        AND u.id IS NOT NULL
        AND u.active
        AND a.id IS NOT NULL
        AND a.deleted_at IS NULL
        AND COALESCE(a.is_anonymous, false) = false
        AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now())
        AND a.raw_app_meta_data ->> 'nexalvo_platform_role' = 'SUPERADMIN'
    ) AS active_operators_with_signed_superadmin_claim,
    count(*) FILTER (
      WHERE o.active
        AND NOT (
          u.id IS NOT NULL
          AND u.active
          AND a.id IS NOT NULL
          AND a.deleted_at IS NULL
          AND COALESCE(a.is_anonymous, false) = false
          AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now())
          AND a.raw_app_meta_data ->> 'nexalvo_platform_role' = 'SUPERADMIN'
        )
    ) AS active_operator_without_signed_superadmin_claim,
    count(*) FILTER (WHERE o.active AND u.role = 'OWNER') AS active_operator_with_tenant_owner_role
  FROM nexalvo_platform.operators AS o
  LEFT JOIN public.users AS u ON u.id = o.user_id
  LEFT JOIN auth.users AS a ON a.id = o.user_id
), signed_claims AS (
  SELECT count(*) AS signed_superadmins,
         count(*) FILTER (
           WHERE NOT EXISTS (
             SELECT 1
             FROM nexalvo_platform.operators AS o
             JOIN public.users AS u ON u.id = o.user_id AND u.active
             WHERE o.user_id = a.id AND o.active
           )
         ) AS signed_superadmin_without_active_operator
  FROM auth.users AS a
  WHERE a.raw_app_meta_data ->> 'nexalvo_platform_role' = 'SUPERADMIN'
    AND a.deleted_at IS NULL
    AND COALESCE(a.is_anonymous, false) = false
    AND (a.banned_until IS NULL OR a.banned_until <= pg_catalog.now())
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'operator_rows', o.operator_rows,
  'distinct_operator_users', o.distinct_operator_users,
  'active_operators', o.active_operators,
  'active_operators_with_active_profile', o.active_operators_with_active_profile,
  'active_operators_with_signed_superadmin_claim', o.active_operators_with_signed_superadmin_claim,
  'active_operator_without_signed_superadmin_claim', o.active_operator_without_signed_superadmin_claim,
  'active_operator_with_tenant_owner_role', o.active_operator_with_tenant_owner_role,
  'signed_superadmins', s.signed_superadmins,
  'signed_superadmin_without_active_operator', s.signed_superadmin_without_active_operator,
  'authority_models_aligned',
    o.active_operator_without_signed_superadmin_claim = 0
    AND s.signed_superadmin_without_active_operator = 0
    AND o.active_operators = s.signed_superadmins
) AS platform_admin_operator_alignment
FROM operator_alignment AS o
CROSS JOIN signed_claims AS s;

ROLLBACK;
