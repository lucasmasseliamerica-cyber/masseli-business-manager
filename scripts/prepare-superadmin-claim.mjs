#!/usr/bin/env node
// TEST-only, fail-closed helper for the signed SUPERADMIN claim transition.
// Dry-run is the default. This file contains no credentials and never prints identity data or
// app_metadata. A write requires both --apply and a separate authorization gate in the environment.

const EXPECTED_PROJECT_REF = 'msinksoilkluooxenecy';
const CLAIM_KEY = 'nexalvo_platform_role';
const CLAIM_VALUE = 'SUPERADMIN';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in the secure execution environment.`);
  return value;
}

function projectRefFromUrl(url) {
  try { return new URL(url).hostname.split('.')[0] || ''; } catch { return ''; }
}

function assertUuid(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('NEXALVO_SUPERADMIN_USER_ID must be a valid UUID.');
  }
}

const apply = process.argv.includes('--apply');
const operation = (process.env.NEXALVO_CLAIM_OPERATION || 'GRANT').trim().toUpperCase();
if (!['GRANT', 'REMOVE'].includes(operation)) throw new Error('NEXALVO_CLAIM_OPERATION must be GRANT or REMOVE.');

const supabaseUrl = required('SUPABASE_URL').replace(/\/$/, '');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const userId = required('NEXALVO_SUPERADMIN_USER_ID');
assertUuid(userId);
if (projectRefFromUrl(supabaseUrl) !== EXPECTED_PROJECT_REF) {
  throw new Error('Refusing claim preparation outside the authorized NEXALVO-TEST project.');
}
if (apply && process.env.NEXALVO_CLAIM_CHANGE_AUTHORIZED !== 'TEST_ONLY_EXPLICIT') {
  throw new Error('Write refused: the explicit TEST-only authorization gate is absent.');
}

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};
const endpoint = `${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
const currentResponse = await fetch(endpoint, { headers });
if (!currentResponse.ok) throw new Error(`Unable to inspect the target Auth identity (${currentResponse.status}).`);
const user = await currentResponse.json();
if (!user || user.id !== userId || user.deleted_at || user.is_anonymous === true) {
  throw new Error('The target Auth identity is missing, deleted or anonymous.');
}
if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
  throw new Error('The target Auth identity is currently banned.');
}

const currentMetadata = user.app_metadata && typeof user.app_metadata === 'object' && !Array.isArray(user.app_metadata)
  ? user.app_metadata
  : {};
const nextMetadata = { ...currentMetadata };
if (operation === 'GRANT') nextMetadata[CLAIM_KEY] = CLAIM_VALUE;
else delete nextMetadata[CLAIM_KEY];
const alreadyDesired = operation === 'GRANT'
  ? currentMetadata[CLAIM_KEY] === CLAIM_VALUE
  : !Object.hasOwn(currentMetadata, CLAIM_KEY);

if (!apply) {
  console.log(JSON.stringify({
    status: 'DRY_RUN_ONLY',
    project_ref: EXPECTED_PROJECT_REF,
    operation,
    identity_valid: true,
    already_desired: alreadyDesired,
    preserves_other_app_metadata: true,
    next_step: 'Obtain specific authorization before rerunning with --apply.',
  }));
  process.exit(0);
}

if (!alreadyDesired) {
  const updateResponse = await fetch(endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ app_metadata: nextMetadata }),
  });
  if (!updateResponse.ok) throw new Error(`Auth claim update failed (${updateResponse.status}).`);
  const updated = await updateResponse.json();
  const updatedMetadata = updated?.app_metadata && typeof updated.app_metadata === 'object'
    ? updated.app_metadata
    : {};
  const applied = operation === 'GRANT'
    ? updatedMetadata[CLAIM_KEY] === CLAIM_VALUE
    : !Object.hasOwn(updatedMetadata, CLAIM_KEY);
  if (!applied) throw new Error('Auth API returned without the requested claim state.');
}

console.log(JSON.stringify({
  status: alreadyDesired ? 'NO_CHANGE_ALREADY_DESIRED' : 'CLAIM_CHANGE_APPLIED',
  project_ref: EXPECTED_PROJECT_REF,
  operation,
  identity_valid: true,
}));
