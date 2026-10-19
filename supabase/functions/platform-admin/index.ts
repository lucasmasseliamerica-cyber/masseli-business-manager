import {
  allowedOrigin,
  parsePlatformAdminRequest,
  PlatformAdminRequestError,
  publicPlatformError,
  requirePlatformAdmin,
} from "../_shared/platform-admin-core.mjs";

const MAX_BODY_BYTES = 16 * 1024;

function jsonResponse(body: unknown, status: number, origin: string | null) {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function requiredConfiguration() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const expectedProjectRef = Deno.env.get("NEXALVO_ALLOWED_PROJECT_REF") || "";
  let actualProjectRef = "";
  try {
    actualProjectRef = new URL(supabaseUrl).hostname.split(".")[0] || "";
  } catch {
    // The generic configuration error below deliberately avoids returning environment details.
  }
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !expectedProjectRef || actualProjectRef !== expectedProjectRef) {
    throw new PlatformAdminRequestError("Platform administration is not configured for this project.", 503, "PLATFORM_NOT_CONFIGURED");
  }
  return { supabaseUrl, anonKey, serviceRoleKey };
}

async function verifiedAuthUser(req: Request, supabaseUrl: string, anonKey: string) {
  const authorization = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    throw new PlatformAdminRequestError("Authentication is required.", 401, "AUTH_REQUIRED");
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!response.ok) throw new PlatformAdminRequestError("The authenticated session is invalid.", 401, "AUTH_INVALID");
  const user = await response.json().catch(() => null);
  requirePlatformAdmin(user);
  return user;
}

async function serviceRpc(config: ReturnType<typeof requiredConfiguration>, rpcName: string, payload: Record<string, unknown>) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${rpcName}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("platform-admin dependency failed", { rpc: rpcName, status: response.status });
    throw new PlatformAdminRequestError("The platform data operation could not be completed.", 502, "PLATFORM_DEPENDENCY_FAILED");
  }
  return body;
}

Deno.serve(async (req: Request) => {
  const originHeader = req.headers.get("origin");
  const origin = allowedOrigin(originHeader, Deno.env.get("PLATFORM_ADMIN_ALLOWED_ORIGINS") || "");
  if (originHeader && !origin) {
    return jsonResponse({ ok: false, error: "Origin is not allowed.", code: "ORIGIN_DENIED" }, 403, null);
  }
  if (req.method === "OPTIONS") {
    return origin ? new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    } }) : jsonResponse({ ok: false, error: "Origin is required.", code: "ORIGIN_REQUIRED" }, 403, null);
  }

  try {
    if (req.method !== "POST") throw new PlatformAdminRequestError("Only POST is supported.", 405, "METHOD_NOT_ALLOWED");
    const declaredLength = Number(req.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      throw new PlatformAdminRequestError("The request body is too large.", 413, "BODY_TOO_LARGE");
    }
    const config = requiredConfiguration();
    const authUser = await verifiedAuthUser(req, config.supabaseUrl, config.anonKey);
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      throw new PlatformAdminRequestError("The request body is too large.", 413, "BODY_TOO_LARGE");
    }
    let input: unknown;
    try {
      input = JSON.parse(rawBody);
    } catch {
      throw new PlatformAdminRequestError("A valid JSON body is required.");
    }
    const command = parsePlatformAdminRequest(input);

    if (command.operation === "list_businesses") {
      const businesses = await serviceRpc(config, "fn_platform_admin_list_businesses", {
        p_actor_user_id: authUser.id,
      });
      return jsonResponse({ ok: true, businesses: Array.isArray(businesses) ? businesses : [] }, 200, origin);
    }
    if (command.operation === "list_audit_logs") {
      const auditLogs = await serviceRpc(config, "fn_platform_admin_list_audit_logs", {
        p_actor_user_id: authUser.id,
        p_limit: 50,
      });
      return jsonResponse({ ok: true, audit_logs: Array.isArray(auditLogs) ? auditLogs : [] }, 200, origin);
    }

    const result = await serviceRpc(config, "fn_platform_admin_execute", {
      p_request_id: command.requestId,
      p_actor_user_id: authUser.id,
      p_operation: command.operation,
      p_business_id: command.businessId,
      p_target_status: command.status,
    });
    return jsonResponse(result && typeof result === "object" ? result : { ok: false }, 200, origin);
  } catch (error) {
    const result = publicPlatformError(error);
    return jsonResponse(result.body, result.status, origin);
  }
});
