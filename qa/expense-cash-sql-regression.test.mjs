import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const migrationPath='migrations/20261015_expense_cash_normalization_TEST.sql';
const rollbackPath='qa/sql/p0_03_expense_cash_normalization_rollback_TEST.sql';
const migration=readFileSync(migrationPath,'utf8');
const rollback=readFileSync(rollbackPath,'utf8');
const functionBody=migration.match(/AS \$function\$([\s\S]*?)\$function\$;/i)?.[1]||'';
const executableBody=functionBody.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');

test('prepared TEST migration hardens the expense definer before any mutation',()=>{
 assert.match(migration,/PREPARED, NOT EXECUTED/i);
 assert.match(migration,/CREATE OR REPLACE FUNCTION public\.fn_create_expense/i);
 assert.match(migration,/SECURITY DEFINER\s+SET search_path TO ''/i);
 assert.match(executableBody,/IF p_business_id IS DISTINCT FROM public\.current_business_id\(\)/i);
 assert.match(executableBody,/IF public\.user_can\('manageExpenses'\) IS NOT TRUE/i);
 assert.doesNotMatch(executableBody,/IF NOT public\.user_can\('manageExpenses'\)/i);
 const tenantGuard=executableBody.search(/p_business_id IS DISTINCT FROM public\.current_business_id/i);
 const permissionGuard=executableBody.search(/public\.user_can\('manageExpenses'\) IS NOT TRUE/i);
 const firstMutation=executableBody.search(/\b(?:INSERT|UPDATE|DELETE)\b/i);
 assert.ok(tenantGuard>=0 && tenantGuard<firstMutation,'tenant guard must precede the first mutation');
 assert.ok(permissionGuard>=0 && permissionGuard<firstMutation,'permission guard must precede the first mutation');
 assert.match(executableBody,/FROM public\.locations[\s\S]*?id = p_location_id AND business_id = p_business_id/i);
 assert.match(executableBody,/FROM public\.cash_registers[\s\S]*?business_id = p_business_id[\s\S]*?location_id = p_location_id[\s\S]*?status = 'open'/i);
 assert.match(executableBody,/FROM public\.users AS u[\s\S]*?u\.id = auth\.uid\(\) AND u\.business_id = p_business_id/i);
 assert.match(migration,/REVOKE ALL ON FUNCTION public\.fn_create_expense[\s\S]*FROM PUBLIC, anon;/i);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.fn_create_expense[\s\S]*TO authenticated;/i);
});

test('prepared migration rejects invalid input and uses one canonical Cash value in both ledgers',()=>{
 assert.match(migration,/p_amount IS NULL[\s\S]*lower\(p_amount::text\) IN \('nan', 'infinity', '-infinity'\)[\s\S]*p_amount <= 0/i);
 assert.match(migration,/expense amount must be greater than zero and finite/i);
 assert.match(migration,/v_payment_method := pg_catalog\.regexp_replace\([\s\S]*?p_payment_method, '\^\[\[:space:\]\]\+\|\[\[:space:\]\]\+\$', '', 'g'/i);
 assert.match(migration,/NULLIF\(v_payment_method, ''\) IS NULL/i);
 assert.match(migration,/v_is_cash := pg_catalog\.lower\(v_payment_method\) = 'cash'/i);
 assert.match(migration,/v_payment_method := CASE WHEN v_is_cash THEN 'Cash' ELSE v_payment_method END/i);
 assert.match(migration,/pg_catalog\.lower\(pg_catalog\.regexp_replace\([\s\S]*?cf\.payment_method,[\s\S]*?'g'[\s\S]*?\)\) = 'cash'/i);
 assert.match(executableBody,/cf\.type IN \('income', 'expense'\)/i);
 assert.match(executableBody,/cf\.business_id = p_business_id/i);
 assert.match(executableBody,/cf\.location_id = p_location_id/i);
 assert.doesNotMatch(executableBody,/cf\.category\s+(?:IS DISTINCT FROM|<>|!=)/i);
 assert.match(executableBody,/FOR UPDATE/i);
 assert.match(executableBody,/IF v_available_cash IS NULL[\s\S]*lower\(v_available_cash::text\) IN \('nan', 'infinity', '-infinity'\)[\s\S]*v_available_cash < 0 THEN/i);
 assert.doesNotMatch(migration,/cf\.payment_method\s*=\s*'Cash'/i);

 const expenseInsert=migration.match(/INSERT INTO public\.expenses[\s\S]*?RETURNING \* INTO v_expense;/i)?.[0]||'';
 const cashFlowInsert=migration.match(/INSERT INTO public\.cash_flow[\s\S]*?auth\.uid\(\)\);/i)?.[0]||'';
 assert.match(expenseInsert,/v_payment_method/i,'expenses must store the canonical payment method');
 assert.match(cashFlowInsert,/v_payment_method/i,'cash_flow must store the canonical payment method');
 assert.doesNotMatch(expenseInsert,/p_amount,\s*p_payment_method/i);
 assert.doesNotMatch(cashFlowInsert,/p_amount,\s*p_payment_method/i);
 assert.match(executableBody,/GET DIAGNOSTICS v_audit_rows = ROW_COUNT;[\s\S]*IF v_audit_rows <> 1 THEN/i);
});

