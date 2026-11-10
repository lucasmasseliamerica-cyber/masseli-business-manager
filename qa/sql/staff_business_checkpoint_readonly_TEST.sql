-- REVIEW ONLY: bounded fixture/audit checkpoint, not the completed 13/13 postflight.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '20s';
SELECT jsonb_build_object(
 'observed_utc',pg_catalog.now(),
 'profiles',(SELECT jsonb_agg(jsonb_build_object(
   'id',u.id,'business_id',u.business_id,'name',u.name,'username',u.username,
   'employee_id',u.employee_id,'role',u.role,'active',u.active,
   'permission_overrides',u.permission_overrides,'updated_at',u.updated_at,
   'semantic_md5_excluding_updated_at',md5((to_jsonb(u)-'updated_at')::text)))
   FROM public.users u WHERE u.id IN (
   'f37e9907-47c4-48bf-94b7-9a6fa5de1f88'::uuid,'96042557-c717-4750-9dd1-88b36958c6d1'::uuid,
   '0e03a482-5b3c-4225-baf7-4ae1ab7e9e58'::uuid,'88eddcda-d8b5-4474-b5d7-19860dd97fba'::uuid)),
 'employees',(SELECT jsonb_agg(jsonb_build_object(
   'id',e.id,'business_id',e.business_id,'name',e.name,'job_title',e.job_title,
   'active',e.active,'location_id',e.location_id,'manager_id',e.manager_id,
   'notes',e.notes,'updated_at',e.updated_at,
   'semantic_md5_excluding_updated_at',md5((to_jsonb(e)-'updated_at')::text)))
   FROM public.employees e WHERE e.id IN (
   '09abb5af-1074-4a97-9391-19639ef67faf'::uuid,'7e2fbd68-117a-444e-9f7e-d4014b36ecbd'::uuid,
   '30000000-0000-4000-8000-000000000003'::uuid,'8bc7ab61-6c9e-4dd4-a19a-a504f57de002'::uuid)),
 'staff_audits',(SELECT COALESCE(jsonb_agg(x ORDER BY x.occurred_at,x.id),'[]'::jsonb) FROM (
   SELECT a.id,a.business_id,a.user_id,a.role_snapshot,a.action,a.details,a.occurred_at
   FROM public.audit_logs a
   WHERE a.business_id IN ('d627563b-2ce4-491d-8cf6-141ef28d0f63'::uuid,'3849b750-20f7-4929-8699-737a4e1983c8'::uuid)
   AND a.action='Staff User Updated'
   AND split_part(a.details,' · ',1) IN (
   'f37e9907-47c4-48bf-94b7-9a6fa5de1f88','96042557-c717-4750-9dd1-88b36958c6d1',
   '0e03a482-5b3c-4225-baf7-4ae1ab7e9e58','88eddcda-d8b5-4474-b5d7-19860dd97fba')
 ) x)
) AS staff_checkpoint;
ROLLBACK;
