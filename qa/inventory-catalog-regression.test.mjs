import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const files = ['App.jsx', 'src/App.jsx'];

function section(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `${startToken} section was not found`);
  return source.slice(start, end);
}

for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const context = vm.createContext({ String, Number, Array, Object, Math });
  vm.runInContext(
    'const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;' +
    section(source, 'function validateInventoryCatalogDraft', '/* ============================== SEED DATA') +
    ';globalThis.validate=validateInventoryCatalogDraft;',
    context,
  );
  const inventory = [
    { id: 'stock-a', name: 'Açaí', sku: 'AC-1', minQty: 2, maxQty: 10, category: 'Fruit', unit: 'kg', active: true },
    { id: 'stock-b', name: 'Banana', sku: 'BA-1', minQty: 1, maxQty: 20, category: 'Fruit', unit: 'kg', active: true },
  ];
  const products = [{ id: 'product-a', name: 'Bowl', active: true, recipe: [{ itemId: 'stock-a', qty: 1 }] }];

  test(`${file}: inventory catalog edit normalizes metadata without changing ledger fields`, () => {
    const result = context.validate({ ...inventory[1], name: ' Banana Premium ', sku: ' BA-2 ', minQty: '3.456', maxQty: '30', qty: 42, costPerUnit: 7.5 }, { inventory, products });
    assert.equal(result.ok, true);
    assert.equal(result.value.name, 'Banana Premium');
    assert.equal(result.value.sku, 'BA-2');
    assert.equal(result.value.minQty, 3.46);
    assert.equal(result.value.qty, 42);
    assert.equal(result.value.costPerUnit, 7.5);
  });

  test(`${file}: duplicates and malformed catalog limits are rejected`, () => {
    const base = { ...inventory[1], name: 'Banana Premium', sku: 'BA-2' };
    for (const patch of [
      { name: ' açaí ' }, { sku: ' ac-1 ' }, { name: ' ' }, { category: '' }, { unit: '' },
      { minQty: '' }, { minQty: -1 }, { maxQty: Infinity }, { minQty: 11, maxQty: 10 },
      { expiresAt: '16/10/2026' }, { notes: 'x'.repeat(2001) },
    ]) assert.equal(context.validate({ ...base, ...patch }, { inventory, products }).ok, false);
  });

  test(`${file}: deactivation preserves history and blocks ingredients used by active products`, () => {
    assert.equal(context.validate({ ...inventory[0], active: false }, { inventory, products }).ok, false);
    assert.equal(context.validate({ ...inventory[0], active: false }, { inventory, products: [{ ...products[0], active: false }] }).ok, true);
    const inventoryView = section(source, 'function InventoryView(', 'function InventoryCatalogModal(');
    assert.match(inventoryView, /Its stock, movements and historical references will be preserved/);
    assert.match(inventoryView, /Inventory Item Deactivated/);
    assert.match(inventoryView, /Inventory Item Reactivated/);
  });

  test(`${file}: inactive items cannot start stock operations and catalog edits require permission`, () => {
    const inventoryView = section(source, 'function InventoryView(', 'function InventoryCatalogModal(');
    const editModal = section(source, 'function InventoryCatalogModal(', 'function NewInventoryItemModal(');
    const createModal = section(source, 'function NewInventoryItemModal(', 'function InventoryTransferModal(');
    assert.match(inventoryView, /i\.active !== false && can\("manageInventory"\)/);
    assert.match(inventoryView, /i\.active !== false && can\("adjustInventory"\) && inventoryOps\?\.transfer/);
    assert.match(editModal, /if \(!can\("adjustInventory"\)\)/);
    assert.match(editModal, /Quantity, location balances and average cost are controlled by inventory movements/);
    const validateIndex = createModal.indexOf('validateInventoryCatalogDraft(');
    const createIndex = createModal.indexOf('inventoryOps.createItem(');
    assert.ok(validateIndex >= 0 && createIndex > validateIndex, 'new items must pass catalog validation before the create RPC');
    assert.match(createModal, /supplier\.active !== false/);
    assert.match(createModal, /Select an active storage location/);
  });

  test(`${file}: transfers require two active locations before invoking the RPC`, () => {
    const transfer = section(source, 'function InventoryTransferModal(', 'function StockActionModal(');
    const validation = transfer.indexOf('activeLocations.some((location) => location.id === fromId)');
    const rpc = transfer.indexOf('inventoryOps.transfer(');
    assert.ok(validation >= 0 && rpc > validation);
  });
}

test('root and src application copies remain identical after inventory catalog work', () => {
  assert.equal(readFileSync(new URL('../App.jsx', import.meta.url), 'utf8'), readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'));
});
