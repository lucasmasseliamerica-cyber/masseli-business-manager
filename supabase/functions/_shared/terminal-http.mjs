import { createTerminalService, parseTerminalRequest, TERMINAL_TEST_PROJECT, terminalUuid } from './terminal-service.mjs';
import { createTerminalStripe, TerminalRequestError } from './terminal-stripe.mjs';

const testUrl = `https://${TERMINAL_TEST_PROJECT}.supabase.co`;
const definiteErrors = new Map([
  ['TERMINAL_SALES_FORBIDDEN', 403], ['TERMINAL_LOCATION_FORBIDDEN', 403], ['TERMINAL_CART_SCOPE', 403],
  ['TERMINAL_OPERATION_CONFLICT', 409], ['TERMINAL_SALE_ALREADY_USED', 409], ['TERMINAL_BINDING_UNAVAILABLE', 503],
  ['TERMINAL_INVALID_CART', 400], ['TERMINAL_TAX_CONFIG', 409], ['TERMINAL_INVALID_DISCOUNT', 400],
  ['TERMINAL_QUOTE_CHANGED', 409], ['TERMINAL_INSUFFICIENT_STOCK', 409],
]);

async function rawBody(request, limit) {
  if (!request.body) throw new TerminalRequestError('TERMINAL_BODY_REQUIRED', 400);
  const reader = request.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new TerminalRequestError('TERMINAL_BODY_LIMIT', 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return buffer;
}

function parseJson(raw) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); }
  catch { throw new TerminalRequestError('TERMINAL_JSON_INVALID', 400); }
}

export async function verifyTerminalWebhook(raw, header, secret, now = Date.now()) {
  if (!/^whsec_[A-Za-z0-9]+$/.test(secret || '')) throw new TerminalRequestError('TERMINAL_WEBHOOK_NOT_CONFIGURED', 503);
  if (!header || header.length > 4096) throw new TerminalRequestError('TERMINAL_SIGNATURE_INVALID', 400);
  const fields = header.split(',').map(field => field.trim());
  const times = fields.filter(field => field.startsWith('t='));
  const time = times[0]?.slice(2);
  const signatures = fields.filter(field => /^v1=[0-9a-f]{64}$/.test(field));
  if (times.length !== 1 || !/^\d{1,12}$/.test(time ?? '') || Math.abs(now - Number(time) * 1000) > 300000 || !signatures.length) {
    throw new TerminalRequestError('TERMINAL_SIGNATURE_INVALID', 400);
  }
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${time}.`);
  const payload = new Uint8Array(prefix.length + raw.length);
  payload.set(prefix);
  payload.set(raw, prefix.length);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  for (const signature of signatures) {
    const bytes = Uint8Array.from(signature.slice(3).match(/../g), value => Number.parseInt(value, 16));
    if (await crypto.subtle.verify('HMAC', key, bytes, payload)) return parseJson(raw);
  }
  throw new TerminalRequestError('TERMINAL_SIGNATURE_INVALID', 400);
}

function originAllowed(origin, values) {
  if (!origin || !values.split(',').map(value => value.trim()).includes(origin)) return false;
  try {
    const url = new URL(origin);
    return url.origin === origin && (url.protocol === 'https:' || origin === 'http://127.0.0.1:5173');
  } catch { return false; }
}

function response(value, status, origin) {
  return new Response(status === 204 ? null : JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
    ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type' } : {}),
  } });
}

function backend(config, fetchImpl) {
  if (config.supabaseUrl !== testUrl || !config.publicKey || !config.serviceKey) {
    throw new TerminalRequestError('TERMINAL_TEST_NOT_CONFIGURED', 503);
  }
  async function rpc(name, args) {
    let result, value;
    try {
      result = await fetchImpl(`${testUrl}/rest/v1/rpc/fn_terminal_${name}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
        headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      value = await result.json();
    } catch { throw new TerminalRequestError('TERMINAL_DATABASE_UNCONFIRMED', 503); }
    if (!result.ok) {
      if (definiteErrors.has(value?.message)) throw new TerminalRequestError(value.message, definiteErrors.get(value.message));
      if (value?.code === '23505') throw new TerminalRequestError('TERMINAL_RESERVATION_CONFLICT');
      throw new TerminalRequestError('TERMINAL_DATABASE_UNCONFIRMED', 503);
    }
    return value;
  }
  return {
    async actor(request) {
      const authorization = request.headers.get('authorization');
      if (!authorization || authorization.length > 8192 || !/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(authorization)) {
        throw new TerminalRequestError('TERMINAL_AUTH_REQUIRED', 401);
      }
      let user;
      try {
        const result = await fetchImpl(`${testUrl}/auth/v1/user`, { headers: { apikey: config.publicKey, Authorization: authorization },
          redirect: 'error', signal: AbortSignal.timeout(12000) });
        if (result.ok) user = await result.json();
      } catch { throw new TerminalRequestError('TERMINAL_AUTH_UNAVAILABLE', 503); }
      if (!terminalUuid(user?.id) || user.role !== 'authenticated' || user.is_anonymous === true) {
        throw new TerminalRequestError('TERMINAL_AUTH_INVALID', 401);
      }
      return user.id;
    },
    context: (actor, location, operation) => rpc('context', { p_actor: actor, p_location: location, p_operation: operation }),
    reserve: (actor, request) => rpc('reserve', { p_actor: actor, p_request: request }),
    claim: (operation, stage) => rpc('claim', { p_operation: operation, p_stage: stage }),
    observe: (operation, snapshot, idle) => rpc('observe', { p_operation: operation, p_snapshot: snapshot, p_reader_idle: idle }),
    attempt: operation => rpc('attempt', { p_operation: operation }),
    finalize: operation => rpc('finalize', { p_operation: operation }),
    event: (operation, event, record) => rpc('event', { p_operation: operation, p_event: event, p_record: record }),
  };
}

