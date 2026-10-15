import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const apply=readFileSync('qa/sql/p0_01_employee_b_fixture_apply_TEST.sql','utf8');
const compensate=readFileSync('qa/sql/p0_01_employee_b_fixture_compensate_TEST.sql','utf8');
const compensateExecutable=compensate.replace(/^\s*--.*$/gm,'');
const workflow=readFileSync('.github/workflows/nexalvo-test.yml','utf8');
const fixtureId='8bc7ab61-6c9e-4dd4-a19a-a504f57de002';
const businessB='3849b750-20f7-4929-8699-737a4e1983c8';
const ownerB='88eddcda-d8b5-4474-b5d7-19860dd97fba';

test('employee B apply plan is TEST-only, guarded, idempotent and audited',()=>{
 assert.match(apply,/Supabase TEST msinksoilkluooxenecy only/i);
 assert.match(apply,/PREPARED, NOT EXECUTED/i);
 for(const value of [fixtureId,businessB,ownerB])assert.match(apply,new RegExp(value));
 assert.match(apply,/name = 'ZZ_QA_PLATFORM_20261009_AUTO'/i);
 assert.match(apply,/role = 'OWNER' AND active = true/i);
 assert.match(apply,/ON CONFLICT \(id\) DO NOTHING/i);
 assert.match(apply,/QA Fixture Provisioned/i);
 assert.match(apply,/GET DIAGNOSTICS v_audit_rows = ROW_COUNT[\s\S]*?v_audit_rows <> 1/i);
 assert.match(apply,/\bCOMMIT;/i);
});

test('employee B apply plan proves positive B access and negative A isolation',()=>{
 assert.match(apply,/SET LOCAL ROLE authenticated/i);
 assert.match(apply,/FROM public\.fn_read_employees_secure\(\)[\s\S]*?id = '8bc7ab61-6c9e-4dd4-a19a-a504f57de002'/i);
 assert.match(apply,/FROM public\.employees[\s\S]*?id = '8bc7ab61-6c9e-4dd4-a19a-a504f57de002'/i);
 assert.match(apply,/OWNER B cannot read the fixture through fn_read_employees_secure/i);
 assert.match(apply,/OWNER B cannot read the fixture through direct SELECT/i);
 assert.match(apply,/OWNER A can read the dedicated employee B fixture/i);
});

test('employee B compensation is exact, audited and refuses destructive broadening',()=>{
 for(const value of [fixtureId,businessB,ownerB])assert.match(compensate,new RegExp(value));
 assert.match(compensate,/DELETE FROM public\.employees[\s\S]*?id = v_employee_id[\s\S]*?business_id = v_business_id[\s\S]*?notes = v_tag/i);
 assert.match(compensate,/Compensation refused: fixture identity does not match/i);
 assert.match(compensate,/QA Fixture Removed/i);
 assert.match(compensate,/v_deleted > 1/i);
 assert.match(compensate,/Compensated employee B fixture remains visible/i);
 assert.doesNotMatch(compensateExecutable,/\bCASCADE\b/i);
 assert.doesNotMatch(compensateExecutable,/TRUNCATE|DROP\s+TABLE/i);
 assert.match(compensate,/\bCOMMIT;/i);
});

test('default CI neither provisions nor compensates the persistent fixture',()=>{
 assert.doesNotMatch(workflow,/p0_01_employee_b_fixture_(?:apply|compensate)_TEST\.sql/i);
 assert.doesNotMatch(workflow,/QA_P005_PERSISTENT_E2E_ENABLED\s*:\s*true/i);
});
