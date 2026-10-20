import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Manually invoked READ-ONLY probe of pre-existing Stripe TEST fixtures. It cannot create a
// reader/PaymentIntent, collect/process a card, cancel, capture, refund or mutate Supabase.
// No key, object identifier, e-mail or response body is ever returned in its report.
const result = (status, code, checks = {}) => ({ scope: 'STRIPE_TEST_EXISTING_FIXTURES_READONLY', status, code, checks,
  real_payment_flow: 'BLOCKED', sale_stock_financial_finalization: 'BLOCKED', requests_mutating: 0 });

export async function inspectStripeTestFixtures(config, fetcher = fetch) {
  if (config.branch !== 'automation/nexalvo-qa-actions' || config.projectUrl !== 'https://msinksoilkluooxenecy.supabase.co') return result('BLOCKED', 'QA_TARGET_REQUIRED');
  if (!config.key || !config.readerId || !config.intentId || !config.accountId) return result('BLOCKED', 'SECURE_TEST_FIXTURES_REQUIRED');
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(config.key)) return result('BLOCKED', 'TEST_KEY_REQUIRED');
  if (!/^tmr_[A-Za-z0-9]+$/.test(config.readerId) || !/^pi_[A-Za-z0-9]+$/.test(config.intentId) || !/^acct_[A-Za-z0-9]+$/.test(config.accountId)) return result('BLOCKED', 'INVALID_FIXTURE_REFERENCE');
  const headers = { Authorization: `Bearer ${config.key}` };
  // Four GETs, fixed trusted host, no redirects; no secret-bearing query strings or logs.
  const paths = ['/account', '/balance', `/terminal/readers/${config.readerId}`, `/payment_intents/${config.intentId}`];
  const bodies = [];
  try {
    for (const path of paths) {
      const response = await fetcher(`https://api.stripe.com/v1${path}`, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!response.ok) return result(response.status === 401 || response.status === 403 ? 'BLOCKED' : 'FAIL', `STRIPE_HTTP_${response.status}`);
      bodies.push(await response.json());
    }
  } catch { return result('BLOCKED', 'STRIPE_READ_UNAVAILABLE'); }
  const [account, balance, reader, intent] = bodies;
  const checks = {
    account_matches: account?.id === config.accountId ? 'PASS' : 'FAIL',
    test_mode_confirmed: balance?.livemode === false && reader?.livemode === false && intent?.livemode === false ? 'PASS' : 'FAIL',
    reader_matches: reader?.id === config.readerId ? 'PASS' : 'FAIL',
    reader_online: reader?.status === 'online' ? 'PASS' : 'BLOCKED',
    intent_matches: intent?.id === config.intentId ? 'PASS' : 'FAIL',
  };
  const status = Object.values(checks).includes('FAIL') ? 'FAIL' : Object.values(checks).includes('BLOCKED') ? 'BLOCKED' : 'PASS';
  return result(status, status === 'PASS' ? 'READONLY_SCOPE_ONLY' : 'FIXTURE_CHECKS_INCOMPLETE', checks);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let branch = '';
  try { branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Fail closed below. */ }
  const report = await inspectStripeTestFixtures({ branch, projectUrl: process.env.VITE_SUPABASE_URL?.replace(/\/$/, ''),
    key: process.env.NEXALVO_STRIPE_TEST_SECRET_KEY, readerId: process.env.NEXALVO_STRIPE_TEST_READER_ID,
    intentId: process.env.NEXALVO_STRIPE_TEST_PAYMENT_INTENT_ID, accountId: process.env.NEXALVO_STRIPE_TEST_ACCOUNT_ID });
  console.log(JSON.stringify(report));
  process.exitCode = report.status === 'PASS' ? 0 : report.status === 'FAIL' ? 1 : 2;
}
