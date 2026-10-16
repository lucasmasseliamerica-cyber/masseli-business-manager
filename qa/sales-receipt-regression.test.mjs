import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = ['App.jsx', 'src/App.jsx'];

function section(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `${startToken} section was not found`);
  return source.slice(start, end);
}

for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const customerReceipt = section(source, 'function renderCustomerReceiptBody', 'function renderKitchenTicketBody');
  const paymentReceipt = section(source, 'function renderPaymentReceiptBody', '// ---- Browser print adapter');
  const printingService = section(source, 'const printingService =', '/* ============================== AUTH SERVICE BOUNDARY');
  const saleDetail = section(source, 'function SaleDetailModal(', 'function NewSaleCustomerCreate(');

  test(`${file}: cancelled customer receipts identify reversal and its timestamp`, () => {
    assert.match(customerReceipt, /sale\.status === "cancelled"/);
    assert.match(customerReceipt, /"REVERSED"/);
    assert.match(customerReceipt, /sale\.cancelledAt/);
    assert.match(customerReceipt, /translateCurrent\("Reversed At"\)/);
  });

  test(`${file}: card receipt does not claim processor approval after app reversal`, () => {
    assert.match(paymentReceipt, /"REVERSED IN NEXALVO"/);
    assert.match(paymentReceipt, /getPaymentStatus\(sale\) === "failed" \? "DECLINED"/);
  });

  test(`${file}: prepared receipt title distinguishes sale and reversal`, () => {
    assert.match(printingService, /sale\.status === "cancelled" \? "Reversal Receipt" : "Customer Receipt"/);
    assert.match(printingService, /printDocumentHtml\(`\$\{label\} - Order/);
  });

  test(`${file}: historical cancelled sale can print receipts but cannot print a kitchen ticket`, () => {
    assert.match(saleDetail, /\{can\("manageSales"\) && \(/);
    assert.match(saleDetail, /translateUI\(cancelled \? "Reversal Receipt" : "Customer Receipt"\)/);
    const kitchenGuard = saleDetail.indexOf('{!cancelled && <GhostButton');
    const kitchenPrint = saleDetail.indexOf('printingService.prepareKitchenTicket', kitchenGuard);
    assert.ok(kitchenGuard >= 0 && kitchenPrint > kitchenGuard);
    assert.match(saleDetail, /CARD_PAYMENT_METHODS\.includes\(sale\.paymentMethod\)/);
  });
}

test('root and src application copies remain identical after receipt work', () => {
  assert.equal(readFileSync(new URL('../App.jsx', import.meta.url), 'utf8'), readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'));
});
