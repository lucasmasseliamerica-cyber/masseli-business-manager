import assert from 'node:assert/strict';

export function staffSalaryIndicator(value, businessId, employeeId) {
  if (!Array.isArray(value)) return 'invalid_response';
  if (!value.length) return 'empty';
  if (value.length !== 1) return 'invalid_row_count';
  const row = value[0];
  if (!row || row.business_id !== businessId || row.id !== employeeId) return 'wrong_scope';
  if (!Object.hasOwn(row, 'hourly_rate')) return 'omitted';
  if (row.hourly_rate === null) return 'null';
  const rate = row.hourly_rate;
  const valid = typeof rate === 'number' || (typeof rate === 'string' && /^\d+(?:\.\d+)?$/.test(rate));
  return valid && Number.isFinite(Number(rate)) && Number(rate) >= 0 ? 'exposed' : 'invalid_value';
}

export function buildStaffSalaryRevision(basePlan, initialCheckpoint, completedReads) {
  const base = basePlan.authenticated_read_plan;
  assert.deepEqual(Object.keys(base).sort(), ['after_G1', 'after_G2', 'baseline']);
  assert.equal(base.baseline.length, 51);
  assert.equal(completedReads.length, 25);
  assert.equal(initialCheckpoint.staff_audits.length, 8);
  assert.equal(new Set(base.baseline.map(check => check.id)).size, base.baseline.length);
  for (const [i, receipt] of completedReads.entries()) {
    assert.equal(receipt.id, base.baseline[i].id);
    assert.equal(receipt.http, 200);
    assert.equal(receipt.passed, i < 24);
  }
  assert.equal(completedReads.at(-1).id, 'MANAGER-salary');

  const probes = [];
  const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/i.test(id);
  const makeProbe = (check, employeeId, state, id = check.id) => {
    assert(validId(employeeId));
    const url = new URL(check.path, 'https://nexalvo.invalid');
    assert.equal(url.pathname, '/rest/v1/rpc/fn_read_employees_secure');
    assert.deepEqual([...url.searchParams.keys()], ['select', 'id']);
    assert.equal(url.searchParams.get('select'), 'id,business_id,hourly_rate');
    url.searchParams.set('id', 'eq.' + employeeId);
    return { id, actor: check.actor, path: url.pathname + url.search, expect: { salary_state: state, employee_id: employeeId } };
  };
  for (const check of base.baseline.slice(24)) {
    if (!['MANAGER-salary', 'EMPLOYEE-salary'].includes(check.id)) {
      probes.push(check);
      continue;
    }
    const stage = basePlan.setup.find(step => step.id === (check.actor === 'MANAGER' ? 'ATIVAR-M' : 'ATIVAR-E'));
    const profile = initialCheckpoint.profiles.find(row => row.role === check.actor && row.id === stage?.target_id);
    const linked = initialCheckpoint.employees.find(row => row.id === stage?.expected_after?.employee_id);
    const unrelatedId = new URL(check.path, 'https://nexalvo.invalid').searchParams.get('id')?.slice(3);
    const unrelated = initialCheckpoint.employees.find(row => row.id === unrelatedId);
    assert(profile && profile.active === false && linked && linked.business_id === profile.business_id && unrelated &&
      unrelated.business_id === profile.business_id && unrelated.id !== linked.id && unrelated.manager_id !== linked.id,
    'STAFF_SALARY_FIXTURE_DRIFT');
    const defaults = initialCheckpoint.role_defaults.filter(row => row.role === check.actor);
    assert(defaults.some(row => row.permission_key === 'manageUsers' && row.granted === false));
    assert(defaults.some(row => row.permission_key === 'viewFinancials' && row.granted === (check.actor === 'MANAGER')));
    probes.push(makeProbe(check, linked.id, check.actor === 'MANAGER' ? 'exposed' : 'null'));
    probes.push(makeProbe(check, unrelated.id, 'empty', check.actor + '-salary-unrelated'));
  }
  assert.equal(probes.length, 29);
  return { ...basePlan, authenticated_read_plan: { ...base, baseline: probes } };
}
