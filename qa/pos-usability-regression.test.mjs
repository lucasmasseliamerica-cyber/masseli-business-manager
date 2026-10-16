import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const src = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} was not found`);
  let depth = 0;
  let opened = false;
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') { depth += 1; opened = true; }
    if (source[index] === '}') depth -= 1;
    if (opened && depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} closing brace was not found`);
}

for (const [label, source] of [['root App.jsx', root], ['src/App.jsx', src]]) {
  test(`${label}: product images accept only bounded HTTPS URLs`, () => {
    const implementation = extractFunction(source, 'normalizeProductImageUrl');
    const normalize = Function(`${implementation}; return normalizeProductImageUrl;`)();
    assert.equal(normalize('https://cdn.example.com/item.jpg'), 'https://cdn.example.com/item.jpg');
    assert.equal(normalize(' http://cdn.example.com/item.jpg '), '');
    assert.equal(normalize('javascript:alert(1)'), '');
    assert.equal(normalize('data:image/png;base64,abc'), '');
    assert.equal(normalize(`https://example.com/${'a'.repeat(2050)}`), '');
  });

  test(`${label}: product photo is editable, previewed and persisted`, () => {
    assert.match(source, /Product Image URL \(HTTPS\)/);
    assert.match(source, /<ProductImage product=\{\{ name: name \|\| "Product", image \}\}/);
    assert.match(source, /const payload = validation\.value/);
    assert.match(source, /p_image_url: safeProduct\.image \|\| null/);
    assert.match(source, /ProductImage product=\{p\} dark=\{dark\} size=\{58\}/);
  });

  test(`${label}: POS offers visual quick-add cards without duplicate lines`, () => {
    assert.match(source, /const \[items, setItems\] = useState\(\[\]\)/);
    assert.match(source, /const addProductToCart = \(productId\) =>/);
    assert.match(source, /existingIndex >= 0[\s\S]*qty: Math\.max\(1, Number\(item\.qty\) \|\| 1\) \+ 1/);
    assert.match(source, /QUICK ADD PRODUCTS/);
    assert.match(source, /aria-label=\{interpolateUI\("Add \{0\}"/);
    assert.match(source, /<ProductImage product=\{product\} dark=\{dark\} size=\{72\}/);
  });

  test(`${label}: invalid sale totals and stale selectors are rejected before persistence`, () => {
    assert.match(source, /Number\.isFinite\(manualDiscount\)/);
    assert.match(source, /Number\.isFinite\(taxAmt\)/);
    assert.match(source, /totalDiscount > subtotal/);
    assert.match(source, /Select a valid payment method/);
    assert.match(source, /Select a valid sales channel/);
    assert.match(source, /Select an active sales location/);
  });

  test(`${label}: card transport rejection returns checkout to a recoverable state`, () => {
    assert.match(source, /handle\.promise\.then\(\(result\) => handlePaymentResult\(pendingSale, result\)\)\.catch/);
    assert.match(source, /setPaymentHandle\(null\);[\s\S]*setPendingCardSale\(null\);[\s\S]*setPaymentPhase\("idle"\)/);
    assert.match(source, /Card payment status could not be confirmed\. Check the terminal or payment provider before trying again/);
  });
}

test('root and src application copies remain identical after POS changes', () => {
  assert.equal(root, src);
});
