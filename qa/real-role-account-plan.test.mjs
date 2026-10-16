import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const discovery=readFileSync('qa/sql/p0_01_real_roles_schema_readonly_TEST.sql','utf8');
const apply=readFileSync('qa/sql/p0_01_real_roles_app_apply_TEST.sql','utf8');
const compensate=readFileSync('qa/sql/p0_01_real_roles_app_compensate_TEST.sql','utf8');
const stripComments=value=>value.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');

test('schema discovery is transactionally read-only and covers deployed identity relationships',()=>{
 assert.match(discovery,/BEGIN TRANSACTION READ ONLY/i);assert.match(discovery,/ROLLBACK\s*;/i);
 for(const relation of ['public.users','public.employees','auth.users'])assert.match(discovery,new RegExp(relation.replace('.','\\.'),'i'));
 assert.match(discovery,/pg_constraint/i);assert.match(discovery,/pg_policies/i);
 assert.match(discovery,/role_table_grants/i);assert.match(discovery,/column_privileges/i);
 assert.match(discovery,/auth_identity_exists/i);assert.match(discovery,/reuse_classification/i);
 assert.match(discovery,/CONDITIONAL_LINK_ONLY_AFTER_DEPENDENCY_REVIEW/i);
 assert.doesNotMatch(discovery,/au\.email\s+AS/i);
});

test('application apply plan requires separate confirmed Auth identities and never mutates auth schema',()=>{
 assert.match(apply,/PREPARED, NOT EXECUTED/i);
 assert.match(apply,/00000000-0000-4000-8000-000000000501/);
 assert.match(apply,/00000000-0000-4000-8000-000000000502/);
 assert.match(apply,/Replace both distinct Auth UUID sentinels/i);
 assert.match(apply,/FROM auth\.users/i);assert.match(apply,/email_confirmed_at IS NULL OR deleted_at IS NOT NULL/i);
 assert.doesNotMatch(stripComments(apply),/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+auth\.users/i);
});

test('application fixtures are tenant-scoped, distinct, idempotent and audited',()=>{
 assert.match(apply,/d627563b-2ce4-491d-8cf6-141ef28d0f63/);
 assert.match(apply,/f37e9907-47c4-48bf-94b7-9a6fa5de1f88/);
 for(const id of ['8bc7ab61-6c9e-4dd4-a19a-a504f57de003','8bc7ab61-6c9e-4dd4-a19a-a504f57de004'])assert.match(apply,new RegExp(id));
 assert.match(apply,/manager_id IS DISTINCT FROM v_manager_employee_id/i);
 assert.match(apply,/ON CONFLICT \(id\) DO NOTHING/ig);
 assert.match(apply,/'MANAGER'/);assert.match(apply,/'EMPLOYEE'/);
 assert.match(apply,/permission_overrides[\s\S]*?'\{\}'::jsonb/i);
 assert.match(apply,/QA Role Fixtures Provisioned/i);assert.match(apply,/v_audit_rows <> 1/i);
});

test('compensation is exact, preserves Auth identities and refuses cascade broadening',()=>{
 assert.match(compensate,/Replace both exact Auth UUID sentinels/i);
 assert.match(compensate,/DELETE FROM public\.users/i);assert.match(compensate,/DELETE FROM public\.employees/i);
 assert.match(compensate,/qa_real_manager_20261015/i);assert.match(compensate,/qa_real_employee_20261015/i);
 assert.match(compensate,/QA Role Fixtures Removed/i);assert.match(compensate,/Auth identities retained/i);
 assert.doesNotMatch(stripComments(compensate),/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+auth\.users/i);
 assert.doesNotMatch(stripComments(compensate),/\bCASCADE\b/i);
});

test('no default or manual workflow executes role fixture SQL',()=>{
 const workflows=readFileSync('.github/workflows/nexalvo-test.yml','utf8')
  +readFileSync('.github/workflows/nexalvo-role-preflight.yml','utf8');
 assert.doesNotMatch(workflows,/p0_01_real_roles_(?:schema|app)/i);
});
