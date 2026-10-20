// Backend domain policy. Not an HTTP endpoint or a Stripe SDK adapter. Inputs must come from
// authenticated Stripe API calls and a tenant-authorized, server-priced sale, never a browser
// result, reader display, navigator.onLine or an unsigned webhook. No I/O or offline queue.
export const TERMINAL_LABELS = Object.freeze({
  connected: 'Connected', disconnected: 'Disconnected', processing: 'Processing',
  verifying: 'Verifying payment', approved: 'Approved', declined: 'Declined', canceled: 'Canceled',
});
export const TERMINAL_NETWORKS = Object.freeze(['wifi', 'ethernet', 'cellular']);
const UNRESOLVED = new Set(['processing', 'verifying']);

function required(value) { return typeof value === 'string' && value.trim().length > 0; }
function invariant(condition, code) { if (!condition) throw new Error(code); }

export function newTerminalAttempt(input) {
  for (const key of ['businessId', 'saleId', 'operationId', 'readerId', 'stripeAccountId']) {
    invariant(required(input[key]), 'TERMINAL_IDENTITY_REQUIRED');
  }
  invariant(Number.isSafeInteger(input.amountMinor) && input.amountMinor > 0, 'TERMINAL_INVALID_AMOUNT');
  invariant(/^[a-z]{3}$/.test(input.currency), 'TERMINAL_INVALID_CURRENCY');
  const { businessId, saleId, operationId, readerId, stripeAccountId, amountMinor, currency } = input;
  return { businessId, saleId, operationId, readerId, stripeAccountId, amountMinor, currency,
    idempotencyKey: `terminal:${businessId}:${operationId}`, paymentIntentId: null,
    state: 'disconnected', dispatched: false, stripeConfirmed: false, finalized: false };
}

// Evidence is produced by a server adapter, not accepted from a client. Model/network support
// is verified against account/country/firmware-specific configuration; Wi-Fi alone proves nothing.
export function checkTerminalOnline(attempt, evidence, now = Date.now()) {
  const age = now - evidence?.checkedAt;
  if (!Number.isFinite(age) || age < 0 || age > 5000) return 'STALE_CONNECTIVITY';
  if (evidence.projectRef !== 'msinksoilkluooxenecy' || evidence.livemode !== false) return 'TEST_ONLY';
  if (evidence.offlineEnabled !== false) return 'OFFLINE_FORBIDDEN';
  if (evidence.businessId !== attempt.businessId || evidence.stripeAccountId !== attempt.stripeAccountId || evidence.readerId !== attempt.readerId) return 'READER_SCOPE_MISMATCH';
  if (evidence.backendStripeAuthenticated !== true) return 'STRIPE_UNREACHABLE';
  if (evidence.readerStatus !== 'online' || evidence.readerBusy !== false) return 'READER_UNAVAILABLE';
  if (!TERMINAL_NETWORKS.includes(evidence.network) || evidence.modelSupportsNetwork !== true) return 'READER_NETWORK_UNSUPPORTED';
  return null;
}

// Persist the returned reservation in the backend BEFORE making the first Stripe write. A
// unique (business,sale) unresolved attempt and lock prevent another tab/device from charging.
export function reserveTerminalCharge(attempt, evidence, now = Date.now()) {
  invariant(!attempt.dispatched && !attempt.finalized, 'RECONCILE_EXISTING_ATTEMPT');
  const reason = checkTerminalOnline(attempt, evidence, now);
  if (reason) return { ...attempt, state: 'disconnected', reason };
  return { ...attempt, state: 'processing', dispatched: true, reason: null };
}

