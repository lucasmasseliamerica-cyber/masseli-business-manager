import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAudit,KNOWN_BUILD_PACKAGES} from './npm-audit-policy.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

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

test('registry reclassification to three known build-only moderate findings passes without broadening advisory allowlist',()=>{
 const report=current();
 for(const name of ['braces','chokidar','fast-glob','micromatch'])delete report.vulnerabilities[name];
 report.vulnerabilities.tailwindcss.severity='moderate';
 report.metadata.vulnerabilities={info:0,low:0,moderate:3,high:0,critical:0,total:3};
 const result=evaluateAudit(report);
 assert.equal(result.ok,true);
 assert.equal(result.counts.total,3);
 assert.deepEqual(result.advisorySources,[1241232]);
});

test('four known moderate build findings exceed the bounded baseline',()=>{
 const report=current();
 for(const name of ['chokidar','fast-glob','micromatch'])delete report.vulnerabilities[name];
 for(const row of Object.values(report.vulnerabilities))row.severity='moderate';
 report.metadata.vulnerabilities={info:0,low:0,moderate:4,high:0,critical:0,total:4};
 const result=evaluateAudit(report);
 assert.equal(result.ok,false);
 assert.match(result.reasons.join('\\n'),/ceiling exceeded/);
});

test('a fully resolved report passes and lowers the recorded ceiling',()=>{
 const result=evaluateAudit({vulnerabilities:{},metadata:{vulnerabilities:{critical:0,high:0,moderate:0,low:0,info:0,total:0}}});
 assert.equal(result.ok,true);assert.equal(result.counts.total,0);
});

test('upstream downgrade to three known moderate build findings is allowed without accepting new packages or advisories',()=>{
 const report=current();
 for(const name of ['braces','chokidar','fast-glob','micromatch'])delete report.vulnerabilities[name];
 report.vulnerabilities.tailwindcss={severity:'moderate',via:['postcss-nested','postcss-selector-parser']};
 report.metadata.vulnerabilities={info:0,low:0,moderate:3,high:0,critical:0,total:3};
 const result=evaluateAudit(report);
 assert.equal(result.ok,true);assert.deepEqual(result.advisorySources,[1241232]);
 assert.deepEqual(result.names,['postcss-nested','postcss-selector-parser','tailwindcss']);
 assert.equal(result.counts.total,3);
});

test('a formerly moderate package cannot increase severity behind lower aggregate totals',()=>{
 const report=current();
 report.vulnerabilities={'postcss-selector-parser':{severity:'high',via:[{source:1241232}]}};
 report.metadata.vulnerabilities={info:0,low:0,moderate:0,high:1,critical:0,total:1};
 const result=evaluateAudit(report);
 assert.equal(result.ok,false);assert.match(result.reasons.join('\n'),/package severity ceiling exceeded/);
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

test('registry errors missing schema and nonnumeric counts cannot become a zero-vulnerability PASS',()=>{
 for(const report of [null,{},[],{message:'SYNTHETIC_REGISTRY_ERROR',error:{}},{...current(),error:null},
  {vulnerabilities:{},metadata:{vulnerabilities:{total:0}}},
  {...current(),vulnerabilities:{braces:{severity:'high',via:{source:1240992}}}},
  {...current(),vulnerabilities:{braces:{severity:'high',via:[{url:'SYNTHETIC_MISSING_SOURCE'}]}}},
  {...current(),metadata:{vulnerabilities:{...current().metadata.vulnerabilities,total:'7'}}}]){
  const result=evaluateAudit(report);assert.equal(result.ok,false);assert.equal(result.complete,false);assert.equal(result.counts,null);
 }
});
test('inconsistent totals or severity rows are incomplete audit evidence even within the known ceiling',()=>{
 for(const change of [x=>x.metadata.vulnerabilities.total=0,x=>x.metadata.vulnerabilities.high=4,
  x=>delete x.vulnerabilities.braces,x=>x.vulnerabilities.braces.severity='unknown']){
  const report=current();change(report);const result=evaluateAudit(report);
  assert.equal(result.ok,false);assert.equal(result.complete,false);
 }
});
test('audit CLI classifies service and JSON failures as BLOCKED without leaking error text or claiming zero alerts',()=>{
 const dir=mkdtempSync(join(tmpdir(),'nexalvo-audit-policy-')),file=join(dir,'audit.json');
 try{
  for(const content of [JSON.stringify({message:'Bearer SYNTHETIC_PRIVATE_VALUE',error:'private@example.invalid'}),'INVALID_JSON']){
   writeFileSync(file,content);
   const r=spawnSync(process.execPath,['qa/npm-audit-policy.mjs',file],{encoding:'utf8'});
   assert.equal(r.status,2);assert.match(r.stderr,/BLOCKED/);
   assert.doesNotMatch(r.stdout+r.stderr,/SYNTHETIC_PRIVATE_VALUE|@|Bearer|total=0|SyntaxError/);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
