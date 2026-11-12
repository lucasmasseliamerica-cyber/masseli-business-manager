import test from 'node:test';
import assert from 'node:assert/strict';
import { staffSalaryIndicator } from './staff-salary-review.mjs';

const business = 'company-a';
const id = 'employee-1';
const row = { id, business_id: business };

test('salary evidence separates empty, omitted, masked and exposed without retaining values', () => {
  assert.equal(staffSalaryIndicator([], business, id), 'empty');
  assert.equal(staffSalaryIndicator([row], business, id), 'omitted');
  assert.equal(staffSalaryIndicator([{ ...row, hourly_rate: null }], business, id), 'null');
  for (const hourly_rate of [0, 12.3, '12.30']) {
    assert.equal(staffSalaryIndicator([{ ...row, hourly_rate }], business, id), 'exposed');
  }
  for (const hourly_rate of ['', false, -1, 'Infinity', {}]) {
    assert.equal(staffSalaryIndicator([{ ...row, hourly_rate }], business, id), 'invalid_value');
  }
  assert.equal(staffSalaryIndicator([{ ...row, business_id: 'company-b', hourly_rate: 1 }], business, id), 'wrong_scope');
  assert.equal(staffSalaryIndicator([{ ...row, id: 'someone-else' }], business, id), 'wrong_scope');
  assert.equal(staffSalaryIndicator([row, row], business, id), 'invalid_row_count');
});
