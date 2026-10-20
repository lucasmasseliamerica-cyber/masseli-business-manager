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

function analytics(source) {
  const implementation = [
    section(source, 'function saleNetRevenue(', '// Safe percentage change'),
    section(source, 'function getSalesAnalytics(', '// ---- Revenue Trend'),
    section(source, 'function getProductPerformance(', '// ---- Channel / Location'),
    section(source, 'function getCustomerAnalytics(', '// ---- Loyalty analytics'),
    section(source, 'function getOrderAnalytics(', '/* ============================== SHIFTS'),
  ].join('\n');
  return Function(`
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const withinRange = (iso, range) => { const value = new Date(iso).getTime(); return value >= range.start.getTime() && value <= range.end.getTime(); };
const filterSalesByRange = (sales, range) => (sales || []).filter((sale) => sale.status !== "cancelled" && withinRange(sale.date, range));
${implementation}
return { saleNetRevenue, getSalesAnalytics, getProductPerformance, getCustomerAnalytics, getOrderAnalytics };`)();
}

const range = { start: new Date('2026-10-01T00:00:00.000Z'), end: new Date('2026-10-31T23:59:59.999Z') };
const sales = [
  { id: 'prior', date: '2026-09-20T12:00:00.000Z', status: 'completed', customerId: 'c1', subtotal: 100, discount: 0, tax: 10, total: 110, items: [] },
  { id: 'one', date: '2026-10-10T12:00:00.000Z', status: 'completed', customerId: 'c1', subtotal: 100, discount: 10, tax: 9, total: 99,
    productionStartedAt: '2026-10-10T12:01:00.000Z', readyAt: '2026-10-10T12:11:00.000Z', completedAt: '2026-10-10T12:21:00.000Z',
    items: [{ productId: 'p1', name: 'One', qty: 1, unitPrice: 60 }, { productId: 'p2', name: 'Two', qty: 1, unitPrice: 40 }] },
  { id: 'two', date: '2026-10-11T12:00:00.000Z', status: 'completed', customerId: 'c2', subtotal: 50, discount: 0, tax: 5, total: 55,
    productionStartedAt: '2026-10-11T12:20:00.000Z', readyAt: '2026-10-11T12:10:00.000Z', completedAt: 'invalid', items: [] },
  { id: 'cancelled', date: '2026-10-12T12:00:00.000Z', status: 'cancelled', customerId: 'c1', subtotal: 500, discount: 0, tax: 50, total: 550,
    productionStartedAt: '2026-10-12T12:00:00.000Z', readyAt: '2026-10-12T13:00:00.000Z', completedAt: '2026-10-12T14:00:00.000Z', items: [] },
];

for (const [label, source] of [['root App.jsx', root], ['src/App.jsx', src]]) {
  test(`${label}: revenue excludes collected tax and allocates discounts across products`, () => {
    const api = analytics(source);
    assert.equal(api.saleNetRevenue({ total: 55, tax: 5 }), 50, 'legacy rows fall back to total minus tax');
    const totals = api.getSalesAnalytics(sales, range);
    assert.deepEqual(totals, { grossSales: 150, discounts: 10, netSales: 140, taxCollected: 14, totalRevenue: 140, orders: 2, avgOrderValue: 70 });
    const products = api.getProductPerformance(sales, range);
    assert.equal(products.byRevenue.find((product) => product.productId === 'p1').revenue, 54);
    assert.equal(products.byRevenue.find((product) => product.productId === 'p2').revenue, 36);
    assert.equal(products.byRevenue.reduce((sum, product) => sum + product.pctOfSales, 0), 64.28);
  });

  test(`${label}: customer and production metrics remain inside the selected period and ignore invalid durations`, () => {
    const api = analytics(source);
    const customers = api.getCustomerAnalytics([{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }], sales, range);
    const first = customers.topCustomers.find((entry) => entry.customer.id === 'c1');
    assert.equal(first.stats.totalOrders, 1);
    assert.equal(first.stats.totalSpent, 99, 'prior and cancelled sales cannot leak into the selected range');
    assert.equal(customers.returningCustomers, 1);
    const orders = api.getOrderAnalytics(sales, range);
    assert.equal(orders.avgPrepMinutes, 10, 'negative and cancelled prep durations are excluded');
    assert.equal(orders.avgFulfillMinutes, 21, 'invalid and cancelled fulfillment durations are excluded');
  });

  test(`${label}: report UI validates custom dates and presents tax separately`, () => {
    const reports = section(source, 'function ReportsView(', '/* ============================== SETTINGS');
    assert.match(reports, /const validDateInput = isValidCalendarDate/);
    assert.match(reports, /!validDateInput\(customStart\) \|\| !validDateInput\(customEnd\)/);
    assert.match(reports, /Net Sales \(excluding tax\)/);
    assert.match(reports, /Tax Collected/);
    assert.match(reports, /dateStrLocal\(localDateStr\(range\.start\)\)/);
  });
}

test('root and src application copies remain identical after report accuracy changes', () => {
  assert.equal(root, src);
});
