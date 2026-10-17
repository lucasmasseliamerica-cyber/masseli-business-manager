const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(['OWNER', 'MANAGER', 'EMPLOYEE']);
const PERMISSIONS = new Set([
  'viewFinancials', 'manageSales', 'reverseSales', 'manageExpenses', 'reverseExpenses',
  'manageInventory', 'adjustInventory', 'manageRecipesAndCosts', 'managePurchases',
  'receivePurchases', 'paySuppliers', 'reversePurchases', 'manageSuppliers', 'viewReports',
  'manageTasks', 'manageUsers', 'manageSettings', 'manageCashRegister', 'manageCustomers',
  'manageLoyalty',
]);

export class StaffRequestError extends Error {
  constructor(message, status = 400, code = 'INVALID_REQUEST') {
    super(message);
    this.name = 'StaffRequestError';
    this.status = status;
    this.code = code;
    this.safeToCompensate = false;
  }
}

function onlyKeys(input, allowed) {
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new StaffRequestError('The request contains unsupported fields.');
  }
}

function cleanText(value, label, max) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > max) throw new StaffRequestError(`${label} is invalid.`);
  return result;
}

function cleanPermissions(value, role) {
  if (role === 'OWNER') {
    if (value && (typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length)) {
      throw new StaffRequestError('Owner permissions cannot be overridden.');
    }
    return {};
  }
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new StaffRequestError('Permission overrides must be an object.');
  const output = {};
  for (const [key, permission] of Object.entries(value)) {
    if (!PERMISSIONS.has(key) || typeof permission !== 'boolean') {
      throw new StaffRequestError('Permission overrides contain an invalid entry.');
    }
    output[key] = permission;
  }
  return output;
}

export function parseStaffRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new StaffRequestError('A JSON object is required.');
  const operation = input.operation;
  if (!['invite', 'update'].includes(operation)) throw new StaffRequestError('Unsupported staff operation.');
  const common = new Set(['operation', 'name', 'username', 'role', 'employee_id', 'active', 'permission_overrides']);
  const allowed = operation === 'invite'
    ? new Set([...common, 'email', 'redirect_to'])
    : new Set([...common, 'user_id']);
  onlyKeys(input, allowed);
  const role = typeof input.role === 'string' ? input.role.toUpperCase() : '';
  if (!ROLES.has(role)) throw new StaffRequestError('The staff role is invalid.');
  const employeeId = input.employee_id === null || input.employee_id === '' || input.employee_id === undefined
    ? null : String(input.employee_id);
  if (employeeId !== null && !UUID_PATTERN.test(employeeId)) throw new StaffRequestError('The employee link is invalid.');
  if (typeof input.active !== 'boolean') throw new StaffRequestError('The active state is required.');
  const command = {
    operation,
    name: cleanText(input.name, 'Name', 160),
    username: cleanText(input.username, 'Username', 80),
    role,
    employeeId,
    active: input.active,
    permissionOverrides: cleanPermissions(input.permission_overrides, role),
  };
  if (operation === 'update') {
    if (!UUID_PATTERN.test(String(input.user_id || ''))) throw new StaffRequestError('The user identifier is invalid.');
    return { ...command, userId: input.user_id };
  }
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new StaffRequestError('A valid invitation email is required.');
  let redirectOrigin;
  try {
    const redirect = new URL(String(input.redirect_to || ''));
    if (redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(redirect.hostname))) throw new Error();
    if (redirect.username || redirect.password || redirect.search || redirect.hash || redirect.pathname !== '/') throw new Error();
    redirectOrigin = redirect.origin;
  } catch {
    throw new StaffRequestError('The invitation redirect is invalid.');
  }
  return { ...command, email, redirectOrigin };
}

export function canManageStaff(profile) {
  if (!profile || profile.active !== true || !UUID_PATTERN.test(String(profile.id || '')) || !UUID_PATTERN.test(String(profile.business_id || ''))) return false;
  if (profile.role === 'OWNER') return true;
  if (!['MANAGER', 'EMPLOYEE'].includes(profile.role)) return false;
  return profile.permission_overrides?.manageUsers === true;
}

export function publicStaffError(error) {
  if (error instanceof StaffRequestError) {
    return { status: error.status, body: { ok: false, error: error.message, code: error.code } };
  }
  return { status: 500, body: { ok: false, error: 'The staff service could not complete the request.', code: 'STAFF_SERVICE_ERROR' } };
}
