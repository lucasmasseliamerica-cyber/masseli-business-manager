import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const path='qa/sql/security_catalog_export_readonly_TEST.sql';
const sql=readFileSync(path,'utf8');
const executable=sql.replace(/^\s*--.*$/gm,'');
const workflow=readFileSync('.github/workflows/nexalvo-test.yml','utf8');

test('catalog export is pinned to TEST instructions and a read-only transaction',()=>{
 assert.match(sql,/Supabase TEST msinksoilkluooxenecy/i);
 assert.match(sql,/BEGIN TRANSACTION READ ONLY;/i);
 assert.match(sql,/SET LOCAL statement_timeout = '30s';/i);
 assert.match(sql,/\bROLLBACK;/i);
 assert.doesNotMatch(executable,/(?:^|;)\s*(?:INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO)\b/im);
 assert.doesNotMatch(executable,/\bCOMMIT\b/i);
});

test('catalog export covers RLS, policies, effective grants, ACLs and defaults',()=>{
 for(const expected of [
  /relrowsecurity/i,/relforcerowsecurity/i,/pg_policies/i,
  /has_table_privilege/i,/has_function_privilege/i,/column_privileges/i,
  /schema_acl/i,/table_acl/i,/function_acl/i,/pg_default_acl/i,
 ])assert.match(sql,expected);
 assert.match(sql,/rolsuper/i);assert.match(sql,/rolbypassrls/i);
 assert.match(sql,/rolname IN \('anon', 'authenticated'\)/i);
});

test('catalog export captures complete function security context and overload identity',()=>{
 for(const expected of [
  /pg_get_function_identity_arguments/i,/pg_get_function_result/i,/pg_get_functiondef/i,
  /prosecdef AS security_definer/i,/proleakproof AS leakproof/i,
  /provolatile AS volatility/i,/proparallel AS parallel_safety/i,/proconfig AS settings/i,
  /pg_language/i,
 ])assert.match(sql,expected);
});

test('catalog export never reads business rows or runs in default CI',()=>{
 assert.doesNotMatch(executable,/FROM\s+public\./i);
 assert.doesNotMatch(executable,/JOIN\s+public\./i);
 assert.doesNotMatch(workflow,/security_catalog_export_readonly_TEST\.sql/i);
});
