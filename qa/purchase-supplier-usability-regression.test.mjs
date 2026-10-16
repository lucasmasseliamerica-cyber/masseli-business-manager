import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
