// Adversarial review probes. Mocks only; passing tests can document a known limitation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createC2Guard } from './stock-c2-browser.mjs';
import { fixture, commitLoss } from './stock-c2-test-support.mjs';
import { recoveryC2, wastePayload } from './stock-c2-protocol.mjs';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('REVIEW F01: current browser guard admits unreviewed TEST GET Edge path (execution blocker)',async()=>{
  let continued=0,forwarded=0;
  const guard=createC2Guard({state:{},save:()=>assert.fail(),gate:()=>assert.fail(),view:()=>assert.fail(),token:'SYNTHETIC',report:{},onFailure:()=>assert.fail()});
  await guard({request:()=>({url:()=> 'https://msinksoilkluooxenecy.supabase.co/functions/v1/SYNTHETIC_UNREVIEWED',method:()=> 'GET'}),continue:async()=>{continued++;},fetch:async()=>{forwarded++;}});
  assert.equal(continued,1);assert.equal(forwarded,0); // no real request was issued
});
test('REVIEW F02: HTTP timeout is a fixed 20s and does not receive a remaining-window deadline',async()=>{
  const state={phase:'RESERVED',baseline:fixture(),startedAt:0},v=structuredClone(state.baseline);let timeout;
  const guard=createC2Guard({state,save:()=>{},gate:()=>{},view:async()=>structuredClone(v),token:'SYNTHETIC',report:{stock_requests_forwarded:0},onFailure:()=>{}});
  await guard({request:()=>({url:()=> 'https://msinksoilkluooxenecy.supabase.co/rest/v1/rpc/fn_record_waste',method:()=> 'POST',headers:()=>({authorization:'Bearer SYNTHETIC'}),postDataJSON:wastePayload}),fetch:async opts=>{timeout=opts.timeout;throw Error('SYNTHETIC_TIMEOUT');},abort:async()=>{}});
  assert.equal(timeout,20000);assert.equal(state.phase,'LOSS_INTENT');
});
test('REVIEW partial loss without audit remains observation only and retains intent',()=>{
  const b=fixture(),v=structuredClone(b);commitLoss(v);const state={baseline:b,phase:'LOSS_INTENT',startedAt:0};
  const before=JSON.stringify(state),result=recoveryC2(state,v);assert.equal(result.audit_rows,0);assert.equal(result.resume_allowed,false);assert.equal(result.full_homologation,false);assert.equal(JSON.stringify(state),before);
});
test('REVIEW F03: journal checksum binds parsed content, not raw JSON bytes',()=>{
  const root=mkdtempSync(join(tmpdir(),'nexalvo-c2-review-private-'));
  try{
    const script=`import{openC2Store,c2Directory}from'./qa/stock-c2-store.mjs';import{fixture}from'./qa/stock-c2-test-support.mjs';import{readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import assert from'node:assert/strict';const s=openC2Store();s.reserve({phase:'RESERVED',baseline:fixture(),sourceSha:'a'.repeat(40),reviewHash:'b'.repeat(64),window:{at:0,until:1},startedAt:0});const p=join(c2Directory(),'0.json'),before=readFileSync(p,'utf8');writeFileSync(p,JSON.stringify(JSON.parse(before),null,2));assert.notEqual(readFileSync(p,'utf8'),before);s.assertCurrent();console.log('PARSED_CONTENT_INTEGRITY_ONLY_CONFIRMED');`;
    const result=execFileSync(process.execPath,['--input-type=module','-'],{input:script,env:{...process.env,TEMP:root,TMP:root,TMPDIR:root},encoding:'utf8',stdio:['pipe','pipe','pipe']});assert.match(result,/PARSED_CONTENT_INTEGRITY_ONLY_CONFIRMED/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
