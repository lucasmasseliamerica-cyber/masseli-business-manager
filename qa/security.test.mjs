import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const workflowPath='.github/workflows/nexalvo-test.yml';
const workflow=readFileSync(workflowPath,'utf8');
const qaFiles=readdirSync('qa').filter(x=>/\.mjs$/.test(x) && x!=='security.test.mjs');
test('QA workflow is confined to isolated branch and TEST environment',()=>{
 assert.match(workflow,/branches:\s*\[automation\/nexalvo-qa-actions\]/);
 assert.match(workflow,/permissions:\s*\n\s*contents: read/);
 assert.match(workflow,/environment: nexalvo-test/);
 assert.match(workflow,/QA_SUPABASE_URL:\s*\$\{\{ vars\.QA_SUPABASE_URL \}\}/);
 assert.match(workflow,/QA_SUPABASE_ANON_KEY:\s*\$\{\{ secrets\.QA_SUPABASE_ANON_KEY \}\}/);
 assert.doesNotMatch(workflow,/\b(deploy|db push|migration up|service.role)\b/i);
});
test('authenticated TEST jobs are gated by the classified read-only preflight',()=>{
 assert.match(workflow,/authenticated-preflight:\s*\n\s*needs: test-api-smoke/);
 assert.match(workflow,/node qa\/p0-preflight-readonly\.TEST\.mjs/);
 assert.match(workflow,/PREFLIGHT_EXIT_CODE[\s\S]*Authenticated preflight: PASS[\s\S]*Authenticated preflight: FAIL[\s\S]*Authenticated preflight: BLOCKED/);
 for(const job of ['authenticated-concurrency','access-regression','auth-lifecycle','replay-financial','network-after-commit','browser-smoke','performance-read','two-tenant-concurrency']){
  assert.match(workflow,new RegExp('\\n  '+job+':\\n    needs: authenticated-preflight'),job);
 }
 assert.doesNotMatch(workflow,/node\s+qa\/p0-purchase-browser-persistent\.TEST\.mjs/);
});
test('all QA test scripts reject production host and privileged keys',()=>{
 for(const file of qaFiles){
  const body=readFileSync('qa/'+file,'utf8');
  assert.doesNotMatch(body,/ebhlfghbdfqgrgmtzpti|SUPABASE_SERVICE_ROLE|PROD_SUPABASE/i,file);
 }
 assert.doesNotMatch(workflow,/ebhlfghbdfqgrgmtzpti|SUPABASE_SERVICE_ROLE|PROD_SUPABASE/i);
});
test('concurrency scripts enforce exact TEST hostname before network access',()=>{
 for(const file of ['api-smoke.mjs','concurrency-readonly.test.mjs','anonymous-isolation.test.mjs','invalid-jwt.test.mjs','concurrency-authenticated.test.mjs','concurrency-two-tenants.test.mjs']){
  const body=readFileSync('qa/'+file,'utf8');
  assert.match(body,/msinksoilkluooxenecy/,file);
  assert.match(body,/\.hostname/,file);
 }
});

test('root App.jsx mirrors src/App.jsx to prevent deployment drift',()=>{
 const root=readFileSync('App.jsx','utf8');
 const src=readFileSync('src/App.jsx','utf8');
 assert.equal(root,src,'Keep both required frontend copies byte-for-byte identical');
});
test('frontend Supabase configuration is injected via Vite, not hard-coded',()=>{
 const body=readFileSync('src/App.jsx','utf8');
 assert.match(body,/import\.meta\.env\.VITE_SUPABASE_URL/);
 assert.match(body,/import\.meta\.env\.VITE_SUPABASE_ANON_KEY/);
 assert.doesNotMatch(body,/https:\/\/ebhlfghbdfqgrgmtzpti\.supabase\.co/);
});

test('purchase idempotency rollout remains opt-in until isolated TEST migration approved',()=>{
 const source=readFileSync('src/App.jsx','utf8');
 const migration=readFileSync('migrations/20261012_purchase_order_idempotency_TEST.sql','utf8');
 assert.match(source,/VITE_PURCHASE_IDEMPOTENCY_ENABLED\s*===\s*"true"/);
 assert.match(source,/fn_create_purchase_order_idempotent/);
 assert.match(source,/requestId:\s*requestIdRef\.current/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS public\.purchase_order_request_keys/);
 assert.match(migration,/PRIMARY KEY\(business_id,request_id\)/);
 assert.match(migration,/ON CONFLICT\(business_id,request_id\) DO NOTHING/);
 assert.match(migration,/FOR UPDATE/);
 assert.match(migration,/idempotency key reused with different payload/);
 assert.match(migration,/ENABLE ROW LEVEL SECURITY/);
 assert.match(migration,/REVOKE ALL ON public\.purchase_order_request_keys FROM PUBLIC,anon,authenticated/);
});
