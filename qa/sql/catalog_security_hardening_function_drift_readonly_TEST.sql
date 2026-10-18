-- NEXALVO catalog hardening function drift capture — READ ONLY, TEST only.
-- Run only after independently selecting Supabase TEST msinksoilkluooxenecy.
-- The result contains function definitions, but no tenant rows, identities, tokens or credentials.
-- Treat the result as an unversioned review artifact and run the repository secret scanner before
-- deriving sanitized fingerprints or committing any evidence.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog;

WITH expected(signature, historical_fingerprint, reported_20261018_fingerprint) AS (
  VALUES
    ('public.fn_read_employees_secure()'::text,
     '1c13bdeb159e0d78db0a200055cdb36a'::text,
     '6a004cb40f967cc39f4c3bd20fec817e'::text),
    ('public.fn_read_sale_items_secure()'::text,
     '161e5147cd4eae4ca6e9a4c074af7cb6'::text,
     'b9c489bf2a75339768bcc19ba174821c'::text),
    ('public.fn_write_audit(text,text)'::text,
     '4ab39d24cd80134b7ca7812c8a38dd7d'::text,
     '2d1742df2500389b93028511b1cb17e5'::text)
), definitions AS (
  SELECT
    e.signature,
    e.historical_fingerprint,
    e.reported_20261018_fingerprint,
    p.oid,
    n.nspname AS schema_name,
    p.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    l.lanname AS language,
    pg_catalog.pg_get_userbyid(p.proowner) AS owner,
    p.prosecdef AS security_definer,
    p.provolatile::text AS volatility,
    COALESCE(p.proconfig, ARRAY[]::text[]) AS settings,
    p.proacl::text AS acl,
    pg_catalog.md5(p.prosrc) AS body_fingerprint,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)) AS definition_fingerprint,
    pg_catalog.pg_get_functiondef(p.oid) AS definition
  FROM expected AS e
  LEFT JOIN pg_catalog.pg_proc AS p
    ON p.oid = pg_catalog.to_regprocedure(e.signature)
  LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
  LEFT JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
)
SELECT pg_catalog.jsonb_build_object(
  'project_ref_expected', 'msinksoilkluooxenecy',
  'status', CASE
    WHEN count(*) = 3
     AND pg_catalog.bool_and(oid IS NOT NULL)
     AND pg_catalog.bool_and(definition_fingerprint = reported_20261018_fingerprint)
      THEN 'CAPTURED_REPORTED_DRIFT'
    ELSE 'BLOCKED_DRIFT_CHANGED_OR_FUNCTION_MISSING'
  END,
  'functions', pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'signature', signature,
      'historical_fingerprint', historical_fingerprint,
      'reported_20261018_fingerprint', reported_20261018_fingerprint,
      'definition_fingerprint', definition_fingerprint,
      'body_fingerprint', body_fingerprint,
      'schema_name', schema_name,
      'function_name', function_name,
      'identity_arguments', identity_arguments,
      'result_type', result_type,
      'language', language,
      'owner', owner,
      'security_definer', security_definer,
      'volatility', volatility,
      'settings', settings,
      'acl', acl,
      'definition', definition
    ) ORDER BY signature
  )
) AS catalog_security_hardening_function_drift
FROM definitions;

ROLLBACK;
