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
  test(`${label}: modal uses viewport-safe scrolling and locks the page behind it`, () => {
    const modal = section(source, 'function Modal(', '// Level 3 print fallback UI');
    assert.match(modal, /document\.body\.style\.overflow = "hidden"/);
    assert.match(modal, /max-h-\[100dvh\] md:max-h-\[92dvh\]/);
    assert.match(modal, /overflow-hidden[\s\S]*flex flex-col/);
    assert.match(modal, /<div className="overflow-y-auto px-5 pb-6 min-h-0"/);
    assert.match(modal, /env\(safe-area-inset-bottom\)/);
    assert.match(modal, /role="dialog"/);
    assert.match(modal, /aria-label=\{translateUI\("Close"\)\}/);
  });

  test(`${label}: shared buttons and fields preserve disabled and responsive behavior`, () => {
    const controls = section(source, 'const inputStyle = ', 'function EmptyState(');
    assert.match(controls, /minWidth: 0/);
    assert.match(controls, /boxSizing: "border-box"/);
    assert.match(controls, /const Select = \(\{ dark, children, style, \.\.\.props \}\)/);
    assert.match(controls, /function GhostButton\(\{ children, onClick, dark, style, disabled = false, full = false/);
    assert.match(controls, /type=\{type\} disabled=\{disabled\}/);
  });

  test(`${label}: navigation and notifications honor scrolling and device safe areas`, () => {
    assert.match(source, /w-64 shrink-0 h-screen overflow-y-auto sticky top-0/);
    assert.match(source, /paddingBottom: "max\(0\.75rem, env\(safe-area-inset-bottom\)\)"/);
    assert.match(source, /role="status" aria-live="polite"/);
    assert.match(source, /top: "max\(1rem, env\(safe-area-inset-top\)\)"/);
  });

  test(`${label}: headers, cards and form grids adapt to narrow screens`, () => {
    const header = section(source, 'function SectionHeader(', 'function ProductImage(');
    assert.match(header, /flex flex-col sm:flex-row/);
    assert.match(header, /\[&>button\]:w-full sm:\[&>button\]:w-auto/);
    assert.match(source, /grid grid-cols-1 sm:grid-cols-2 gap-3/);
    assert.match(source, /grid grid-cols-1 sm:grid-cols-3 gap-3/);
    assert.match(source, /grid grid-cols-2 lg:grid-cols-4 gap-2/);
  });

  test(`${label}: shared text components translate messages and do not hide zero values`, () => {
    const confirm = section(source, 'function ConfirmDialog(', 'function Field(');
    const empty = section(source, 'function EmptyState(', 'function ListRow(');
    const list = section(source, 'function ListRow(', '/* ============================== NAV');
    assert.match(confirm, /typeof message === "string" \? translateUI\(message\) : message/);
    assert.match(empty, /typeof sub === "string" \? translateUI\(sub\) : sub/);
    assert.match(list, /right !== undefined && right !== null && right !== ""/);
    assert.match(list, /text-xs break-words/);
  });
}

test('root and src application copies remain identical after responsive UI changes', () => {
  assert.equal(root, src);
});