function assertIntent(attempt, snapshot) {
  const { intent, accountId } = snapshot || {};
  invariant(accountId === attempt.stripeAccountId && intent?.livemode === false, 'STRIPE_SCOPE_MISMATCH');
  invariant(/^pi_[A-Za-z0-9_]+$/.test(intent.id), 'STRIPE_INTENT_REQUIRED');
  invariant(!attempt.paymentIntentId || intent.id === attempt.paymentIntentId, 'STRIPE_INTENT_CHANGED');
  invariant(intent.amount === attempt.amountMinor && intent.currency === attempt.currency, 'STRIPE_AMOUNT_MISMATCH');
  invariant(intent.metadata?.business_id === attempt.businessId && intent.metadata?.sale_id === attempt.saleId && intent.metadata?.operation_id === attempt.operationId, 'STRIPE_METADATA_MISMATCH');
  return intent;
}

// Save the ID before reader processing. An interrupted create with no returned ID remains
// unknown: do not repeat create, even with the same key; recover by verified webhook/operator.
export function bindTerminalIntent(attempt, snapshot) {
  invariant(attempt.dispatched, 'CHARGE_NOT_RESERVED');
  const intent = assertIntent(attempt, snapshot);
  return { ...attempt, paymentIntentId: intent.id };
}

export function terminalInterrupted(attempt, reason = 'TRANSPORT_UNKNOWN') {
  if (attempt.finalized) return attempt;
  if (!attempt.dispatched) return { ...attempt, state: 'disconnected', reason };
  return { ...attempt, state: 'verifying', reason };
}

export function terminalReconnected(attempt) {
  // Restored connectivity does not resolve a prior debit, timeout, cancellation or restart.
  return attempt.dispatched && !attempt.finalized ? terminalInterrupted(attempt, 'RECONCILIATION_REQUIRED') : attempt;
}

// Run ONLY after authenticated retrievePaymentIntent in the correct Stripe account. A signed
// event is a notification to retrieve, not the final status: duplicates/out-of-order events must
// always re-read Stripe. requires_capture is NOT a completed payment.
export function reconcileTerminalIntent(attempt, snapshot) {
  invariant(attempt.dispatched, 'CHARGE_NOT_RESERVED');
  const intent = assertIntent(attempt, snapshot);
  if (attempt.finalized) return attempt;
  const current = { ...attempt, paymentIntentId: intent.id, stripeStatus: intent.status };
  if (intent.status === 'succeeded') {
    invariant(intent.amount_received === attempt.amountMinor, 'STRIPE_RECEIVED_MISMATCH');
    return { ...current, state: 'verifying', stripeConfirmed: true, reason: 'SALE_COMMIT_REQUIRED' };
  }
  if (intent.status === 'canceled' && intent.amount_received === 0) {
    return { ...current, state: 'canceled', stripeConfirmed: false, reason: null };
  }
  if (intent.status === 'requires_payment_method' && intent.last_payment_error && intent.amount_received === 0) {
    return { ...current, state: 'declined', stripeConfirmed: false, reason: 'CARD_DECLINED' };
  }
  return { ...current, state: 'verifying', stripeConfirmed: false, reason: 'STRIPE_NOT_FINAL' };
}

// The receipt must be read from the committed backend transaction that finalized the sale,
// stock and financial entries together. It is NOT a client-supplied proof of payment.
export function terminalSaleCommitted(attempt, receipt) {
  invariant(attempt.stripeConfirmed && attempt.stripeStatus === 'succeeded', 'STRIPE_CONFIRMATION_REQUIRED');
  invariant(receipt?.committed === true && receipt.businessId === attempt.businessId && receipt.saleId === attempt.saleId && receipt.operationId === attempt.operationId && receipt.paymentIntentId === attempt.paymentIntentId, 'SALE_COMMIT_MISMATCH');
  return { ...attempt, state: 'approved', finalized: true, reason: null };
}

export function canStartTerminalCharge(attempt) {
  // A decline/cancel must not create a fresh attempt automatically. Explicit retry must first
  // close/reconcile the durable reservation under a backend lock; not implemented here.
  return !attempt.dispatched && !attempt.finalized && !UNRESOLVED.has(attempt.state);
}
