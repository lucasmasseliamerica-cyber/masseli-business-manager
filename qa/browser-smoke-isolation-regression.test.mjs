import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('./browser-smoke.test.mjs',import.meta.url),'utf8');
const start=source.indexOf("await t.test('P0.05 UI purchase form validates bad inputs and submits mocked valid order'");
const end=source.indexOf("await t.test('dashboard desktop screenshot was captured'",start);
assert.ok(start>=0&&end>start,'isolated purchase browser group must exist');
const group=source.slice(start,end);

test('purchase browser validation isolates every mutable form fixture',()=>{
 for(const token of [
  "purchasePage.route('**/rest/v1/suppliers?*'",
  "purchasePage.route('**/rest/v1/locations?*'",
  "purchasePage.route('**/rest/v1/inventory_items?*'",
  "purchasePage.route('**/rest/v1/rpc/fn_read_inventory_stock_secure?*'",
  "purchasePage.route('**/rest/v1/rpc/fn_read_inventory_transactions_secure?*'",
 ]) assert.ok(group.includes(token),`missing isolated route: ${token}`);
 assert.match(group,/Do not fake suppliers for another tenant/);
 assert.match(group,/Do not fake locations for another tenant/);
 assert.match(group,/Do not fake inventory for another tenant/);
});

test('purchase browser validation keeps every creation write mocked and counted',()=>{
 assert.match(group,/purchasePage\.route\('\*\*\/rest\/v1\/rpc\/fn_create_purchase_order\*'/);
 assert.match(group,/writeCalls\+\+/);
 assert.match(group,/if\(!allowMockSuccess\) return route\.abort\(\)/);
 assert.match(group,/Exactly one mocked draft-creation request expected/);
 assert.match(group,/No purchase-create RPC should be sent in any invalid scenario/);
});

test('browser smoke remains authenticated and persistent purchases stay absent',()=>{
 assert.match(source,/QA_TWO_TENANT_B_EMAIL/);
 assert.match(source,/QA_TWO_TENANT_B_PASSWORD/);
 assert.doesNotMatch(source,/p0-purchase-browser-persistent\.TEST/);
});

test('boundary scenarios satisfy earlier guards before testing their intended rule',()=>{
 const saleStart=source.indexOf("P0.03 UI sale rejects discount greater than subtotal without write RPC");
 const saleEnd=source.indexOf("P0.04 UI inventory form rejects unnamed",saleStart);
 const sale=source.slice(saleStart,saleEnd);
 assert.ok(sale.indexOf("+ Add another product")<sale.indexOf("Discount ($)"),'sale must add a line before testing discount');
 assert.match(source,/Select an active supplier\|same inventory item can't appear more than once/);
});
