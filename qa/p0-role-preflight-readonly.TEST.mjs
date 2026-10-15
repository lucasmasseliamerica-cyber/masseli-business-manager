// Fail-closed real-role preflight. Password login plus read-only business checks only.
const PROJECT_REF='msinksoilkluooxenecy';
const TEST_HOST=PROJECT_REF+'.supabase.co';
const BUSINESS_A='d627563b-2ce4-491d-8cf6-141ef28d0f63';
const BUSINESS_B='3849b750-20f7-4929-8699-737a4e1983c8';
const PRODUCT_A='9efafd84-7f17-4de9-9c9a-1b962ab3e0bc';
const PRODUCT_B='a4cac86d-038d-418e-b953-9a3605f2df18';
const BINDINGS=[
 'QA_SUPABASE_URL','QA_SUPABASE_ANON_KEY',
 'QA_ROLE_MANAGER_EMAIL','QA_ROLE_MANAGER_PASSWORD',
 'QA_ROLE_EMPLOYEE_EMAIL','QA_ROLE_EMPLOYEE_PASSWORD',
];
const actors=[{label:'MANAGER',role:'MANAGER'},{label:'EMPLOYEE',role:'EMPLOYEE'}];

class Signal extends Error{
 constructor(kind,code,detail=''){super(detail);this.kind=kind;this.code=code;this.exitCode=kind==='BLOCKED'?2:1;}
}
const blocked=(code,detail='')=>{throw new Signal('BLOCKED',code,detail);};
const failed=(code,detail='')=>{throw new Signal('FAIL',code,detail);};
const fixture=(condition,code)=>{if(!condition)blocked(code);};
const verify=(condition,code)=>{if(!condition)failed(code);};

function isPublicTestKey(value){
 if(/^sb_publishable_[a-z0-9_-]+$/i.test(value))return true;
 const parts=value.split('.');if(parts.length!==3)return false;
 try{
  const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());
  return claims?.role==='anon'&&claims?.ref===PROJECT_REF;
 }catch{return false;}
}

