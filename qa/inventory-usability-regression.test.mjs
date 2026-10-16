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
  const inventoryView = section(source, 'function InventoryView(', 'function NewInventoryItemModal(');
  const transfer = section(source, 'function InventoryTransferModal(', 'function StockActionModal(');
  const stockAction = section(source, 'function StockActionModal(', 'function InventoryHistoryModal(');
  const history = section(source, 'function InventoryHistoryModal(', '/* ============================== PURCHASING');

  test(`${label}: inventory valuation is hidden without financial permission`, () => {
    assert.match(inventoryView, /sub=\{can\("viewFinancials"\) \? interpolateUI\("Total value \{0\}"/);
    assert.match(inventoryView, /: interpolateUI\("\{0\} active items"/);
    assert.match(inventoryView, /const canExport = can\("viewFinancials"\)/);
  });

  test(`${label}: local receive, count and waste reject non-finite or negative quantities`, () => {
    assert.match(stockAction, /if \(!Number\.isFinite\(addQty\) \|\| addQty <= 0\)/);
    assert.match(stockAction, /if \(newQty === "" \|\| !Number\.isFinite\(parsedQty\)\)/);
    assert.match(stockAction, /if \(parsedQty < 0\)/);
    assert.doesNotMatch(stockAction, /const nq = clamp0\(round2\(Number\(newQty\)\)\)/);
    assert.match(stockAction, /if \(!Number\.isFinite\(wasteQty\) \|\| wasteQty <= 0\)/);
  });

  test(`${label}: uncertain transfers are blocked until refresh`, () => {
    assert.match(transfer, /const \[uncertain, setUncertain\] = useState\(false\)/);
    assert.match(transfer, /if \(submitting \|\| uncertain\) return/);
    assert.match(transfer, /setUncertain\(!!e\?\.commitUncertain\)/);
    assert.match(transfer, /disabled=\{submitting \|\| uncertain\}/);
    assert.match(transfer, /Refresh required/);
  });

  test(`${label}: inventory history supports type filtering and expansion`, () => {
    assert.match(history, /const \[moveFilter, setMoveFilter\] = useState\("all"\)/);
    assert.match(history, /const movementTypes = \[\.\.\.new Set/);
    assert.match(history, /const visibleMoves = showAllMoves \? filteredMoves : filteredMoves\.slice\(0, 20\)/);
    assert.match(history, /Show all \{0\} movements/);
    assert.match(history, /showCosts && t\.totalCost != null/);
  });
}

test('root and src application copies remain identical after inventory changes', () => {
  assert.equal(root, src);
});
