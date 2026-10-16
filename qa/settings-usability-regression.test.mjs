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

  test(`${file}: configured timezone controls business calendar boundaries`, () => {
    const context = vm.createContext({ Date, Intl, Object, String, Number });
    vm.runInContext(section(source, 'const businessNow =', '/* ---- end centralized local-date utility') + ';globalThis.api={setActiveTimezone,localDateStr};', context);
    context.api.setActiveTimezone('America/Los_Angeles');
    assert.equal(context.api.localDateStr(new Date('2026-01-02T02:00:00.000Z')), '2026-01-01');
    context.api.setActiveTimezone('America/Sao_Paulo');
    assert.equal(context.api.localDateStr(new Date('2026-01-02T02:00:00.000Z')), '2026-01-01');
    context.api.setActiveTimezone('invalid/timezone');
    assert.equal(context.api.localDateStr(new Date('2026-01-02T12:00:00.000Z')), '2026-01-02');
  });

  test(`${file}: business settings validation rejects unsafe values and normalizes lists`, () => {
    const context = vm.createContext({ Intl, Object, String, Number, Set });
    vm.runInContext(
      section(source, 'const CURRENCY_SYMBOLS =', 'let _activeCurrency') +
      section(source, 'const BUSINESS_TIMEZONES =', 'const localDateStr') +
      section(source, 'const SETTINGS_LIST_MAP =', 'function useSupabaseBusinessSettings') +
      ';globalThis.validate=validateBusinessSettings;',
      context,
    );
    const base = {
      businessName: ' NEXALVO QA ', currency: 'USD', taxRate: '7.25', timezone: 'America/New_York',
      paymentMethods: [' Cash '], channels: ['Store'], expenseCategories: ['Other'],
      productCategories: ['Products'], inventoryCategories: ['Supplies'], units: ['Units'],
    };
    const valid = context.validate(base);
    assert.equal(valid.ok, true);
    assert.equal(valid.value.businessName, 'NEXALVO QA');
    assert.equal(valid.value.taxRate, 7.25);
    assert.deepEqual(JSON.parse(JSON.stringify(valid.value.paymentMethods)), ['Cash']);
    for (const patch of [
      { businessName: ' ' }, { currency: 'MAGIC' }, { taxRate: 'NaN' }, { taxRate: -1 },
      { taxRate: 101 }, { timezone: 'not/a-zone' }, { paymentMethods: [] },
      { paymentMethods: ['Cash', ' cash '] },
    ]) assert.equal(context.validate({ ...base, ...patch }).ok, false);
  });

  test(`${file}: settings UI exposes timezone and preserves raw invalid tax input`, () => {
    const view = section(source, 'function SettingsView', '// Owner-only, experimental');
    assert.match(view, /label=\{translateUI\("Business Timezone"\)\}/);
    assert.match(view, /BUSINESS_TIMEZONES\.map/);
    assert.match(view, /taxRate: e\.target\.value/);
    assert.doesNotMatch(view, /taxRate: Math\.max/);
    assert.match(view, /const validation = validateBusinessSettings\(form\)/);
  });

  test(`${file}: persistence validates before the first settings write`, () => {
    const hook = section(source, 'function useSupabaseBusinessSettings', '/* ============================== SUPABASE DATA — PHASE 2');
    const validationIndex = hook.indexOf('const validation = validateBusinessSettings(next)');
    const updateIndex = hook.indexOf('supabaseRest.updateOne("businesses"');
    assert.ok(validationIndex >= 0 && updateIndex > validationIndex);
    assert.match(hook, /timezone: safe\.timezone/);
    assert.match(source, /setActiveCurrency\(displaySettings\.currency\)[\s\S]*setActiveTimezone\(displaySettings\.timezone\)/);
  });
}

test('root and src application copies remain identical after settings work', () => {
  assert.equal(
    readFileSync(new URL('../App.jsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  );
});
