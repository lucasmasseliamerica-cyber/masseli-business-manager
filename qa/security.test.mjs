import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('TEST-only workflow has no production credentials or deploy permissions', () => {
 const workflow=readFileSync('.github/workflows/nexalvo-test.yml','utf8');
 assert.match(workflow,/permissions:\s*\n\s*contents: read/);
 assert.match(workflow,/environment: nexalvo-test/);
 assert.doesNotMatch(workflow,/SUPABASE_SERVICE_ROLE|PROD_SUPABASE|vercel deploy|supabase db push/i);
});
test('production project is not referenced in QA files', () => {
 for(const path of ['qa/api-smoke.mjs','.github/workflows/nexalvo-test.yml']) {
  assert.doesNotMatch(readFileSync(path,'utf8'),/ebhlfghbdfqgrgmtzpti/);
 }
});
