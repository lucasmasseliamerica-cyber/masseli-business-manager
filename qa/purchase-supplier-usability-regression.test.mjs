import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const src = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

function section(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `${startToken} section was not found`);
  return source.slice(start, end);
}

for (const [label, source] of [['root App.jsx', root], ['src/App.jsx', src]]) {
  const purchases = section(source, 'function PurchasesView(', 'function NewPurchaseModal(');
  const newPurchase = section(source, 'function NewPurchaseModal(', 'function PurchaseDetailModal(');
  const purchaseDetail = section(source, 'function PurchaseDetailModal(', 'function ReceivePurchaseModal(');
  const suppliers = section(source, 'function SuppliersView(', 'function SupplierFormModal(');
  const supplierForm = section(source, 'function SupplierFormModal(', 'function SupplierDetailModal(');
  const supplierDetail = section(source, 'function SupplierDetailModal(', 'function CustomerCreateModal(');

  test(`${label}: purchase financial totals require financial permission`, () => {
    assert.match(purchases, /const canFinance = can\("viewFinancials"\)/);
    assert.match(purchases, /canFinance && <StatCard[^>]+Purchases \(30d\)/);
    assert.match(purchases, /canFinance \? fmtMoney\(poGrandTotal\(po\)\) : null/);
    assert.match(purchaseDetail, /canFinance \? `\$\{invItem\?\.name/);
    assert.match(purchaseDetail, /\(canFinance \|\| canPaySuppliers\) && payments\.length > 0/);
    assert.match(purchaseDetail, /amountDue > 0\.005 && canPaySuppliers/);
  });

  test(`${label}: purchase form validates selectors, dates and finite amounts`, () => {
    assert.match(newPurchase, /Select an active supplier/);
    assert.match(newPurchase, /Select an active location/);
    assert.match(newPurchase, /Select a valid payment method/);
    assert.match(newPurchase, /Expected delivery can't be before the order date/);
    assert.match(newPurchase, /Number\.isFinite\(Number\(l\.qty\)\)/);
    assert.match(newPurchase, /Discount and tax must be valid nonnegative amounts/);
    assert.doesNotMatch(newPurchase, /setDiscount\(Math\.max/);
  });

  test(`${label}: uncertain purchase creation cannot be resubmitted`, () => {
    assert.match(newPurchase, /const \[uncertain, setUncertain\] = useState\(false\)/);
    assert.match(newPurchase, /if \(submitting \|\| uncertain\) return/);
    assert.match(newPurchase, /if \(e\?\.commitUncertain\) setUncertain\(true\)/);
    assert.match(newPurchase, /disabled=\{submitting \|\| uncertain\}/);
    assert.match(newPurchase, /Refresh required/);
  });

  test(`${label}: supplier edits reject duplicates and malformed websites`, () => {
    assert.match(supplierForm, /A supplier with this name already exists/);
    assert.match(supplierForm, /A supplier with this email already exists/);
    assert.match(supplierForm, /new URL\(form\.website\.trim\(\)\)/);
    assert.match(supplierForm, /\["http:", "https:"\]\.includes/);
    assert.match(supplierForm, /Object\.fromEntries\(\["name", "contact", "phone", "email"/);
  });

  test(`${label}: supplier catalog supports normalized search and status filters`, () => {
    assert.match(suppliers, /const \[query, setQuery\] = useState\(""\)/);
    assert.match(suppliers, /const \[statusFilter, setStatusFilter\] = useState\("active"\)/);
    assert.match(suppliers, /normalizeCatalogSearch\(query\)/);
    assert.match(suppliers, /supplier\.name, supplier\.contact, supplier\.phone, supplier\.email, supplier\.products/);
    assert.match(suppliers, /value="inactive"/);
    assert.match(suppliers, /value="all"/);
    assert.match(suppliers, /visibleSuppliers\.map/);
    assert.match(suppliers, /No suppliers match these filters/);
    assert.match(suppliers, /aria-label=\{translateUI\("Search suppliers"\)\}/);
  });

  test(`${label}: supplier financial history is permission-gated and mutations report failure`, () => {
    assert.match(supplierDetail, /const canFinance = can\("viewFinancials"\)/);
    assert.match(supplierDetail, /canFinance && <StatCard[^>]+Total Purchased/);
    assert.match(supplierDetail, /right=\{canFinance \? fmtMoney\(poGrandTotal\(po\)\) : null\}/);
    assert.match(supplierDetail, /Unable to update supplier/);
    assert.match(supplierDetail, /Unable to delete supplier/);
  });
}

test('root and src application copies remain identical after purchase and supplier changes', () => {
  assert.equal(root, src);
});

test('purchase receipt quantities preserve thousandths without changing monetary rounding or mutating prior inventory', () => {
  const code=src.slice(src.indexOf('function applyPurchaseReceipt('),src.indexOf('// Appends one immutable audit entry.'));
  const context=vm.createContext({Math,Number,uid:()=> 'LOCAL_LEDGER_ID',nowISO:()=> '2026-10-23T00:00:00.000Z'});
  const round2=src.match(/^const round2 = .*;$/m)[0];
  const roundStock=src.match(/^const roundStockQty = .*;$/m)[0];
  vm.runInContext(round2+'\n'+roundStock+'\n'+code+';globalThis.receive=applyPurchaseReceipt;',context);
  for(const quantity of [0.125,0.004]) {
    const original=[{id:'LOCAL_ITEM',name:'QA ingredient',qty:2,costPerUnit:0.1,unit:'kg'}];
    const snapshot=JSON.stringify(original);
    const result=context.receive(original,[{itemId:'LOCAL_ITEM',qty:quantity,unitCost:1.23}]);
    assert.equal(result.nextInventory[0].qty,2+quantity);
    assert.equal(result.txEntries[0].qty,quantity);
    assert.equal(result.txEntries[0].totalCost,Math.round((quantity*1.23+Number.EPSILON)*100)/100);
    assert.equal(JSON.stringify(original),snapshot);
  }
});

test('fractional local purchase reversal preserves other stock thousandths and remains replay-safe', () => {
  const code=src.slice(src.indexOf('function applyInventoryOpIfNeeded('),src.indexOf('// NORMAL / LOW / CRITICAL',src.indexOf('function applyInventoryOpIfNeeded(')));
  const context=vm.createContext({Math,Number,Object});
  vm.runInContext(src.match(/^const round2 = .*;$/m)[0]+'\n'+src.match(/^const roundStockQty = .*;$/m)[0]+'\n'+code+';globalThis.reverse=(inventory)=>applyInventoryOpIfNeeded(inventory,"LOCAL_PURCHASE_REVERSAL",{LOCAL_ITEM:-0.125},roundStockQty);',context);
  const original=[{id:'LOCAL_ITEM',qty:2.129,costPerUnit:0.1,appliedOps:[]}];
  const snapshot=JSON.stringify(original);
  const first=context.reverse(original);
  assert.equal(first.changed,true);assert.equal(first.nextInventory[0].qty,2.004);
  assert.equal(first.nextInventory[0].costPerUnit,0.1);assert.equal(JSON.stringify(original),snapshot);
  const replay=context.reverse(first.nextInventory);
  assert.equal(replay.changed,false);assert.equal(replay.nextInventory[0].qty,2.004);
});
