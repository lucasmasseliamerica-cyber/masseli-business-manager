// C2-only admission. No IO, timestamp rewriting, network or inherited C1 authority.
import { need } from './stock-c2-protocol.mjs';
export const C2_HTTP_MAX_MS = 20000;
export const C2_SETTLEMENT_MARGIN_MS = 5000;
export const C2_MIN_DISPATCH_MS = 10000;
function capture(input, envelope) {
  const value = Array.isArray(input) && input.length === 1 ? input[0] : input;
  return value?.[envelope] || value;
}
export function c2CaptureDeadline(catalog, security) {
  const at = [capture(catalog, 'stock_journey_preflight'), capture(security, 'stock_c1_child_security')]
    .map(c => Date.parse(c?.captured_at));
  need(at.every(Number.isFinite), 'CAPTURE_TIMES_REQUIRED');
  return Math.min(...at) + 86400000;
}
export function c2DispatchBudget(window, validUntil, now) {
  need(Number.isFinite(now) && Number.isFinite(window?.until) && Number.isFinite(validUntil), 'DEADLINE_REQUIRED');
  const deadline = Math.min(window.until, validUntil), remaining = Math.floor(deadline - now);
  need(remaining >= C2_MIN_DISPATCH_MS, 'INSUFFICIENT_DISPATCH_MARGIN');
  return Object.freeze({ timeoutMs: Math.min(C2_HTTP_MAX_MS, remaining - C2_SETTLEMENT_MARGIN_MS), deadline });
}
