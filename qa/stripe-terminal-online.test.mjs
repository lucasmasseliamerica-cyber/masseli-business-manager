import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { inspectStripeTestFixtures } from './stripe-terminal-readonly.TEST.mjs';
import {
  TERMINAL_LABELS, newTerminalAttempt, checkTerminalOnline, reserveTerminalCharge,
  bindTerminalIntent, terminalInterrupted, terminalReconnected, reconcileTerminalIntent,
  terminalSaleCommitted, canStartTerminalCharge,
} from '../supabase/functions/_shared/terminal-online-core.mjs';

// Domain + reader/Stripe snapshots SIMULATED. No SDK, HTTP, Stripe account or payment is used.
const now = 10000;
const input = { businessId: 'tenant-a', saleId: 'sale-a', operationId: 'operation-a', readerId: 'reader-a', stripeAccountId: 'account-test', amountMinor: 1250, currency: 'brl' };
const proof = { projectRef: 'msinksoilkluooxenecy', livemode: false, offlineEnabled: false,
  checkedAt: now, businessId: input.businessId, stripeAccountId: input.stripeAccountId,
  readerId: input.readerId, backendStripeAuthenticated: true, readerStatus: 'online',
  readerBusy: false, network: 'wifi', modelSupportsNetwork: true };
const snapshot = (changes = {}, context = {}) => ({ accountId: input.stripeAccountId, ...context,
  intent: { id: 'pi_simulated_existing', livemode: false, amount: 1250, amount_received: 0, currency: 'brl',
    status: 'processing', metadata: { business_id: input.businessId, sale_id: input.saleId, operation_id: input.operationId }, ...changes } });
const processing = () => bindTerminalIntent(reserveTerminalCharge(newTerminalAttempt(input), proof, now), snapshot());
const succeeded = () => reconcileTerminalIntent(processing(), snapshot({ status: 'succeeded', amount_received: 1250 }));
const receipt = { committed: true, businessId: input.businessId, saleId: input.saleId, operationId: input.operationId, paymentIntentId: 'pi_simulated_existing' };

for (const network of ['wifi', 'ethernet', 'cellular']) {
  test(`SIMULATED reader: ${network} accepted only with verified model compatibility and backend connectivity`, () => {
    const attempt = newTerminalAttempt(input);
    assert.equal(checkTerminalOnline(attempt, { ...proof, network }, now), null);
    assert.equal(reserveTerminalCharge(attempt, { ...proof, network }, now).state, 'processing');
    assert.equal(checkTerminalOnline(attempt, { ...proof, network, modelSupportsNetwork: false }, now), 'READER_NETWORK_UNSUPPORTED');
  });
}

for (const [name, change] of Object.entries({
  'Wi-Fi alone': { backendStripeAuthenticated: false },
  'disconnected reader': { readerStatus: 'offline' },
  'busy reader': { readerBusy: true }, 'unknown busy state': { readerBusy: undefined },
  'offline enabled': { offlineEnabled: true }, 'offline unspecified': { offlineEnabled: undefined },
  'live mode': { livemode: true }, 'unknown mode': { livemode: undefined },
  'wrong project': { projectRef: 'another-project' }, 'wrong tenant': { businessId: 'tenant-b' },
  'wrong reader': { readerId: 'reader-b' }, 'wrong account': { stripeAccountId: 'other-account' },
  'stale evidence': { checkedAt: now - 5001 }, 'future evidence': { checkedAt: now + 1 },
  'missing evidence timestamp': { checkedAt: undefined }, 'unsupported transport': { network: 'bluetooth' },
})) {
  test(`SIMULATED reader preflight blocks ${name} before any charge reservation`, () => {
    const attempt = reserveTerminalCharge(newTerminalAttempt(input), { ...proof, ...change }, now);
    assert.equal(attempt.state, 'disconnected'); assert.equal(attempt.dispatched, false);
    assert.equal(attempt.paymentIntentId, null); assert.equal(attempt.finalized, false);
  });
}

