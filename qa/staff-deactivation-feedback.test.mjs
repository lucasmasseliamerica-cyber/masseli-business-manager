// Real modal handler extracted from JSX, with synthetic state/callbacks only.
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const modal=source.indexOf('function UserFormModal('),start=source.indexOf('const deactivate = async () => {',modal),end=source.indexOf('\n  return (',start);assert.ok(start>modal&&end>start);
function actual({setUsers=async()=>{},user={id:'synthetic-target',role:'EMPLOYEE',active:true},owners=1}={}){
 const state={error:'',closed:false,toasts:[],submitting:false,confirming:true};
 const context=vm.createContext({user,users:[user],otherOwnersActive:owners,protectedSelf:false,submitting:false,setUsers,setError:v=>{state.error=v;},setSubmitting:v=>{state.submitting=v;context.submitting=v;},setConfirmingDeactivate:v=>{state.confirming=v;},showToast:(...v)=>state.toasts.push(v),onClose:()=>{state.closed=true;}});
 vm.runInContext(source.slice(start,end)+';globalThis.deactivate=deactivate;',context);return{state,context,run:()=>context.deactivate()};
}
test('rejected deactivation stays open with visible failure instead of an unhandled rejection',async()=>{
 const modal=actual({setUsers:async()=>{throw new Error('synthetic operation rejected');}});
 await assert.doesNotReject(modal.run());assert.equal(modal.state.error,'synthetic operation rejected');assert.equal(modal.state.closed,false);assert.equal(modal.state.toasts.length,0);assert.equal(modal.state.submitting,false);
});

test('uncertain deactivation reports reconciliation without success or another call',async()=>{
 let calls=0;const modal=actual({setUsers:async()=>{calls++;const e=new Error('Reconcile before continuing');e.commitUncertain=true;throw e;}});
 await modal.run();assert.equal(calls,1);assert.match(modal.state.error,/Reconcile/);assert.equal(modal.state.toasts.length,0);assert.equal(modal.state.confirming,false);
});
for(const active of [true,false])test(`confirmed ${active?'deactivation':'reactivation'} changes only active state and closes`,async()=>{
 let submitted;const user={id:'synthetic-target',role:'EMPLOYEE',active},modal=actual({user,setUsers:async value=>{submitted=value;}});
 await modal.run();assert.equal(submitted[0].active,!active);assert.equal(user.active,active);assert.equal(modal.state.closed,true);assert.equal(modal.state.toasts.length,1);assert.equal(modal.state.submitting,false);
});
test('last active OWNER is still protected before the mutation',async()=>{
 let calls=0;const modal=actual({user:{id:'synthetic-owner',role:'OWNER',active:true},owners:0,setUsers:async()=>{calls++;}});
 await modal.run();assert.equal(calls,0);assert.equal(modal.state.toasts.length,1);assert.equal(modal.state.closed,false);
});
test('busy and protected self states never forward a deactivation',async()=>{
 for(const key of ['submitting','protectedSelf']){let calls=0;const modal=actual({setUsers:async()=>{calls++;}});modal.context[key]=true;await modal.run();assert.equal(calls,0);}
});
test('feedback is exposed as an accessible alert in the same staff modal',()=>{
 assert.match(source.slice(modal,source.indexOf('function AuditLogModal(',modal)),/error && <div role="alert"/);
});
