// Actual frontend functions, synthetic fetch/session storage only. No browser or network session.
import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
const target='22222222-2222-4222-8222-222222222222';
const business='33333333-3333-4333-8333-333333333333';
const section=(a,b)=>{const at=source.indexOf(a),end=source.indexOf(b,at);assert.ok(at>=0&&end>at);return source.slice(at,end);};
const code=section('const STAFF_WRITE_PENDING_KEY =','function platformAdminFailureMessage');
const payload={operation:'update',user_id:target,name:'Synthetic Staff',username:'synthetic',role:'EMPLOYEE',employee_id:null,active:true,permission_overrides:{}};
const confirmed=()=>({ok:true,status:200,json:async()=>({ok:true,user:{id:target,business_id:business,name:payload.name,username:payload.username,role:payload.role,employee_id:null,active:true,permission_overrides:{}}})});
function browser(fetch,storage=new Map()){
 const context=vm.createContext({window:{sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}},supabaseAuth:{restoreSession:async()=>({accessToken:'synthetic-session'})},SUPABASE_URL:'https://staff-lab.invalid',SUPABASE_ANON_KEY:'synthetic-public',fetch});
 vm.runInContext(code+';globalThis.invoke=callSupabaseFunction;',context);return{context,storage,invoke:(p=payload)=>context.invoke('manage-staff-user',p,business)};
}
for(const [name,response]of[
 ['transport loss',()=>{throw new TypeError('response lost');}],
 ['gateway',()=>({ok:false,status:504,json:async()=>({error:'gateway'})})],
 ['truncated success',()=>({ok:true,status:200,json:async()=>{throw new SyntaxError('truncated');}})],
 ['missing success receipt',()=>({ok:true,status:200,json:async()=>({ok:true})})],
 ['incomplete identified receipt',()=>({ok:true,status:200,json:async()=>({ok:true,user:{id:target}})})],
 ['wrong company receipt',()=>{const r=confirmed();r.json=async()=>({ok:true,user:{id:target,business_id:target,...payload}});return r;}],
 ['contradictory success',()=>({ok:true,status:200,json:async()=>({ok:true,user:{id:target},reconciliation_required:true,retry_allowed:false})})],
 ['wrong success identity',()=>({ok:true,status:200,json:async()=>({ok:true,user:{id:'11111111-1111-4111-8111-111111111111'}})})],
 ['reconciliation diagnostic',()=>({ok:false,status:503,json:async()=>({ok:false,code:'STAFF_INVITE_PROFILE_REJECTED',reconciliation_required:true,retry_allowed:false})})],
])test(`staff ${name} blocks repeat and reload without forwarding again`,async()=>{
 let calls=0;const transport=async()=>{calls++;return response();},page=browser(transport);
 await assert.rejects(page.invoke(),e=>e.commitUncertain===true&&e.retrySafe===false);
 await assert.rejects(page.invoke(),e=>e.commitUncertain===true);
 const reloaded=browser(transport,page.storage);await assert.rejects(reloaded.invoke(),e=>e.commitUncertain===true);
 assert.equal(calls,1);assert.deepEqual([...page.storage.values()],['pending']);
});
test('staff rejection before mutation releases the latch for a corrected request',async()=>{
 let calls=0;const page=browser(async()=>{calls++;return{ok:false,status:400,json:async()=>({ok:false,error:'Invalid request',code:'INVALID_REQUEST'})};});
 for(let i=0;i<2;i++)await assert.rejects(page.invoke(),e=>!e.commitUncertain);
 assert.equal(calls,2);assert.equal(page.storage.size,0);
});
test('an invite response cannot reuse an update-only rejection as permission to retry',async()=>{
 let calls=0;const page=browser(async()=>{calls++;return{ok:false,status:409,json:async()=>({ok:false,code:'PROFILE_OPERATION_REJECTED'})};});
 const invite={operation:'invite'};await assert.rejects(page.invoke(invite),e=>e.commitUncertain===true);await assert.rejects(page.invoke(invite));assert.equal(calls,1);
});
test('confirmed staff receipt releases the latch; unrelated Edge reads remain unchanged',async()=>{
 let calls=0;const page=browser(async()=>{calls++;return confirmed();});
 assert.equal((await page.invoke()).user.id,target);assert.equal(page.storage.size,0);
 assert.equal((await page.context.invoke('platform-admin',{operation:'list_businesses'})).user.id,target);
 assert.equal(calls,2);
});
test('blocked persistence prevents any dispatch',async()=>{
 let calls=0;const page=browser(async()=>{calls++;return confirmed();});
 page.context.window.sessionStorage.setItem=()=>{throw new Error('synthetic storage failure');};
 await assert.rejects(page.invoke(),e=>e.commitUncertain===true);
 page.context.window.sessionStorage.setItem=(k,v)=>page.storage.set(k,v);
 await assert.rejects(page.invoke(),e=>e.commitUncertain===true);assert.equal(calls,0);
});
test('missing expected staff company prevents forwarding before any pending reservation',async()=>{
 let calls=0;const page=browser(async()=>{calls++;return confirmed();});
 await assert.rejects(page.context.invoke('manage-staff-user',payload),e=>e.commitUncertain===true);
 assert.equal(calls,0);assert.equal(page.storage.size,0);
});
test('concurrent submissions cannot cross the same-tab pending boundary',async()=>{
 let release,calls=0;const waiting=new Promise(r=>{release=r;});const page=browser(async()=>{calls++;await waiting;return confirmed();});
 const first=page.invoke();await new Promise(r=>setTimeout(r,0));await assert.rejects(page.invoke(),e=>e.commitUncertain===true);release();await first;assert.equal(calls,1);
});
test('confirmed invite is not reclassified as failure when refreshing the user list fails',async()=>{
 let writes=0,reports=0;const context=vm.createContext({useState:()=>[[],()=>{}],useCallback:f=>f,useEffect:()=>{},supabaseAuth:{hasSession:()=>true},supabaseRest:{select:async()=>{throw new Error('synthetic read failure');}},callSupabaseFunction:async()=>{writes++;return{ok:true,user:{id:target}};},window:{location:{origin:'https://qa.example.test'}}});
 vm.runInContext(section('function useSupabaseUsers(','const PLATFORM_ADMIN_ROLE')+';globalThis.hook=useSupabaseUsers;',context);
 const hook=context.hook('synthetic-business',()=>{reports++;},()=>{});
 assert.equal((await hook[3]({email:'synthetic@example.test',role:'EMPLOYEE',active:true})).id,target);
 assert.equal(writes,1);assert.equal(reports,1);
});
