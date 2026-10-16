import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const files = ['src/App.jsx', 'App.jsx'];

function section(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `${startToken} section was not found`);
  return source.slice(start, end);
}

for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const context = vm.createContext({ URL, String, Number, Set, Array, Object, Math });
  vm.runInContext(
    'const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;' +
    section(source, 'function normalizeProductImageUrl', '/* ============================== SEED DATA') +
    ';globalThis.validate=validateProductDraft;',
    context,
  );
  const inventory = [
    { id: 'stock-a', name: 'A', active: true },
    { id: 'stock-b', name: 'B', active: false },
  ];
  const products = [{ id: 'existing', name: 'Açaí Bowl', sku: 'AB-1' }];
  const base = { id: 'new', name: ' Smoothie ', sku: ' SM-1 ', category: ' Drinks ', price: '8.259', active: true, description: ' Fresh ', image: 'https://cdn.example/item.jpg', recipe: [{ itemId: 'stock-a', qty: '0.5' }] };

  test(`${file}: product validator normalizes the complete catalog payload`, () => {
    const result = context.validate(base, { products, inventory });
    assert.equal(result.ok, true);
    assert.equal(result.value.name, 'Smoothie');
    assert.equal(result.value.sku, 'SM-1');
    assert.equal(result.value.category, 'Drinks');
    assert.equal(result.value.price, 8.26);
    assert.deepEqual(JSON.parse(JSON.stringify(result.value.recipe)), [{ itemId: 'stock-a', qty: 0.5 }]);
  });

  test(`${file}: duplicate identity and malformed financial fields fail before persistence`, () => {
    for (const patch of [
      { name: ' açaí bowl ' }, { sku: ' ab-1 ' }, { name: ' ' }, { category: ' ' },
      { price: '' }, { price: 'NaN' }, { price: -1 }, { image: 'http://unsafe.example/item.jpg' },
    ]) assert.equal(context.validate({ ...base, ...patch }, { products, inventory }).ok, false);
  });

  test(`${file}: active recipes reject missing, inactive, duplicate and invalid ingredients`, () => {
    const badRecipes = [
      [{ itemId: 'missing', qty: 1 }],
      [{ itemId: 'stock-b', qty: 1 }],
      [{ itemId: 'stock-a', qty: 1 }, { itemId: 'stock-a', qty: 2 }],
      [{ itemId: 'stock-a', qty: '' }],
      [{ itemId: 'stock-a', qty: Infinity }],
    ];
    for (const recipe of badRecipes) assert.equal(context.validate({ ...base, recipe }, { products, inventory }).ok, false);
    assert.equal(context.validate({ ...base, active: false, recipe: [{ itemId: 'stock-b', qty: 1 }] }, { products, inventory }).ok, true);
  });

  test(`${file}: UI prevents duplicate recipe selection and persistence revalidates`, () => {
    const modal = section(source, 'function ProductModal', '/* ============================== EXPENSES');
    assert.match(modal, /availableIngredient = inventory\.find/);
    assert.match(modal, /item\.active !== false && !recipe\.some/);
    assert.match(modal, /disabled=\{!availableIngredient\}/);
    assert.match(modal, /qty: e\.target\.value/);
    const hook = section(source, 'function useSupabaseProducts', 'const inventoryTxTypeLabel');
    const validationIndex = hook.indexOf('validateProductDraft(product');
    const rpcIndex = hook.indexOf('supabaseRest.rpc("fn_save_product"');
    assert.ok(validationIndex >= 0 && rpcIndex > validationIndex);
  });
}

test('root and src application copies remain identical after product catalog work', () => {
  assert.equal(readFileSync(new URL('../App.jsx', import.meta.url), 'utf8'), readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'));
});
