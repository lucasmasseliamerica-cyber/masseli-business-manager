export const STRIPE_TERMINAL_API_VERSION = '2026-10-28.endive';

export class TerminalRequestError extends Error {
  constructor(code, status = 409) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const networks = {
  stripe_s700: ['wifi', 'ethernet'],
  simulated_stripe_s700: ['wifi'],
};

function resourceId(value, prefix) {
  if (typeof value !== 'string' || !value.startsWith(prefix) || !/^[a-z]+_[A-Za-z0-9]+$/.test(value)) {
    throw new TerminalRequestError('TERMINAL_STRIPE_SCOPE', 503);
  }
  return value;
}

function requireFreshReadiness(checkedAt) {
  const age = Date.now() - checkedAt;
  if (!Number.isFinite(age) || age < 0 || age > 5000) throw new TerminalRequestError('STALE_CONNECTIVITY');
}

export function createTerminalStripe({ secret, accountId, fetchImpl = fetch }) {
  if (!/^(?:rk|sk)_test_[A-Za-z0-9]+$/.test(secret || '') || !/^acct_[A-Za-z0-9]+$/.test(accountId || '')) {
    throw new TerminalRequestError('TERMINAL_STRIPE_NOT_CONFIGURED', 503);
  }

  async function stripe(path, params, idempotencyKey) {
    try {
      const response = await fetchImpl(`https://api.stripe.com/v1/${path}`, {
        method: params ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${secret}`,
          'Stripe-Version': STRIPE_TERMINAL_API_VERSION,
          ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: params ? new URLSearchParams(params) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('STRIPE_HTTP');
      return await response.json();
    } catch {
      throw new TerminalRequestError(params ? 'TERMINAL_STRIPE_WRITE_UNCONFIRMED' : 'TERMINAL_STRIPE_UNAVAILABLE', 503);
    }
  }

  async function verifyAccount(binding) {
    if (binding.stripe_account_id !== accountId) throw new TerminalRequestError('TERMINAL_STRIPE_SCOPE', 503);
    const account = await stripe('account');
    if (account.id !== accountId || account.country !== 'US') throw new TerminalRequestError('TERMINAL_STRIPE_SCOPE', 503);
    return account;
  }

  async function reader(binding) {
    const id = resourceId(binding.reader_id, 'tmr_');
    const result = await stripe(`terminal/readers/${id}`);
    if (result.id !== id || result.livemode !== false || result.location !== binding.stripe_location_id || result.device_type !== binding.device_type) {
      throw new TerminalRequestError('TERMINAL_READER_SCOPE', 503);
    }
    return result;
  }

  return {
    async readiness(binding) {
      const checkedAt = Date.now();
      const account = await verifyAccount(binding);
      if (account.charges_enabled !== true) throw new TerminalRequestError('TERMINAL_STRIPE_CHARGES_DISABLED', 503);
      const locationId = resourceId(binding.stripe_location_id, 'tml_');
      const [device, location] = await Promise.all([reader(binding), stripe(`terminal/locations/${locationId}`)]);
      if (location.id !== locationId || location.livemode !== false || location.address?.country !== 'US') {
        throw new TerminalRequestError('TERMINAL_LOCATION_SCOPE', 503);
      }
      return {
        checkedAt, stripeAccountId: account.id, readerId: device.id,
        readerStatus: device.status, readerBusy: device.action?.status === 'in_progress',
        network: binding.network, modelSupportsNetwork: networks[device.device_type]?.includes(binding.network) === true,
        livemode: false, offlineEnabled: false, backendStripeAuthenticated: true,
      };
    },
    async create(attempt, key, checkedAt) {
      await verifyAccount(attempt.binding);
      requireFreshReadiness(checkedAt);
      return stripe('payment_intents', {
        amount: String(attempt.amount_minor), currency: 'usd', capture_method: 'automatic',
        'payment_method_types[]': 'card_present', 'metadata[business_id]': attempt.business_id,
        'metadata[sale_id]': attempt.sale_id, 'metadata[operation_id]': attempt.operation_id,
      }, key);
    },
    async process(attempt, key, checkedAt) {
      await verifyAccount(attempt.binding);
      requireFreshReadiness(checkedAt);
      const id = resourceId(attempt.binding.reader_id, 'tmr_');
      const intent = resourceId(attempt.payment_intent_id, 'pi_');
      await stripe(`terminal/readers/${id}/process_payment_intent`, {
        payment_intent: intent, 'process_config[skip_tipping]': 'true',
      }, key);
    },
    async snapshot(binding, intentId) {
      const account = await verifyAccount(binding);
      const id = resourceId(intentId, 'pi_');
      const value = await stripe(`payment_intents/${id}`);
      if (value.id !== id || value.livemode !== false) throw new TerminalRequestError('TERMINAL_INTENT_SCOPE', 503);
      return { accountId: account.id, intent: terminalIntentFields(value) };
    },
    async idleAfterDecline(attempt) {
      const device = await reader(attempt.binding);
      return device.action?.status !== 'in_progress';
    },
    async cancel(attempt, key) {
      await verifyAccount(attempt.binding);
      const device = await reader(attempt.binding);
      const intent = resourceId(attempt.payment_intent_id, 'pi_');
      if (device.action?.status === 'in_progress') {
        if (device.action.type !== 'process_payment_intent' || device.action.process_payment_intent?.payment_intent !== intent) {
          throw new TerminalRequestError('TERMINAL_READER_ACTION_CONFLICT');
        }
        await stripe(`terminal/readers/${device.id}/cancel_action`, {}, `${key}:reader`);
      }
      await stripe(`payment_intents/${intent}/cancel`, {}, `${key}:intent`);
    },
  };
}

// Keep only the fields that the sale transaction uses to prove the payment.
export function terminalIntentFields(value) {
  return {
    id: value.id, livemode: value.livemode, amount: value.amount, amount_received: value.amount_received,
    currency: value.currency, status: value.status, capture_method: value.capture_method,
    payment_method_types: value.payment_method_types,
    metadata: {
      business_id: value.metadata?.business_id, sale_id: value.metadata?.sale_id, operation_id: value.metadata?.operation_id,
    },
    last_payment_error: value.last_payment_error ? {} : null,
  };
}