export function terminalHttp(config, { webhook = false, fetchImpl = fetch } = {}) {
  return async request => {
    let origin;
    try {
      if (!webhook) {
        origin = request.headers.get('origin');
        if (!originAllowed(origin, config.allowedOrigins || '')) return response({ code: 'ORIGIN_DENIED' }, 403);
        if (request.method === 'OPTIONS') return response(null, 204, origin);
      }
      if (request.method !== 'POST') return response({ code: 'METHOD_NOT_ALLOWED' }, 405, origin);
      if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
        return response({ code: 'CONTENT_TYPE_REQUIRED' }, 415, origin);
      }
      const raw = await rawBody(request, webhook ? 262144 : 32768);
      const event = webhook ? await verifyTerminalWebhook(raw, request.headers.get('stripe-signature'), config.webhookSecret) : null;
      const db = backend(config, fetchImpl);
      const stripe = createTerminalStripe({ secret: config.stripeSecret, accountId: config.stripeAccountId, fetchImpl });
      const service = createTerminalService({ db, stripe, allowCharges: config.allowCharges === true });
      if (webhook) {
        await service.webhook(event);
        return response({ received: true }, 200);
      }
      const actor = await db.actor(request);
      const input = parseTerminalRequest(parseJson(raw));
      return response(await service.execute(actor, input), 200, origin);
    } catch (error) {
      return error instanceof TerminalRequestError ? response({ code: error.code }, error.status, origin) :
        response({ code: 'TERMINAL_UNCONFIRMED' }, 503, origin);
    }
  };
}

export function terminalEnvironment(env) {
  return {
    supabaseUrl: env.get('SUPABASE_URL')?.replace(/\/$/, ''), publicKey: env.get('SUPABASE_ANON_KEY'),
    serviceKey: env.get('SUPABASE_SERVICE_ROLE_KEY'), stripeSecret: env.get('STRIPE_TERMINAL_TEST_SECRET_KEY'),
    stripeAccountId: env.get('STRIPE_TERMINAL_TEST_ACCOUNT_ID'), webhookSecret: env.get('STRIPE_TERMINAL_TEST_WEBHOOK_SECRET'),
    allowedOrigins: env.get('STRIPE_TERMINAL_TEST_ALLOWED_ORIGINS'), allowCharges: env.get('STRIPE_TERMINAL_TEST_ALLOW_CHARGES') === 'true',
  };
}
