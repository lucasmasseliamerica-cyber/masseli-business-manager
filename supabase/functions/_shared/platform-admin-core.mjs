const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const READ_OPERATIONS = new Set(["list_businesses", "list_audit_logs"]);
const WRITE_OPERATIONS = new Set(["grant_lifetime_license", "revoke_license", "update_business_status"]);
const BUSINESS_STATUSES = new Set(["ACTIVE", "SUSPENDED"]);

export class PlatformAdminRequestError extends Error {
  constructor(message, status = 400, code = "INVALID_REQUEST") {
    super(message);
    this.name = "PlatformAdminRequestError";
    this.status = status;
    this.code = code;
  }
}

export function allowedOrigin(origin, configuredOrigins = "") {
  if (!origin) return null;
  const allowed = configuredOrigins.split(",").map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

export function requirePlatformAdmin(authUser) {
  if (!authUser || !UUID_PATTERN.test(String(authUser.id || ""))) {
    throw new PlatformAdminRequestError("Authentication is required.", 401, "AUTH_REQUIRED");
  }
  if (authUser.app_metadata?.nexalvo_platform_role !== "SUPERADMIN") {
    throw new PlatformAdminRequestError("Platform administrator access is required.", 403, "PLATFORM_ACCESS_DENIED");
  }
  return authUser.id;
}

function assertOnlyKeys(input, allowedKeys) {
  const unexpected = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unexpected.length) throw new PlatformAdminRequestError("The request contains unsupported fields.");
}

export function parsePlatformAdminRequest(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new PlatformAdminRequestError("A JSON object is required.");
  }
  const operation = typeof input.operation === "string" ? input.operation : "";
  if (READ_OPERATIONS.has(operation)) {
    assertOnlyKeys(input, new Set(["operation"]));
    return { operation };
  }
  if (!WRITE_OPERATIONS.has(operation)) {
    throw new PlatformAdminRequestError("Unsupported platform operation.");
  }
  assertOnlyKeys(input, new Set(["operation", "request_id", "business_id", "status"]));
  if (!UUID_PATTERN.test(String(input.request_id || ""))) {
    throw new PlatformAdminRequestError("A valid request identifier is required.");
  }
  if (!UUID_PATTERN.test(String(input.business_id || ""))) {
    throw new PlatformAdminRequestError("A valid business identifier is required.");
  }
  if (operation === "update_business_status") {
    if (!BUSINESS_STATUSES.has(input.status)) {
      throw new PlatformAdminRequestError("The business status must be ACTIVE or SUSPENDED.");
    }
  } else if (input.status !== undefined) {
    throw new PlatformAdminRequestError("Status is valid only when updating business status.");
  }
  return {
    operation,
    requestId: input.request_id,
    businessId: input.business_id,
    status: operation === "update_business_status" ? input.status : null,
  };
}

export function publicPlatformError(error) {
  if (error instanceof PlatformAdminRequestError) {
    return { status: error.status, body: { ok: false, error: error.message, code: error.code } };
  }
  return {
    status: 500,
    body: { ok: false, error: "The platform administration service could not complete the request.", code: "PLATFORM_SERVICE_ERROR" },
  };
}
