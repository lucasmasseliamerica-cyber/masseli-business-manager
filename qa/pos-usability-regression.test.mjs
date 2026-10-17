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
    assert.match(source, /<ProductImage product=\{\{ name: name \|\| "Product", imageDisplayUrl:[^}]+\}\} localPreviewUrl=\{pendingImagePreview\}/);
    assert.match(source, /(?:const|let) payload = validation\.value/);
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

  test(`${label}: POS catalog search is accent-insensitive and combines category filters`, () => {
    const implementation = extractFunction(source, 'normalizeCatalogSearch');
    const normalize = Function(`${implementation}; return normalizeCatalogSearch;`)();
    assert.equal(normalize('  AÇAÍ Premium  '), 'acai premium');
    assert.match(source, /const \[productQuery, setProductQuery\] = useState\(""\)/);
    assert.match(source, /const \[productCategory, setProductCategory\] = useState\("all"\)/);
    assert.match(source, /normalizeCatalogSearch\(`\$\{product\.name\} \$\{product\.sku \|\| ""\} \$\{product\.category \|\| ""\}`\)\.includes\(query\)/);
    assert.match(source, /productCategory !== "all" && product\.category !== productCategory/);
    assert.match(source, /Search products by name, SKU or category/);
    assert.match(source, /visibleProducts\.map\(\(product\) =>/);
    assert.match(source, /No products match these filters/);
    assert.match(source, /setProductQuery\(""\); setProductCategory\("all"\)/);
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

  test(`${label}: confirmed payment recovery keeps the exact sale and provider result`, () => {
    const implementation = extractFunction(source, 'buildConfirmedPaymentSaveRecovery');
    const buildRecovery = Function(`${implementation}; return buildConfirmedPaymentSaveRecovery;`)();
    const pendingSaleObj = { id: 'sale-fixed-id' };
    const result = { success: true, transactionId: 'provider-reference' };
    const definite = buildRecovery(pendingSaleObj, result, new Error('database validation'));
    assert.equal(definite.attempt.pendingSaleObj, pendingSaleObj);
    assert.equal(definite.attempt.result, result);
    assert.match(definite.message, /without taking another payment/);
    const uncertainError = Object.assign(new Error('Connection interrupted. Refresh history.'), { commitUncertain: true });
    assert.equal(buildRecovery(pendingSaleObj, result, uncertainError).message, uncertainError.message);
    assert.throws(() => buildRecovery(pendingSaleObj, { success: false }, new Error('declined')), /Only a confirmed payment/);
  });

  test(`${label}: every confirmed payment preserves the same sale for save-only retry`, () => {
    const start = source.indexOf('console.error("Sale finalization failed", e);');
    const end = source.indexOf('return;', start);
    assert.ok(start >= 0 && end > start, 'payment finalization failure branch was not found');
    const finalizationFailure = source.slice(start, end);
    assert.match(finalizationFailure, /buildConfirmedPaymentSaveRecovery\(pendingSaleObj, result, e\)/);
    assert.match(finalizationFailure, /confirmedPaymentRef\.current = recovery\.attempt/);
    assert.match(finalizationFailure, /setSaveRetry\(true\)/);
    assert.doesNotMatch(finalizationFailure, /if \(e\?\.commitUncertain\)/);
    assert.match(source, /if \(saveRetry && !completedSale\)[\s\S]*Retry Saving Same Sale/);
    assert.match(source, /window\.addEventListener\("beforeunload", warnBeforeLeaving\)/);
    assert.match(source, /Close without saving\?[\s\S]*manual reconciliation/);
    assert.match(source, /const abandonConfirmedPaymentRecovery[\s\S]*confirmedPaymentRef\.current = null[\s\S]*onClose\(\)/);
  });
}

test('root and src application copies remain identical after POS changes', () => {
  assert.equal(root, src);
});
