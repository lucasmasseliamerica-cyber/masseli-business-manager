// Synthetic calendar inputs; actual application functions, no network or persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const file of ['../App.jsx','../src/App.jsx']){
 const source=readFileSync(new URL(file,import.meta.url),'utf8');
 const helpers=source.slice(source.indexOf('const businessNow ='),source.indexOf('/* ---- end centralized local-date utility ---- */'));
 const alerts=source.slice(source.indexOf('function evaluateProcurementAlerts('),source.indexOf('function evaluateLaborAlerts('));
 const api=Function(`${helpers}\nconst ALERT_THRESHOLDS={poOverdueCriticalDays:3};\n${alerts}\nreturn {setActiveTimezone,evaluateProcurementAlerts};`)();
 const order={id:'synthetic',poNumber:'SYNTHETIC',status:'Ordered',expectedDate:'2026-11-02'};
 test(`${file}: procurement follows business midnight, not UTC midnight`,()=>{
  api.setActiveTimezone('America/New_York');
  assert.equal(api.evaluateProcurementAlerts([order],new Date('2026-11-03T04:59:59Z').getTime()).length,0);
  const rows=api.evaluateProcurementAlerts([order],new Date('2026-11-03T05:00:00Z').getTime());
  assert.equal(rows.length,1);assert.match(rows[0].message,/Expected 1 day ago/);
 });
 test(`${file}: DST and positive offsets use civil-day count at the critical threshold`,()=>{
  api.setActiveTimezone('America/New_York');
  const [row]=api.evaluateProcurementAlerts([{...order,expectedDate:'2026-03-07',status:'Partially Received'}],new Date('2026-03-10T04:00:00Z').getTime());
  assert.equal(row.severity,'critical');assert.equal(row.type,'po_partial_overdue');assert.match(row.message,/Expected 3 days ago/);
  api.setActiveTimezone('Pacific/Kiritimati');
  assert.equal(api.evaluateProcurementAlerts([order],new Date('2026-11-02T10:00:00Z').getTime()).length,1);
 });
 test(`${file}: invalid dates, due-today and terminal orders never produce overdue alerts`,()=>{
  api.setActiveTimezone('UTC');const now=Date.parse('2026-11-03T12:00:00Z');
  for(const expectedDate of ['2026-02-30','invalid','','2026-11-03','2026-11-04'])assert.equal(api.evaluateProcurementAlerts([{...order,expectedDate}],now).length,0);
  for(const status of ['Cancelled','Received','Reversed'])assert.equal(api.evaluateProcurementAlerts([{...order,status}],now).length,0);
 });
}
test('root and src remain byte-identical',()=>assert.deepEqual(readFileSync(new URL('../App.jsx',import.meta.url)),readFileSync(new URL('../src/App.jsx',import.meta.url))));
