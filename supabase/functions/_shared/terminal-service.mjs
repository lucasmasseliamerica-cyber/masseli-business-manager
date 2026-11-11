import { bindTerminalIntent, checkTerminalOnline, newTerminalAttempt, reconcileTerminalIntent, terminalSaleCommitted } from './terminal-online-core.mjs';
import { TerminalRequestError, terminalIntentFields } from './terminal-stripe.mjs';

export const TERMINAL_TEST_PROJECT = 'msinksoilkluooxenecy';
export const terminalUuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const closedStates = new Set(['approved', 'canceled', 'declined']);
const paymentEvents = new Set(['payment_intent.created', 'payment_intent.succeeded', 'payment_intent.payment_failed', 'payment_intent.canceled']);

function validKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
}

export function parseTerminalRequest(input) {
  const invalid = () => { throw new TerminalRequestError('TERMINAL_REQUEST_INVALID', 400); };
  if (!terminalUuid(input?.location_id)) invalid();
  const common = ['action', 'location_id'];
  if (input.action === 'readiness') {
    if (!validKeys(input, common)) invalid();
    return input;
  }
  if (!terminalUuid(input.operation_id)) invalid();
  common.push('operation_id');
  if (input.action === 'status' || input.action === 'cancel') {
    if (!validKeys(input, common)) invalid();
    return input;
  }
  if (input.action !== 'start' || !validKeys(input, [...common, 'sale_id', 'items', 'channel', 'employee_id', 'customer_id',
    'fulfillment_status', 'notes', 'expected_amount_minor', 'discount_minor'])) invalid();
  if (!terminalUuid(input.sale_id) || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50 ||
      !input.items.every(item => validKeys(item, ['product_id', 'qty']) && terminalUuid(item.product_id) &&
        Number.isFinite(item.qty) && item.qty >= 0.001 && item.qty <= 9999) ||
      new Set(input.items.map(item => item.product_id)).size !== input.items.length ||
      !Number.isSafeInteger(input.expected_amount_minor) || input.expected_amount_minor < 50 || input.expected_amount_minor > 99999999 ||
      !Number.isSafeInteger(input.discount_minor) || input.discount_minor < 0 || input.discount_minor > 99999999 ||
      typeof input.channel !== 'string' || input.channel.trim() !== input.channel || input.channel.length < 1 || input.channel.length > 80 ||
      !['Received', 'Preparing', 'Ready', 'Completed'].includes(input.fulfillment_status) ||
      (input.notes != null && (typeof input.notes !== 'string' || input.notes.length > 1000)) ||
      (input.employee_id != null && !terminalUuid(input.employee_id)) ||
      (input.customer_id != null && !terminalUuid(input.customer_id))) invalid();
  return input;
}

function domainAttempt(row) {
  return {
    ...newTerminalAttempt({ businessId: row.business_id, saleId: row.sale_id, operationId: row.operation_id,
      readerId: row.binding.reader_id, stripeAccountId: row.binding.stripe_account_id, amountMinor: row.amount_minor, currency: 'usd' }),
    dispatched: Boolean(row.create_reserved_at), paymentIntentId: row.payment_intent_id ?? null,
    stripeStatus: row.stripe_status, stripeConfirmed: row.stripe_confirmed === true,
    finalized: Boolean(row.committed_at), state: row.state,
  };
}

function view(row, override) {
  return {
    operation_id: row.operation_id, sale_id: row.sale_id, amount_minor: row.amount_minor, currency: 'usd',
    state: override ?? row.state,
    can_cancel: !closedStates.has(row.state) && !row.stripe_confirmed && !row.cancel_reserved_at &&
      (!row.create_reserved_at || Boolean(row.payment_intent_id)),
  };
}