test('server-priced integer minor units required; no NaN, fractions, zero or currency guessing', () => {
  for (const amountMinor of [NaN, Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => newTerminalAttempt({ ...input, amountMinor }));
  for (const currency of ['BRL', '', null, 'usdollars']) assert.throws(() => newTerminalAttempt({ ...input, currency }));
});

for (const reason of ['TIMEOUT', 'NETWORK_LOST', 'CANCEL_REQUESTED', 'READER_DISPLAY_APPROVED', 'PDV_RESTART']) {
  test(`SIMULATED ${reason}: unknown survives restart/reconnect and cannot reserve/create another charge`, () => {
    const prior = processing();
    const uncertain = terminalInterrupted(prior, reason);
    const restored = terminalReconnected(JSON.parse(JSON.stringify(uncertain)));
    assert.equal(restored.state, 'verifying'); assert.equal(restored.paymentIntentId, prior.paymentIntentId);
    assert.equal(restored.idempotencyKey, prior.idempotencyKey);
    assert.equal(canStartTerminalCharge(restored), false);
    assert.throws(() => reserveTerminalCharge(restored, proof, now), /RECONCILE_EXISTING_ATTEMPT/);
    assert.throws(() => terminalSaleCommitted(restored, receipt), /STRIPE_CONFIRMATION_REQUIRED/);
  });
}

test('lost PaymentIntent create response cannot create another intent when no ID was returned', () => {
  const uncertain = terminalInterrupted(reserveTerminalCharge(newTerminalAttempt(input), proof, now), 'CREATE_RESPONSE_LOST');
  assert.equal(uncertain.paymentIntentId, null); assert.equal(uncertain.state, 'verifying');
  assert.throws(() => reserveTerminalCharge(uncertain, proof, now), /RECONCILE_EXISTING_ATTEMPT/);
  // A verified webhook + authenticated retrieve can recover the original ID; never a new create.
  assert.equal(reconcileTerminalIntent(uncertain, snapshot()).paymentIntentId, 'pi_simulated_existing');
});

for (const status of ['processing', 'requires_action', 'requires_confirmation', 'requires_capture', 'requires_payment_method', 'unrecognized_future_status']) {
  test(`SIMULATED Stripe status ${status} never approves or changes inventory/finance`, () => {
    const attempt = reconcileTerminalIntent(processing(), snapshot({ status }));
    assert.equal(attempt.state, 'verifying'); assert.equal(attempt.stripeConfirmed, false);
    assert.throws(() => terminalSaleCommitted(attempt, receipt));
  });
}

test('only Stripe-confirmed decline/cancel releases an outcome; neither automatically creates another intent', () => {
  const declined = reconcileTerminalIntent(processing(), snapshot({ status: 'requires_payment_method', last_payment_error: { code: 'card_declined' } }));
  const canceled = reconcileTerminalIntent(processing(), snapshot({ status: 'canceled' }));
  assert.equal(declined.state, 'declined'); assert.equal(canceled.state, 'canceled');
  for (const attempt of [declined, canceled]) {
    assert.equal(canStartTerminalCharge(attempt), false);
    assert.throws(() => terminalSaleCommitted(attempt, receipt));
  }
});

test('succeeded in Stripe still requires the atomic backend sale/stock/ledger commit', () => {
  const confirmed = succeeded();
  assert.equal(confirmed.state, 'verifying'); assert.equal(confirmed.finalized, false);
  assert.equal(terminalSaleCommitted(confirmed, receipt).state, 'approved');
  for (const change of [{ committed: false }, { businessId: 'tenant-b' }, { saleId: 'sale-b' }, { operationId: 'operation-b' }, { paymentIntentId: 'pi_other' }]) {
    assert.throws(() => terminalSaleCommitted(confirmed, { ...receipt, ...change }), /SALE_COMMIT_MISMATCH/);
  }
});

test('mismatched Stripe amount, received amount, currency, identity/account/mode can never approve', () => {
  for (const changes of [{ amount: 1249 }, { amount_received: 1249 }, { currency: 'usd' }, { id: 'pi_other' }, { livemode: true }, { livemode: undefined }, { metadata: { business_id: 'tenant-b' } }]) {
    assert.throws(() => reconcileTerminalIntent(processing(), snapshot({ status: 'succeeded', amount_received: 1250, ...changes })));
  }
  assert.throws(() => reconcileTerminalIntent(processing(), snapshot({}, { accountId: 'other-account' })));
});

test('duplicate webhook and PDV restart reuse one confirmed sale; later stale events cannot undo approval', () => {
  // These are repeated domain inputs. Persistent SQL uniqueness/locking is a separate BLOCKED
  // integration requirement; this pure test does not prove a deployed ledger transaction.
  const approved = terminalSaleCommitted(succeeded(), receipt);
  assert.deepEqual(terminalSaleCommitted(approved, receipt), approved);
  assert.deepEqual(reconcileTerminalIntent(approved, snapshot({ status: 'processing' })), approved);
  assert.deepEqual(terminalReconnected(JSON.parse(JSON.stringify(approved))), approved);
  assert.equal(canStartTerminalCharge(approved), false);
});

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
function service(mode) {
  const a = source.indexOf('const PAYMENT_MODE ='), b = source.indexOf('/* ============================== SALE PAYMENT LIFECYCLE', a);
  const context = vm.createContext({ Promise, Date, Math, setTimeout });
  vm.runInContext(source.slice(a, b).replace('import.meta.env.VITE_CARD_PAYMENT_MODE', JSON.stringify(mode))
    + ';const CARD_PAYMENT_METHODS=["Credit Card","Debit Card"];globalThis.service=paymentService;', context);
  return context.service;
}

for (const mode of ['stripe_terminal', 'stripe', 'invalid-mode']) {
  test(`frontend ${mode} configuration fails closed instead of exposing manual approval`, async () => {
    const payment = service(mode); assert.equal(payment.getMode(), 'stripe_terminal');
    const handle = payment.processPayment({ paymentMethod: 'Credit Card', amount: 12.5, currency: 'BRL' });
    handle.approve(); handle.cancel();
    const result = await handle.promise;
    assert.equal(result.status, 'blocked'); assert.equal(result.success, false);
    assert.equal(result.transactionId, null); assert.equal(result.provider, 'stripe_terminal');
    assert.match(result.error.message, /Offline payments are not allowed/);
  });
}

test('Stripe client result cannot call manual sale finalizers; mode does not block cash or change defaults', async () => {
  assert.equal(service(undefined).getMode(), 'external');
  assert.equal(service('external').getMode(), 'external'); assert.equal(service('simulator').getMode(), 'simulator');
  assert.equal((await service('stripe_terminal').processPayment({ paymentMethod: 'Cash', amount: 12.5 }).promise).provider, 'cash');
  const handler = source.slice(source.indexOf('const handlePaymentResult ='), source.indexOf('const submit =', source.indexOf('const handlePaymentResult =')));
  assert.ok(handler.indexOf('result.provider === "stripe_terminal"') < handler.indexOf('if (result.success)'));
  assert.match(source, /disabled=\{submitting \|\| \(paymentService.getMode\(\) === "stripe_terminal"/);
});

test('six required Terminal status labels have PT/EN translations', () => {
  const i18n = readFileSync(new URL('../src/i18n.jsx', import.meta.url), 'utf8');
  for (const state of ['connected', 'disconnected', 'processing', 'verifying', 'approved', 'declined']) assert.ok(i18n.includes(`"${TERMINAL_LABELS[state]}":`));
});

test('Stripe TEST read-only probe refuses missing access, live keys, wrong target and unsafe identifiers without HTTP', async () => {
  const config = { branch: 'automation/nexalvo-qa-actions', projectUrl: 'https://msinksoilkluooxenecy.supabase.co', key: 'sk_test_simulated', readerId: 'tmr_simulated', intentId: 'pi_simulated', accountId: 'acct_simulated' };
  for (const change of [{ key: '' }, { key: 'sk_live_forbidden' }, { branch: 'main' }, { projectUrl: 'https://another.invalid' }, { intentId: '../unsafe' }]) {
    const report = await inspectStripeTestFixtures({ ...config, ...change }, () => { throw new Error('must not call'); });
    assert.equal(report.status, 'BLOCKED'); assert.equal(report.requests_mutating, 0);
    assert.notEqual(report.code, 'STRIPE_READ_UNAVAILABLE');
  }
});

test('SIMULATED Stripe TEST probe uses only fixed-host GETs and never treats read-only evidence as an approved real flow', async () => {
  const config = { branch: 'automation/nexalvo-qa-actions', projectUrl: 'https://msinksoilkluooxenecy.supabase.co', key: 'rk_test_simulated', readerId: 'tmr_simulated', intentId: 'pi_simulated', accountId: 'acct_simulated' };
  const calls = [];
  const responses = [{ id: config.accountId }, { livemode: false }, { id: config.readerId, livemode: false, status: 'online' }, { id: config.intentId, livemode: false, status: 'succeeded' }];
  const report = await inspectStripeTestFixtures(config, async (url, options) => {
    calls.push(url); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(new URL(url).origin, 'https://api.stripe.com');
    assert.equal(options.headers.Authorization, `Bearer ${config.key}`);
    return Response.json(responses[calls.length - 1]);
  });
  assert.equal(calls.length, 4); assert.equal(report.status, 'PASS');
  assert.equal(report.real_payment_flow, 'BLOCKED'); assert.equal(report.sale_stock_financial_finalization, 'BLOCKED');
  assert.doesNotMatch(JSON.stringify(report), /sk_test|rk_test|pi_simulated|tmr_simulated|acct_simulated/);
});

test('SIMULATED Stripe TEST probe sanitizes API/transport failures and requires live-mode fields to be explicitly false', async () => {
  const config = { branch: 'automation/nexalvo-qa-actions', projectUrl: 'https://msinksoilkluooxenecy.supabase.co', key: 'rk_test_simulated', readerId: 'tmr_simulated', intentId: 'pi_simulated', accountId: 'acct_simulated' };
  const denied = await inspectStripeTestFixtures(config, async () => Response.json({ error: 'sensitive-data' }, { status: 403 }));
  assert.equal(denied.code, 'STRIPE_HTTP_403'); assert.doesNotMatch(JSON.stringify(denied), /sensitive-data/);
  const missingMode = await inspectStripeTestFixtures(config, async () => Response.json({}));
  assert.equal(missingMode.checks.test_mode_confirmed, 'FAIL');
  const timeout = await inspectStripeTestFixtures(config, async () => { throw new Error(config.key); });
  assert.equal(timeout.code, 'STRIPE_READ_UNAVAILABLE'); assert.doesNotMatch(JSON.stringify(timeout), /rk_test/);
});
