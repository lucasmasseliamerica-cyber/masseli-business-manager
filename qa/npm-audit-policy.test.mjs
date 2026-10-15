import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAudit,KNOWN_BUILD_PACKAGES} from './npm-audit-policy.mjs';

const current=()=>({
 vulnerabilities:{
  braces:{severity:'high',via:[{source:1240992}]},chokidar:{severity:'high',via:['braces']},
  'fast-glob':{severity:'high',via:['micromatch']},micromatch:{severity:'high',via:['braces']},
  'postcss-nested':{severity:'moderate',via:['postcss-selector-parser']},
  'postcss-selector-parser':{severity:'moderate',via:[{source:1241232}]},
  tailwindcss:{severity:'high',via:['braces','postcss-selector-parser']},
 },
 metadata:{vulnerabilities:{info:0,low:0,moderate:2,high:5,critical:0,total:7}},
});

test('current seven build-only findings remain tracked without claiming they are fixed',()=>{
 const result=evaluateAudit(current());
 assert.equal(result.ok,true);assert.equal(result.counts.total,7);
 assert.deepEqual(result.names,[...KNOWN_BUILD_PACKAGES].sort());
 assert.deepEqual(result.advisorySources,[1240992,1241232]);
});

test('a fully resolved report passes and lowers the recorded ceiling',()=>{
 const result=evaluateAudit({vulnerabilities:{},metadata:{vulnerabilities:{total:0}}});
 assert.equal(result.ok,true);assert.equal(result.counts.total,0);
});

test('a newly vulnerable package fails the build policy',()=>{
 const report=current();report.vulnerabilities['new-package']={severity:'high',via:[{source:999001}]};
 report.metadata.vulnerabilities.high=6;report.metadata.vulnerabilities.total=8;
 const result=evaluateAudit(report);
 assert.equal(result.ok,false);assert.match(result.reasons.join('\n'),/unknown vulnerable packages/);
});

test('a new advisory against an existing package cannot hide behind the allowlist',()=>{
 const report=current();report.vulnerabilities.braces.via.push({source:999002});
 const result=evaluateAudit(report);
 assert.equal(result.ok,false);assert.match(result.reasons.join('\n'),/unknown advisory sources/);
});

test('critical severity always fails even for a known package',()=>{
 const report=current();report.metadata.vulnerabilities.critical=1;report.metadata.vulnerabilities.total=8;
 const result=evaluateAudit(report);
 assert.equal(result.ok,false);assert.match(result.reasons.join('\n'),/critical vulnerabilities present/);
});