test('rollback QA proof is gated, counts a label-colliding expense and leaves rejected attempt residue-free',()=>{
 assert.match(rollback,/presence does not claim database execution or approval/i);
 assert.match(rollback,/\bBEGIN;/i);
 assert.match(rollback,/SET LOCAL ROLE authenticated;/i);
 assert.match(rollback,/SET LOCAL lock_timeout = '5s';/i);
 assert.match(rollback,/SET LOCAL statement_timeout = '30s';/i);
 assert.match(rollback,/d627563b-2ce4-491d-8cf6-141ef28d0f63[\s\S]*business_id mismatch/i);
 assert.match(rollback,/Rejected cross-tenant expense left residual rows/i);
 assert.match(rollback,/a3e4b2ed-eb00-4963-afd0-38c256aff87d[\s\S]*location not found/i);
 assert.match(rollback,/Rejected foreign-location expense left residual rows/i);
 assert.match(rollback,/public\.fn_open_cash_register\([\s\S]*?100,/i);
 assert.match(rollback,/v_register\.business_id IS DISTINCT FROM v_business_id[\s\S]*?v_register\.location_id IS DISTINCT FROM v_location_id[\s\S]*?v_register\.opening_cash IS DISTINCT FROM 100[\s\S]*?v_register\.notes IS DISTINCT FROM v_tag \|\| ':register'/i);
 assert.match(rollback,/public\.fn_create_expense\([\s\S]*?'Cash Register - Opening'[\s\S]*?60, E'\\tCaSh\\t'/i);
 assert.match(rollback,/v_expense\.payment_method IS DISTINCT FROM 'Cash'/i);
 assert.match(rollback,/cf\.type IN \('income', 'expense'\)/i);
 assert.doesNotMatch(rollback,/cf\.category\s+(?:IS DISTINCT FROM|<>|!=)/i);
 assert.match(rollback,/50, 'Cash'[\s\S]*?insufficient cash in register/i);
 assert.match(rollback,/description = v_tag \|\| ':blocked'/i);
 assert.match(rollback,/Accepted expense count changed after rejected retry/i);
 assert.match(rollback,/Accepted expense audit row was not atomic/i);
 assert.match(rollback,/Rejected expense changed the controlled cash balance/i);
 assert.match(rollback,/RAISE NOTICE 'PASS: P0\.03 expense Cash normalization checks \(rollback; no persistent mutations\)'/i);
 assert.match(rollback,/\bROLLBACK;/i);
 assert.doesNotMatch(rollback,/\bCOMMIT;/i);
 assert.doesNotMatch(rollback,/SELECT\s+'PASS:/i);
});

test('prepared cash fix explicitly does not claim replay idempotency',()=>{
 assert.match(migration,/no operation\/request ID[\s\S]*not replay-idempotent/i);
 assert.match(rollback,/no request ID[\s\S]*does not claim replay idempotency/i);
 assert.doesNotMatch(migration,/idempotency key|ON CONFLICT/i);
});

for(const file of ['src/App.jsx','App.jsx']){
 test(file+': drawer balance uses ledger type, so an expense may share the opening label',()=>{
  const source=readFileSync(file,'utf8');
  const start=source.indexOf('const CASH_REGISTER_CATEGORIES');
  const end=source.indexOf('function cashRegisterBreakdown',start);
  assert.ok(start>=0&&end>start,'Cash calculation boundaries must exist');
  const context=vm.createContext({round2:(value)=>Math.round((Number(value)+Number.EPSILON)*100)/100});
  vm.runInContext(source.slice(start,end)+';globalThis.entries=cashRegisterEntries;globalThis.expected=calculateExpectedCash;',context);
  const register={id:'register-1',locationId:'location-1',openedAt:'2026-10-15T10:00:00.000Z',openingCash:100,status:'open'};
  const rows=[
   {id:'opening',type:'income',ledgerType:'opening_balance',category:'Cash Register - Opening',amount:100,paymentMethod:'Cash',relatedCashRegisterId:register.id},
   {id:'expense',type:'expense',ledgerType:'expense',category:'Cash Register - Opening',amount:60,paymentMethod:' cash ',relatedCashRegisterId:register.id,relatedExpenseId:'expense-1'},
  ];
  const entries=context.entries(register,rows);
  assert.equal(entries.length,1);assert.equal(entries[0].id,'expense');
  assert.equal(context.expected(register,rows),40);
  const legacyRows=[
   {id:'legacy-opening',type:'income',category:'Cash Register - Opening',description:'Register opened',amount:100,paymentMethod:'Cash',relatedCashRegisterId:register.id},
   rows[1],
  ];
  const legacyEntries=context.entries(register,legacyRows);
  assert.equal(legacyEntries.length,1);assert.equal(legacyEntries[0].id,'expense');
  assert.equal(context.expected(register,legacyRows),40);
 });
}
