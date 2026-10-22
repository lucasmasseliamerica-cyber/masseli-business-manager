-- SELECT only. TEST msinksoilkluooxenecy; confirm connection externally before use.
WITH f AS (
 SELECT pg_catalog.to_regprocedure('public.fn_record_inventory_movement(uuid,uuid,uuid,text,numeric,numeric,uuid,uuid,uuid,text,boolean)') AS oid
), observed AS (
 SELECT pg_catalog.md5(pg_catalog.pg_get_functiondef(oid)) AS fingerprint,
   pg_catalog.has_function_privilege('anon',oid,'EXECUTE') AS anon_execute,
   pg_catalog.has_function_privilege('authenticated',oid,'EXECUTE') AS authenticated_execute FROM f
), data_quality AS (
 SELECT count(*) AS noncanonical_stock_positions FROM public.inventory_stock
 WHERE qty::text IN ('NaN','Infinity','-Infinity') OR qty IS NULL OR qty <> pg_catalog.round(qty,3)
)
SELECT jsonb_build_object('project_ref_expected','msinksoilkluooxenecy','mode','READ_ONLY',
 'observed',(SELECT to_jsonb(o) FROM observed o),'data_quality',(SELECT to_jsonb(d) FROM data_quality d),
 'status',CASE WHEN (SELECT anon_execute FROM observed) IS DISTINCT FROM false OR (SELECT authenticated_execute FROM observed) IS DISTINCT FROM false
    OR (SELECT noncanonical_stock_positions FROM data_quality)<>0 THEN 'BLOCKED_DRIFT_OR_DATA_QUALITY'
  WHEN (SELECT fingerprint FROM observed)='27bb16e1ab20acc78ef5bb2f25eb9c04' THEN 'ALREADY_APPLIED_DO_NOT_REAPPLY'
  WHEN (SELECT fingerprint FROM observed)='b5ac605f98d630ec318651bfb70eda63' AND (SELECT anon_execute FROM observed)=false
    AND (SELECT authenticated_execute FROM observed)=false AND (SELECT noncanonical_stock_positions FROM data_quality)=0
    THEN 'READY_FOR_REVIEW_NOT_AUTHORIZED' ELSE 'BLOCKED_DRIFT_OR_DATA_QUALITY' END,
 'note','No function invocation, migration, rollback, stock repair or authorization is performed'
) AS stock_quantity_precision_preflight;
