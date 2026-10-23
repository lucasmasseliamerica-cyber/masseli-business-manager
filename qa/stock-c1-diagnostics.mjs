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

const executionStages = new Set(['CONFIGURATION', 'GIT', 'CATALOG', 'PRIVATE_CHECKPOINT', 'AUTHENTICATION', 'READ_ISOLATION',
  'BASELINE_READ', 'EXCLUSIVE_WINDOW', 'SNAPSHOT', 'NEGATIVE_PROBES', 'RUNTIME_DEPENDENCIES', 'LOCAL_PORT',
  'VITE_START', 'VITE_READY', 'CHROMIUM_LAUNCH', 'BROWSER_CONTEXT', 'BROWSER_SESSION', 'BROWSER_GUARD',
  'PAGE_OPEN', 'INVENTORY_OPEN', 'UI_ADJUSTMENT_FORM', 'UI_TRANSFER_FORM', 'UI_SUBMIT', 'UI_RELOAD', 'UI_HISTORY', 'FINAL_RECONCILIATION']);
const runtimeStages = new Set(['RUNTIME_DEPENDENCIES', 'LOCAL_PORT', 'VITE_START', 'VITE_READY', 'CHROMIUM_LAUNCH',
  'BROWSER_CONTEXT', 'BROWSER_SESSION', 'BROWSER_GUARD', 'PAGE_OPEN', 'INVENTORY_OPEN',
  'UI_ADJUSTMENT_FORM', 'UI_TRANSFER_FORM', 'UI_SUBMIT', 'UI_RELOAD', 'UI_HISTORY']);
const runtimeReasons = new Set(['PLAYWRIGHT_IMPORT_REJECTED', 'BROWSER_EXECUTABLE_MISSING', 'LOCAL_PORT_OCCUPIED',
  'PORT_PROBE_UNAVAILABLE', 'VITE_SPAWN_REJECTED', 'VITE_EXITED', 'VITE_READY_TIMEOUT', 'CHROMIUM_LAUNCH_REJECTED',
  'BROWSER_CONTEXT_REJECTED', 'BROWSER_SESSION_REJECTED', 'BROWSER_ROUTE_REJECTED', 'LOCAL_UI_UNCONFIRMED']);
export const sanitizeC1ExecutionStage = stage => executionStages.has(stage) ? stage : null;
export function sanitizeC1RuntimeDiagnostic(input) {
  if (!input || !runtimeStages.has(input.stage) || !runtimeReasons.has(input.reason) || input.port !== 4189
    || !(input.exit_code === null || (Number.isInteger(input.exit_code) && input.exit_code >= 0 && input.exit_code <= 255))) return null;
  return Object.freeze({ stage: input.stage, reason: input.reason, port: 4189, exit_code: input.exit_code });
}