async function main(){
 const missing=BINDINGS.filter(name=>!process.env[name]);
 if(missing.length)blocked('CONFIG_MISSING','configure '+missing.join(', '));
 const rawUrl=String(process.env.QA_SUPABASE_URL||'').trim();let base;
 try{base=new URL(rawUrl);}catch{blocked('TARGET_CONFIG_INVALID');}
 if(base.protocol!=='https:'||base.hostname!==TEST_HOST||base.port||base.pathname!=='/'
   ||base.username||base.password||base.search||base.hash||rawUrl.includes('?')||rawUrl.includes('#')){
  blocked('TARGET_CONFIG_INVALID');
 }
 const key=String(process.env.QA_SUPABASE_ANON_KEY||'').trim();
 if(!isPublicTestKey(key))blocked('PUBLIC_KEY_INVALID');

 async function request(path,token,body,stage){
  let response;
  try{
   response=await fetch(new URL(path,base),{
    method:body===undefined?'GET':'POST',
    headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(20000),
   });
  }catch{blocked('NETWORK_'+stage);}
  let value=null;try{value=await response.json();}catch{}
  return {status:response.status,value};
 }

 try{
  for(const actor of actors){
   const login=await request('/auth/v1/token?grant_type=password',null,{
    email:process.env['QA_ROLE_'+actor.label+'_EMAIL'],password:process.env['QA_ROLE_'+actor.label+'_PASSWORD'],
   },'LOGIN_'+actor.label);
   if([400,401,403,422].includes(login.status))blocked('AUTH_REJECTED_'+actor.label,'HTTP '+login.status);
   if(login.status===429||login.status>=500)blocked('SERVICE_UNAVAILABLE_LOGIN_'+actor.label,'HTTP '+login.status);
   verify(login.status===200,'AUTH_ENDPOINT_'+actor.label);
   fixture(typeof login.value?.access_token==='string'&&login.value.access_token.length>0,'AUTH_TOKEN_MISSING_'+actor.label);
   actor.token=login.value.access_token;

   const identity=await request('/auth/v1/user',actor.token,undefined,'IDENTITY_'+actor.label);
   if(identity.status===401)blocked('SESSION_REJECTED_'+actor.label,'HTTP 401');
   verify(identity.status===200&&typeof identity.value?.id==='string','IDENTITY_'+actor.label);
   actor.id=identity.value.id;
   const profile=await request('/rest/v1/users?select=id,business_id,employee_id,role,active,permission_overrides&id=eq.'+actor.id,
    actor.token,undefined,'PROFILE_'+actor.label);
   verify(profile.status===200,'PROFILE_ENDPOINT_'+actor.label);
   fixture(Array.isArray(profile.value)&&profile.value.length===1,'PROFILE_FIXTURE_'+actor.label);
   const row=profile.value[0];
   fixture(row.id===actor.id&&row.business_id===BUSINESS_A&&row.role===actor.role&&row.active===true,
    'PROFILE_BINDING_'+actor.label);
   fixture(typeof row.employee_id==='string'&&row.employee_id.length>0,'EMPLOYEE_LINK_'+actor.label);
   actor.employee=row.employee_id;

   const tenant=await request('/rest/v1/rpc/current_business_id',actor.token,undefined,'TENANT_'+actor.label);
   verify(tenant.status===200&&tenant.value===BUSINESS_A,'TENANT_CONTEXT_'+actor.label);
   const ownProduct=await request('/rest/v1/products?select=id,business_id,active&id=eq.'+PRODUCT_A,
    actor.token,undefined,'PRODUCT_OWN_'+actor.label);
   fixture(ownProduct.status===200&&Array.isArray(ownProduct.value)&&ownProduct.value.length===1
    &&ownProduct.value[0].business_id===BUSINESS_A&&ownProduct.value[0].active===true,'PRODUCT_FIXTURE_'+actor.label);
   const foreignProduct=await request('/rest/v1/products?select=id,business_id&id=eq.'+PRODUCT_B,
    actor.token,undefined,'PRODUCT_FOREIGN_'+actor.label);
   verify(foreignProduct.status===200&&Array.isArray(foreignProduct.value)&&foreignProduct.value.length===0,
    'ISOLATION_PRODUCT_'+actor.label);
   const ownEmployee=await request('/rest/v1/rpc/fn_read_employees_secure?select=id,business_id,hourly_rate&id=eq.'+actor.employee,
    actor.token,undefined,'EMPLOYEE_SELF_'+actor.label);
   fixture(ownEmployee.status===200&&Array.isArray(ownEmployee.value)&&ownEmployee.value.length===1
    &&ownEmployee.value[0].business_id===BUSINESS_A,'EMPLOYEE_FIXTURE_'+actor.label);
   actor.employeeRow=ownEmployee.value[0];
   const foreignEmployees=await request('/rest/v1/rpc/fn_read_employees_secure?select=id,business_id&business_id=eq.'+BUSINESS_B,
    actor.token,undefined,'EMPLOYEE_FOREIGN_'+actor.label);
   verify(foreignEmployees.status===200&&Array.isArray(foreignEmployees.value)&&foreignEmployees.value.length===0,
    'ISOLATION_EMPLOYEES_'+actor.label);
   const ownExport=await request('/rest/v1/rpc/fn_export_business_data',actor.token,{p_business_id:BUSINESS_A},
    'EXPORT_'+actor.label);
   verify([400,401,403].includes(ownExport.status),'OWNER_ONLY_EXPORT_'+actor.label);
   console.log('PASS: '+actor.label+' identity, active role, linked employee and tenant isolation');
  }

  verify(actors[0].id!==actors[1].id&&actors[0].employee!==actors[1].employee,'INDEPENDENT_ROLE_IDENTITIES');
  const [manager,employee]=actors;
  fixture(Number.isFinite(Number(manager.employeeRow.hourly_rate)),'MANAGER_FINANCIAL_FIXTURE');
  const managerCash=await request('/rest/v1/cash_flow?select=id,business_id&business_id=eq.'+BUSINESS_A+'&limit=1',
   manager.token,undefined,'MANAGER_FINANCIAL');
  fixture(managerCash.status===200&&Array.isArray(managerCash.value)&&managerCash.value.length===1,
   'MANAGER_FINANCIAL_FIXTURE');
  const cashId=managerCash.value[0].id;
  const employeeCash=await request('/rest/v1/cash_flow?select=id,business_id&id=eq.'+cashId,
   employee.token,undefined,'EMPLOYEE_FINANCIAL');
  verify(employeeCash.status===200&&Array.isArray(employeeCash.value)&&employeeCash.value.length===0,
   'EMPLOYEE_FINANCIAL_EXPOSURE');
  const managerPayForEmployee=await request('/rest/v1/rpc/fn_read_employees_secure?select=id,hourly_rate&id=eq.'+manager.employee,
   employee.token,undefined,'EMPLOYEE_MANAGER_PAY');
  verify(managerPayForEmployee.status===200&&Array.isArray(managerPayForEmployee.value)
   &&(managerPayForEmployee.value.length===0||managerPayForEmployee.value.every(row=>row.hourly_rate===null)),
   'EMPLOYEE_SALARY_EXPOSURE');
  console.log('ROLE PREFLIGHT PASS [OK]: MANAGER/EMPLOYEE read-only identity, isolation and sensitive-data checks complete.');
 }finally{
  for(const actor of actors){delete actor.token;delete actor.id;delete actor.employee;delete actor.employeeRow;}
 }
}

try{await main();}catch(error){
 const signal=error instanceof Signal?error:new Signal('FAIL','UNEXPECTED_CHECK_FAILURE');
 const detail=signal.message?': '+signal.message:'';
 console.error('ROLE PREFLIGHT '+signal.kind+' ['+signal.code+']'+detail+'. No credentials or payloads logged.');
 process.exitCode=signal.exitCode;
}
