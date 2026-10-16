import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const src = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

function reportsView(source) {
  const start = source.indexOf('function ReportsView(');
  const end = source.indexOf('/* ============================== SETTINGS', start);
  assert.ok(start >= 0 && end > start, 'ReportsView source was not found');
  return source.slice(start, end);
}

for (const [label, source] of [['root App.jsx', root], ['src/App.jsx', src]]) {
  const reports = reportsView(source);

  test(`${label}: financial report panels and exports require viewFinancials`, () => {
    assert.match(reports, /const canFinance = can \? can\("viewFinancials"\) : true/);
    assert.match(reports, /action=\{canFinance \? <GhostButton[^>]*onClick=\{exportCSV\}/);
    assert.match(reports, /\{canFinance && \(\s*<Card[^>]*>\s*<div[^>]*>\{translateUI\("Profit & Loss"\)\}/);
    assert.match(reports, /\{canFinance && \(\s*<Card[^>]*>\s*<div[^>]*>\{translateUI\("Revenue Trend"\)/);
    assert.match(reports, /\{canFinance && <Card[^>]*>\s*<div[^>]*>\{translateUI\("Discounts"\)\}/);
    assert.match(reports, /\{canFinance && purchaseOrders && \(\s*<Card[^>]*>[\s\S]*?\{translateUI\("Purchases by Supplier"\)\}/);
    assert.match(reports, /\{canFinance && purchaseOrders && \(\s*<Card[^>]*>[\s\S]*?\{translateUI\("Outstanding Payables"\)\}/);
  });

  test(`${label}: operational reports remain useful without financial disclosure`, () => {
    assert.match(reports, /displayedProducts = canFinance \? \(productSort === "revenue" \? productPerf\.byRevenue : productPerf\.byQty\) : productPerf\.byQty/);
    assert.match(reports, /right=\{canFinance \? fmtMoney\(p\.revenue\) : `\$\{p\.qty\} units`\}/);
    assert.match(reports, /right=\{canFinance \? fmtMoney\(c\.revenue\) : `\$\{c\.orders\} orders`\}/);
    assert.match(reports, /right=\{canFinance \? fmtMoney\(l\.revenue\) : `\$\{l\.orders\} orders`\}/);
    assert.match(reports, /right=\{canFinance \? fmtMoney\(p\.revenue\) : `\$\{p\.orders\} transactions`\}/);
    assert.match(reports, /canFinance \? "Profit & Loss and business performance" : "Operational performance"/);
  });
}

test('root and src application copies remain identical', () => {
  assert.equal(root, src);
});
