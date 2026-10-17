import { allowedOrigin } from '../_shared/platform-admin-core.mjs';
import {
  canManageStaff,
  parseStaffRequest,
  publicStaffError,
  StaffRequestError,
} from '../_shared/manage-staff-user-core.mjs';

const MAX_BODY_BYTES = 16 * 1024;

function jsonResponse(body: unknown, status: number, origin: string | null) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function requiredConfiguration() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const expectedProjectRef = Deno.env.get('NEXALVO_ALLOWED_PROJECT_REF') || '';
  let actualProjectRef = '';
  try { actualProjectRef = new URL(supabaseUrl).hostname.split('.')[0] || ''; } catch { /* sanitized below */ }
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !expectedProjectRef || actualProjectRef !== expectedProjectRef) {
    throw new StaffRequestError('Staff administration is not configured for this project.', 503, 'STAFF_NOT_CONFIGURED');
  }
  return { supabaseUrl, anonKey, serviceRoleKey };
}

async function fetchJson(url: string, options: RequestInit, error: StaffRequestError) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw error;
  return body;
}

async function verifiedCaller(req: Request, config: ReturnType<typeof requiredConfiguration>) {
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw new StaffRequestError('Authentication is required.', 401, 'AUTH_REQUIRED');
  const user = await fetchJson(`${config.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: config.anonKey, Authorization: authorization },
  }, new StaffRequestError('The authenticated session is invalid.', 401, 'AUTH_INVALID'));
  const rows = await fetchJson(`${config.supabaseUrl}/rest/v1/users?select=id,business_id,role,permission_overrides,active&id=eq.${encodeURIComponent(user?.id || '')}&limit=1`, {
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
  }, new StaffRequestError('The staff authorization profile is unavailable.', 503, 'PROFILE_UNAVAILABLE'));
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile || profile.id !== user?.id) throw new StaffRequestError('The staff authorization profile is unavailable.', 403, 'PROFILE_DENIED');
  if (!canManageStaff(profile)) throw new StaffRequestError('Staff management permission is required.', 403, 'STAFF_ACCESS_DENIED');
  return profile;
}

async function profileRpc(config: ReturnType<typeof requiredConfiguration>, actorId: string, businessId: string, userId: string, command: ReturnType<typeof parseStaffRequest>) {
  let response: Response;
  try {
    response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/fn_manage_staff_profile`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_operation: command.operation,
        p_actor_user_id: actorId,
        p_target_user_id: userId,
        p_business_id: businessId,
        p_employee_id: command.employeeId,
        p_name: command.name,
        p_username: command.username,
        p_role: command.role,
        p_permission_overrides: command.permissionOverrides,
        p_active: command.active,
      }),
    });
  } catch {
    throw new StaffRequestError('The staff profile result is uncertain and needs reconciliation.', 503, 'STAFF_PROFILE_COMMIT_UNCERTAIN');
  }
  if (!response.ok) {
    const error = new StaffRequestError('The staff profile operation was rejected.', 409, 'PROFILE_OPERATION_REJECTED');
    error.safeToCompensate = true;
    throw error;
  }
  const body = await response.json().catch(() => null);
  if (!body || typeof body.id !== 'string') {
    throw new StaffRequestError('The staff profile result is uncertain and needs reconciliation.', 503, 'STAFF_PROFILE_COMMIT_UNCERTAIN');
  }
  return body;
}

async function inviteIdentity(config: ReturnType<typeof requiredConfiguration>, email: string, redirectOrigin: string) {
  let response: Response;
  try {
    response = await fetch(`${config.supabaseUrl}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, redirect_to: redirectOrigin }),
    });
  } catch {
    throw new StaffRequestError('The invitation result is uncertain and needs reconciliation.', 503, 'STAFF_INVITE_COMMIT_UNCERTAIN');
  }
  if (!response.ok) throw new StaffRequestError('The invitation could not be created.', 409, 'INVITE_REJECTED');
  const invited = await response.json().catch(() => null);
  const invitedId = invited?.id || invited?.user?.id;
  if (typeof invitedId !== 'string') {
    throw new StaffRequestError('The invitation identity needs administrator reconciliation.', 503, 'INVITE_IDENTITY_MISSING');
  }
  return invitedId;
}

async function deleteInvitedIdentity(config: ReturnType<typeof requiredConfiguration>, userId: string) {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}?should_soft_delete=false`, {
    method: 'DELETE',
    headers: { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` },
  });
  return response.ok || response.status === 404;
}

function publicProfile(row: Record<string, unknown>) {
  return {
    id: row.id,
    business_id: row.business_id,
    employee_id: row.employee_id ?? null,
    name: row.name,
    username: row.username,
    role: row.role,
    permission_overrides: row.permission_overrides || {},
    active: row.active === true,
    updated_at: row.updated_at ?? null,
  };
}

Deno.serve(async (req: Request) => {
  const originHeader = req.headers.get('origin');
  const allowedOrigins = Deno.env.get('STAFF_ADMIN_ALLOWED_ORIGINS') || '';
  const origin = allowedOrigin(originHeader, allowedOrigins);
  if (originHeader && !origin) return jsonResponse({ ok: false, error: 'Origin is not allowed.', code: 'ORIGIN_DENIED' }, 403, null);
  if (req.method === 'OPTIONS') {
    return origin ? new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    } }) : jsonResponse({ ok: false, error: 'Origin is required.', code: 'ORIGIN_REQUIRED' }, 403, null);
  }

  try {
    if (req.method !== 'POST') throw new StaffRequestError('Only POST is supported.', 405, 'METHOD_NOT_ALLOWED');
    const declaredLength = Number(req.headers.get('content-length') || '0');
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new StaffRequestError('The request body is too large.', 413, 'BODY_TOO_LARGE');
    const config = requiredConfiguration();
    const caller = await verifiedCaller(req, config);
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) throw new StaffRequestError('The request body is too large.', 413, 'BODY_TOO_LARGE');
    let input: unknown;
    try { input = JSON.parse(rawBody); } catch { throw new StaffRequestError('A valid JSON body is required.'); }
    const command = parseStaffRequest(input);

    if (command.operation === 'update') {
      const result = await profileRpc(config, caller.id, caller.business_id, command.userId, command);
      return jsonResponse({ ok: true, user: publicProfile(result) }, 200, origin);
    }

    if (!allowedOrigin(command.redirectOrigin, allowedOrigins)) {
      throw new StaffRequestError('The invitation redirect is not allowed.', 403, 'REDIRECT_DENIED');
    }
    const invitedId = await inviteIdentity(config, command.email, command.redirectOrigin);
    try {
      const result = await profileRpc(config, caller.id, caller.business_id, invitedId, command);
      return jsonResponse({ ok: true, user: publicProfile(result) }, 200, origin);
    } catch (profileError) {
      if (!(profileError instanceof StaffRequestError) || profileError.safeToCompensate !== true) {
        throw new StaffRequestError('The invitation needs administrator reconciliation.', 503, 'STAFF_COMMIT_UNCERTAIN');
      }
      const compensated = await deleteInvitedIdentity(config, invitedId).catch(() => false);
      if (!compensated) {
        console.error('manage-staff-user compensation required', { stage: 'profile' });
        throw new StaffRequestError('The invitation needs administrator reconciliation.', 500, 'STAFF_COMPENSATION_REQUIRED');
      }
      throw profileError;
    }
  } catch (error) {
    const result = publicStaffError(error);
    return jsonResponse(result.body, result.status, origin);
  }
});
