import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const expenseMigration=readFileSync('migrations/20261015_expense_idempotency_TEST.sql','utf8');
const expenseProof=readFileSync('qa/sql/p0_03_expense_idempotency_rollback_TEST.sql','utf8');
const cashMigration=readFileSync('migrations/20261015_cash_register_finite_guard_TEST.sql','utf8');
const cashProof=readFileSync('qa/sql/p0_03_cash_register_finite_rollback_TEST.sql','utf8');
const workflow=readFileSync('.github/workflows/nexalvo-test.yml','utf8');

function functionBody(sql,name){
 const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${escaped}\\([\\s\\S]*?AS \\$function\\$([\\s\\S]*?)\\$function\\$;`,'i'))?.[1]||'';
}
const expenseBody=functionBody(expenseMigration,'fn_create_expense_idempotent');
const cashBody=functionBody(cashMigration,'fn_open_cash_register');

test('prepared expense idempotency migration keeps its key table private and tenant-scoped',()=>{
 assert.match(expenseMigration,/PREPARED, NOT EXECUTED/i);
 assert.match(expenseMigration,/Supabase TEST msinksoilkluooxenecy only/i);
 assert.match(expenseMigration,/CREATE TABLE IF NOT EXISTS public\.expense_request_keys/i);
 assert.match(expenseMigration,/PRIMARY KEY \(business_id, request_id\)/i);
 assert.match(expenseMigration,/expense_id uuid REFERENCES public\.expenses\(id\)/i);
 assert.match(expenseMigration,/ENABLE ROW LEVEL SECURITY/i);
 assert.match(expenseMigration,/REVOKE ALL ON TABLE public\.expense_request_keys FROM PUBLIC, anon, authenticated/i);
 assert.doesNotMatch(expenseMigration,/CREATE POLICY|GRANT (?:SELECT|INSERT|UPDATE|DELETE).*expense_request_keys/i);
});

test('expense idempotency wrapper authorizes before reserving a key',()=>{
 assert.match(expenseMigration,/SECURITY DEFINER\s+SET search_path TO ''/i);
 assert.match(expenseBody,/IF auth\.uid\(\) IS NULL/i);
 assert.match(expenseBody,/IF p_request_id IS NULL/i);
 assert.match(expenseBody,/p_business_id IS DISTINCT FROM public\.current_business_id\(\)/i);
 assert.match(expenseBody,/public\.user_can\('manageExpenses'\) IS NOT TRUE/i);
 const auth=expenseBody.search(/auth\.uid\(\) IS NULL/i);
 const tenant=expenseBody.search(/p_business_id IS DISTINCT FROM public\.current_business_id/i);
 const permission=expenseBody.search(/public\.user_can\('manageExpenses'\) IS NOT TRUE/i);
 const firstMutation=expenseBody.search(/\bINSERT INTO\b/i);
 assert.ok(auth>=0&&auth<firstMutation);
 assert.ok(tenant>=0&&tenant<firstMutation);
 assert.ok(permission>=0&&permission<firstMutation);
});

test('expense replay serializes one full-payload key and returns one tenant-owned expense',()=>{
 assert.match(expenseBody,/v_payload := pg_catalog\.jsonb_build_object\([\s\S]*?'business_id'[\s\S]*?'notes'/i);
 assert.doesNotMatch(expenseBody,/\bmd5\s*\(/i);
 assert.match(expenseBody,/ON CONFLICT \(business_id, request_id\) DO NOTHING/i);
 assert.match(expenseBody,/WHERE business_id = p_business_id AND request_id = p_request_id[\s\S]*?FOR UPDATE/i);
 assert.match(expenseBody,/v_key\.request_payload IS DISTINCT FROM v_payload/i);
 assert.match(expenseBody,/WHERE id = v_key\.expense_id AND business_id = p_business_id/i);
 assert.match(expenseBody,/v_expense := public\.fn_create_expense\(/i);
 assert.match(expenseBody,/SET expense_id = v_expense\.id[\s\S]*?WHERE business_id = p_business_id AND request_id = p_request_id/i);
 assert.match(expenseMigration,/REVOKE ALL ON FUNCTION public\.fn_create_expense_idempotent[\s\S]*FROM PUBLIC, anon/i);
 assert.match(expenseMigration,/GRANT EXECUTE ON FUNCTION public\.fn_create_expense_idempotent[\s\S]*TO authenticated/i);
 assert.doesNotMatch(expenseMigration,/TO authenticated\s*,\s*service_role/i);
});

test('expense rollback proof covers exact replay, changed payload, tenant denial and residue',()=>{
 assert.match(expenseProof,/presence does not claim database execution or approval/i);
 assert.match(expenseProof,/SET LOCAL ROLE authenticated/i);
 assert.match(expenseProof,/fn_create_expense_idempotent\([\s\S]*?v_request_id[\s\S]*?fn_create_expense_idempotent\([\s\S]*?v_request_id/i);
 assert.match(expenseProof,/v_replay\.id IS DISTINCT FROM v_first\.id/i);
 assert.match(expenseProof,/Exact replay created % expense rows instead of one/i);
 assert.match(expenseProof,/Exact replay created % expense ledger rows instead of one/i);
 assert.match(expenseProof,/idempotency key reused with different payload/i);
 assert.match(expenseProof,/business_id mismatch/i);
 assert.match(expenseProof,/Rejected cross-tenant replay left business rows/i);
 assert.match(expenseProof,/\bROLLBACK;/i);
 assert.doesNotMatch(expenseProof,/\bCOMMIT;/i);
});

test('prepared cash-open migration rejects special numeric values before locking or mutation',()=>{
 assert.match(cashMigration,/PREPARED, NOT EXECUTED/i);
 assert.match(cashMigration,/SECURITY DEFINER\s+SET search_path TO ''/i);
 assert.match(cashBody,/p_business_id IS DISTINCT FROM public\.current_business_id\(\)/i);
 assert.match(cashBody,/public\.user_can\('manageCashRegister'\) IS NOT TRUE/i);
 assert.match(cashBody,/p_opening_cash IS NULL[\s\S]*?lower\(p_opening_cash::text\) IN \('nan', 'infinity', '-infinity'\)[\s\S]*?p_opening_cash < 0/i);
 const finite=cashBody.search(/p_opening_cash IS NULL/i);
 const lock=cashBody.search(/FROM public\.locations/i);
 const mutation=cashBody.search(/\bINSERT INTO\b/i);
 assert.ok(finite>=0&&finite<lock&&lock<mutation);
 assert.match(cashBody,/FROM public\.locations[\s\S]*?id = p_location_id AND business_id = p_business_id[\s\S]*?FOR UPDATE/i);
 assert.match(cashBody,/FROM public\.cash_registers[\s\S]*?business_id = p_business_id[\s\S]*?location_id = p_location_id[\s\S]*?FOR UPDATE/i);
 assert.match(cashBody,/GET DIAGNOSTICS v_audit_rows = ROW_COUNT[\s\S]*?v_audit_rows <> 1/i);
 assert.match(cashMigration,/REVOKE ALL ON FUNCTION public\.fn_open_cash_register[\s\S]*FROM PUBLIC, anon/i);
 assert.match(cashMigration,/GRANT EXECUTE ON FUNCTION public\.fn_open_cash_register[\s\S]*TO authenticated/i);
});

test('cash rollback proof rejects NULL, NaN and infinities without residue, then accepts finite input',()=>{
 assert.match(cashProof,/ARRAY\[[\s\S]*?NULL::numeric[\s\S]*?'NaN'::numeric[\s\S]*?'Infinity'::numeric[\s\S]*?'-Infinity'::numeric/i);
 assert.match(cashProof,/Rejected opening cash left an open register/i);
 assert.match(cashProof,/fn_open_cash_register\([\s\S]*?v_business_id, v_location_id, 25/i);
 assert.match(cashProof,/type = 'opening_balance'[\s\S]*?amount = 25[\s\S]*?payment_method = 'Cash'/i);
 assert.match(cashProof,/exactly one audit row/i);
 assert.match(cashProof,/\bROLLBACK;/i);
 assert.doesNotMatch(cashProof,/\bCOMMIT;/i);
});

for(const file of ['App.jsx','src/App.jsx']){
 test(file+': expense rollout is opt-in, keeps a stable request ID and permits safe retry',()=>{
  const source=readFileSync(file,'utf8');
  const hook=source.slice(source.indexOf('function useSupabaseExpenses'),source.indexOf('function useSupabasePurchases'));
  const modal=source.slice(source.indexOf('function ExpenseModal'),source.indexOf('function PurchaseOrdersView'));
  const rpc=source.slice(source.indexOf('async rpc(fnName'),source.indexOf('function sanitizeRecoveryCode'));
  assert.match(hook,/VITE_EXPENSE_IDEMPOTENCY_ENABLED\s*===\s*"true"/);
  assert.match(hook,/idempotent \? "fn_create_expense_idempotent" : "fn_create_expense"/);
  assert.match(hook,/p_request_id:\s*x\.requestId/);
  assert.match(modal,/const requestIdRef = useRef\(newDbId\(\)\)/);
  assert.match(modal,/expenseOps\.create\(\{ requestId: requestIdRef\.current/);
  assert.match(modal,/!Number\.isFinite\(amt\) \|\| amt <= 0/);
  assert.match(rpc,/"fn_create_purchase_order_idempotent", "fn_create_expense_idempotent"/);
  assert.match(rpc,/if \(!harmless && !replaySafe\) _unconfirmedRpcWrite/);
  assert.match(rpc,/error\.commitUncertain = !replaySafe \|\| fnName === "fn_create_sale"/);
 });

 test(file+': opening cash rejects non-finite values before any remote RPC',async()=>{
  const source=readFileSync(file,'utf8');
  const start=source.indexOf('async function openCashRegister');
  const end=source.indexOf('async function recordCashMovement',start);
  assert.ok(start>=0&&end>start);
  const context=vm.createContext({round2:value=>Math.round((Number(value)+Number.EPSILON)*100)/100,Number});
  vm.runInContext(source.slice(start,end)+';globalThis.openCashRegister=openCashRegister;',context);
  let calls=0;
  const ctx={cashRegisterOps:{remote:true,open:async payload=>{calls++;return {success:true,payload};}}};
  const invalid=await context.openCashRegister({locationId:'location',openingCash:Infinity,notes:''},ctx);
  assert.equal(invalid.success,false);assert.match(invalid.error,/positive finite amount/);assert.equal(calls,0);
  const valid=await context.openCashRegister({locationId:'location',openingCash:'25.50',notes:'QA'},ctx);
  assert.equal(valid.success,true);assert.equal(valid.payload.openingCash,25.5);assert.equal(calls,1);
 });
}

test('default QA workflow never enables expense idempotency or executes rollback SQL',()=>{
 assert.doesNotMatch(workflow,/VITE_EXPENSE_IDEMPOTENCY_ENABLED\s*:/);
 assert.doesNotMatch(workflow,/p0_03_expense_idempotency_rollback_TEST\.sql|p0_03_cash_register_finite_rollback_TEST\.sql/);
});
