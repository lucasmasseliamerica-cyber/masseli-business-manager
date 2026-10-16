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

function customerValidator(source) {
  const declarations = ['normalizePhone', 'normalizeEmail', 'normalizeCustomerName'].map((name) => {
    const match = source.match(new RegExp(`const ${name} = [^\\n]+;`));
    assert.ok(match, `${name} was not found`);
    return match[0];
  });
  return Function(`const todayStr = () => "2026-10-15";
${declarations.join('\n')}
${section(source, 'function findDuplicateCustomer(', 'function validateCustomerProfile(')}
${section(source, 'function validateCustomerProfile(', 'function searchCustomers(')}
return validateCustomerProfile;`)();
}

for (const [label, source] of [['root App.jsx', root], ['src/App.jsx', src]]) {
  test(`${label}: customer profile validator enforces contact uniqueness and data quality`, () => {
    const validate = customerValidator(source);
    const customers = [
      { id: 'a', name: 'Jane Doe', phone: '+1 (212) 555-0199', email: 'jane@example.com', active: true },
      { id: 'z', name: 'Archived', phone: '5550000000', email: 'archived@example.com', active: false },
    ];
    assert.equal(validate(customers, { name: ' ', phone: '', email: '' }).error, 'Enter a name.');
    assert.match(validate(customers, { name: 'John', phone: '123', email: '' }).error, /valid phone/);
    assert.match(validate(customers, { name: 'John', phone: '', email: 'invalid' }).error, /valid email/);
    assert.match(validate(customers, { name: 'John', phone: '', email: '', birthday: '2025-02-30' }).error, /valid birthday/);
    assert.match(validate(customers, { name: 'John', phone: '12125550199', email: '' }).error, /already uses this phone/);
    assert.match(validate(customers, { name: 'John', phone: '', email: 'JANE@EXAMPLE.COM' }).error, /already uses this email/);
    assert.equal(validate(customers, { name: 'Jane Doe', phone: '', email: '' }).success, true, 'name-only match remains a soft warning');
    assert.equal(validate(customers, { customerId: 'a', name: ' Jane Doe ', phone: '+1 (212) 555-0199', email: 'JANE@EXAMPLE.COM' }).success, true, 'editing the same record is allowed');
  });

  test(`${label}: create and edit share validation and normalize editable fields`, () => {
    const management = section(source, 'async function createCustomer(', '// Archiving, never destructive deletion');
    const modal = section(source, 'function CustomerCreateModal(', 'function CustomerDetailModal(');
    assert.match(management, /validateCustomerProfile\(customers, \{ name, phone, email, birthday \}\)/);
    assert.match(management, /validateCustomerProfile\(customers, \{[\s\S]*customerId/);
    assert.match(management, /notes: \(notes \|\| ""\)\.trim\(\)/);
    assert.match(management, /notes: \(patch\.notes \?\? existing\.notes \?\? ""\)\.trim\(\)/);
    assert.match(source, /async function restoreCustomer[\s\S]*validateCustomerProfile\(customers, \{ customerId, name: existing\.name/);
    assert.match(modal, /customer \? await updateCustomer\(customer\.id, values, ctx\) : await createCustomer/);
    assert.match(modal, /Save Changes/);
  });

  test(`${label}: customer history and archive states preserve financial and error controls`, () => {
    const detail = section(source, 'function CustomerDetailModal(', 'function CustomersView(');
    assert.match(detail, /if \(!canManage\) \{ setError\("You don't have permission to manage customers\."/);
    assert.match(detail, /Unable to archive customer/);
    assert.match(detail, /Unable to restore customer/);
    assert.match(detail, /can\("viewFinancials"\) \? ` · \$\{translateUI\(s\.paymentMethod\)\}` : ""/);
    assert.match(detail, /can\("viewFinancials"\) && <div[^>]+>\{fmtMoney\(s\.total\)\}/);
  });
}

test('root and src application copies remain identical after customer changes', () => {
  assert.equal(root, src);
});
