// Diagnostics are structured enums, never upstream text/URLs/query/identities.
const stages = new Set(['AUTH_LOGIN', 'AUTH_IDENTITY', 'PERMISSION_READ', 'READ_ISOLATION', 'FIXTURE_READ', 'NEGATIVE_PROBE', 'AUTH_LOGOUT']);
const resources = new Set(['AUTH_SESSION', 'AUTH_USER', 'USER_PROFILE', 'TENANT_CONTEXT', 'PERMISSIONS', 'INVENTORY_ITEM',
  'LOCATIONS', 'INVENTORY_STOCK', 'INVENTORY_HISTORY', 'PRODUCT_RECIPES', 'PURCHASE_LINES', 'WASTE_SECURE', 'WASTE_DIRECT', 'AUDIT_HISTORY', 'COUNT_PROBE']);
const reasons = new Set(['HTTP_REJECTED', 'NETWORK_UNAVAILABLE', 'INVALID_JSON', 'INCOMPLETE_READ']);
const upstreamCodes = new Set(['42501', '42P01', '42883', 'P0001', 'PGRST202', 'PGRST205', 'PGRST301', 'PGRST302']);
export function sanitizeC1Diagnostic(input) {
  if (!input || !stages.has(input.stage) || !resources.has(input.resource) || !['A', 'B', 'ANON'].includes(input.actor)
    || !['GET', 'POST'].includes(input.method) || !reasons.has(input.reason)
    || !(input.http_status === null || (Number.isInteger(input.http_status) && input.http_status >= 100 && input.http_status <= 599))) return null;
  return Object.freeze({ stage: input.stage, resource: input.resource, actor: input.actor, method: input.method,
    http_status: input.http_status, reason: input.reason, upstream_code: upstreamCodes.has(input.upstream_code) ? input.upstream_code : null });
}
