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

function shiftFunctions(source, now = '2026-10-15T12:00:00.000Z') {
  const implementation = section(source, 'function findOpenShift(', '// ---- Employee shift statistics');
  return Function(`let sequence = 0;
const nowISO = () => "${now}";
const uid = (prefix) => prefix + "-" + (++sequence);
${implementation}
return { findOpenShift, clockIn, clockOut, startBreak, endBreak, calculateBreakMinutes, calculateWorkedMinutes };`)();
}

for (const [label, source] of [['root App.jsx', root], ['src/App.jsx', src]]) {
  test(`${label}: clock, break and clock-out lifecycle is idempotent and timestamp-derived`, async () => {
    const api = shiftFunctions(source);
    let shifts = [];
    const employees = [{ id: 'employee-a', name: 'Alex', active: true }];
    const ctx = () => ({ shifts, employees, currentUser: { id: 'user-a' }, setShifts: async (next) => { shifts = next; } });
    const first = await api.clockIn({ employeeId: 'employee-a', locationId: 'location-a' }, ctx());
    assert.equal(first.success, true);
    assert.equal(shifts.length, 1);
    await api.clockIn({ employeeId: 'employee-a', locationId: 'location-a' }, ctx());
    assert.equal(shifts.length, 1, 'second clock-in must not create another open shift');
    await api.startBreak({ employeeId: 'employee-a' }, ctx());
    assert.equal(shifts[0].breaks.length, 1);
    await api.startBreak({ employeeId: 'employee-a' }, ctx());
    assert.equal(shifts[0].breaks.length, 1, 'second break start must be idempotent');
    const closed = await api.clockOut({ employeeId: 'employee-a' }, ctx());
    assert.equal(closed.shift.status, 'closed');
    assert.equal(closed.shift.breaks[0].endedAt, '2026-10-15T12:00:00.000Z', 'clock-out closes an active break');
    assert.equal(api.calculateWorkedMinutes(closed.shift, '2026-10-15T12:00:00.000Z'), 0);
  });

  test(`${label}: employee form protects salary, manager hierarchy and active locations`, () => {
    const crud = section(source, 'function SimpleCrudView(', 'function LocationsView(');
    const employees = section(source, 'function EmployeesView(', 'function TasksView(');
    assert.match(employees, /recordType="employee"/);
    assert.match(employees, /\.\.\.\(showRate \? \[\{ key: "hourlyRate"/);
    assert.match(crud, /recordType === "employee"/);
    assert.match(crud, /This reporting line would create a management cycle/);
    assert.match(crud, /Select an active manager/);
    assert.match(crud, /Select an active location/);
    assert.match(crud, /Hourly rate must be a non-negative number/);
    assert.doesNotMatch(crud, /title === "Employees"/);
    assert.match(crud, /translateUI\("Deactivate"\)/);
  });

  test(`${label}: shift UI reports rejected and uncertain operations instead of false success`, () => {
    const shiftCard = section(source, 'function MyShiftCard(', 'function EmployeesView(');
    assert.match(shiftCard, /const runShiftAction = async/);
    assert.match(shiftCard, /if \(!r\.success\) \{ showToast\(r\.error, "danger"\)/);
    assert.match(shiftCard, /e\?\.rpcSucceeded \? "good" : "danger"/);
    assert.match(shiftCard, /Select an active location before clocking in/);
    assert.match(shiftCard, /runShiftAction\(\(\) => startBreak/);
    assert.match(shiftCard, /runShiftAction\(\(\) => endBreak/);
  });

  test(`${label}: task forms validate assignment and failures while deletion requires confirmation`, () => {
    const tasks = section(source, 'function TasksView(', '/* ============================== REPORTS');
    assert.match(tasks, /const \[busyTaskId, setBusyTaskId\] = useState\(null\)/);
    assert.match(tasks, /Unable to update this task/);
    assert.match(tasks, /Select an active employee/);
    assert.match(tasks, /Select a valid priority/);
    assert.match(tasks, /notes: notes\.trim\(\)/);
    assert.match(tasks, /Unable to save this task/);
    assert.match(tasks, /Unable to delete this task/);
    assert.match(tasks, /Delete this task\?/);
  });
}

test('root and src application copies remain identical after employee workflow changes', () => {
  assert.equal(root, src);
});