export function createTerminalService({ db, stripe, allowCharges = false }) {
  async function online(attempt, binding) {
    const evidence = await stripe.readiness(binding);
    const reason = checkTerminalOnline(attempt, { ...evidence, projectRef: TERMINAL_TEST_PROJECT, businessId: binding.business_id });
    if (reason) throw new TerminalRequestError(reason);
    return evidence.checkedAt;
  }

  async function finish(row) {
    if (!row.stripe_confirmed) return view(row);
    const committed = row.committed_at ? row : await db.finalize(row.operation_id);
    terminalSaleCommitted(domainAttempt(committed), {
      committed: Boolean(committed.committed_at), businessId: committed.business_id, saleId: committed.sale_id,
      operationId: committed.operation_id, paymentIntentId: committed.payment_intent_id,
    });
    return view(committed);
  }

  async function recover(row, intentId = row.payment_intent_id) {
    if (row.committed_at || row.state === 'canceled') return view(row);
    if (row.stripe_confirmed) return finish(row);
    if (!intentId) return view(row, 'verifying');
    const snapshot = await stripe.snapshot(row.binding, intentId);
    const next = reconcileTerminalIntent(domainAttempt(row), snapshot);
    const idle = next.state === 'declined' ? await stripe.idleAfterDecline(row) : false;
    return finish(await db.observe(row.operation_id, snapshot, idle));
  }

  async function status(row) {
    try { return await recover(row); }
    catch { return view(row, 'verifying'); }
  }

  async function scopedAttempt(actor, request) {
    const context = await db.context(actor, request.location_id, request.operation_id);
    if (!context.attempt) throw new TerminalRequestError('TERMINAL_ATTEMPT_UNAVAILABLE', 404);
    return context.attempt;
  }

  return {
    async execute(actor, request) {
      if (request.action === 'status') return status(await scopedAttempt(actor, request));
      if (request.action === 'cancel') {
        const row = await scopedAttempt(actor, request);
        let current;
        try { current = await recover(row); }
        catch { return view(row, 'verifying'); }
        if (closedStates.has(current.state)) return current;
        const claimed = await db.claim(row.operation_id, 'cancel');
        if (!claimed) return current;
        if (!claimed.payment_intent_id) return view(claimed);
        try { await stripe.cancel(claimed, `${domainAttempt(claimed).idempotencyKey}:cancel`); }
        catch { /* Authenticated retrieval determines the outcome. */ }
        return status(claimed);
      }

      const context = await db.context(actor, request.location_id, null);
      const { binding, pending } = context;
      if (request.action === 'readiness') {
        if (!allowCharges || !binding || pending.length) return { ready: false, pending: pending.map(row => view(row, 'verifying')) };
        try {
          await online(newTerminalAttempt({ businessId: binding.business_id, readerId: binding.reader_id,
            stripeAccountId: binding.stripe_account_id, saleId: 'readiness', operationId: 'readiness', currency: 'usd', amountMinor: 50 }), binding);
          return { ready: true, pending: [] };
        } catch { return { ready: false, pending: [] }; }
      }

      const previous = (await db.context(actor, request.location_id, request.operation_id)).attempt;
      if (!previous) {
        if (!allowCharges || !binding) throw new TerminalRequestError('TERMINAL_DISABLED', 503);
        if (pending.length) throw new TerminalRequestError('TERMINAL_PREVIOUS_PAYMENT_PENDING');
        await online(newTerminalAttempt({ businessId: binding.business_id, readerId: binding.reader_id,
          stripeAccountId: binding.stripe_account_id, saleId: request.sale_id, operationId: request.operation_id,
          amountMinor: request.expected_amount_minor, currency: 'usd' }), binding);
      }
      const reserved = await db.reserve(actor, request);
      let row = reserved.attempt;
      if (!reserved.created) return status(row);
      try {
        const createCheckedAt = await online(domainAttempt(row), row.binding);
        const create = await db.claim(row.operation_id, 'create');
        if (!create) return view(row, 'verifying');
        row = create;
        const key = domainAttempt(create).idempotencyKey;
        const intent = terminalIntentFields(await stripe.create(create, `${key}:create`, createCheckedAt));
        const snapshot = { accountId: create.binding.stripe_account_id, intent };
        bindTerminalIntent(domainAttempt(create), snapshot);
        if (intent.status !== 'requires_payment_method' || intent.amount_received !== 0) {
          throw new TerminalRequestError('TERMINAL_CREATED_INTENT_STATE');
        }
        row = await db.observe(row.operation_id, snapshot, false);
        const processCheckedAt = await online(domainAttempt(row), row.binding);
        const process = await db.claim(row.operation_id, 'process');
        if (process) {
          row = process;
          await stripe.process(process, `${key}:process`, processCheckedAt);
        }
        return status(row);
      } catch { return view(row, 'verifying'); }
    },

    async webhook(event) {
      if (event?.livemode !== false || !paymentEvents.has(event.type) || !/^evt_[A-Za-z0-9]+$/.test(event.id ?? '')) return;
      const intent = event.data?.object;
      const operation = intent?.metadata?.operation_id;
      if (!terminalUuid(operation) || !/^pi_[A-Za-z0-9]+$/.test(intent.id ?? '')) return;
      const row = await db.attempt(operation);
      if (!row || !row.create_reserved_at) return;
      if (event.account && event.account !== row.binding.stripe_account_id) throw new TerminalRequestError('TERMINAL_EVENT_SCOPE', 400);
      if (await db.event(operation, event.id, false)) return;
      const result = await recover(row, intent.id);
      if (event.type === 'payment_intent.succeeded' && result.state !== 'approved') {
        throw new TerminalRequestError('TERMINAL_COMMIT_PENDING', 503);
      }
      if (!await db.event(operation, event.id, true)) throw new TerminalRequestError('TERMINAL_EVENT_SCOPE', 409);
    },
  };
}
