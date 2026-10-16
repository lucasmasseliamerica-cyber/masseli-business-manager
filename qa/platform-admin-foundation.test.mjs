import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const files = ['src/App.jsx', 'App.jsx'];

function section(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `${startToken} section was not found`);
  return source.slice(start, end);
}

for (const file of files) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

  test(`${file}: platform role trusts only the server-controlled app_metadata claim`, () => {
    const context = vm.createContext({});
    vm.runInContext(section(source, 'const PLATFORM_ADMIN_ROLE =', 'async function loadAuthenticatedProfile') + ';globalThis.readRole=platformRoleFromAuthUser;globalThis.isAdmin=isPlatformAdmin;', context);
    assert.equal(context.readRole({ app_metadata: { nexalvo_platform_role: 'SUPERADMIN' } }), 'SUPERADMIN');
    assert.equal(context.readRole({ user_metadata: { nexalvo_platform_role: 'SUPERADMIN' } }), null);
    assert.equal(context.readRole({ app_metadata: { nexalvo_platform_role: 'OWNER' } }), null);
    assert.equal(context.isAdmin({ platformRole: 'SUPERADMIN' }), true);
    assert.equal(context.isAdmin({ role: 'OWNER' }), false);
  });

  test(`${file}: authenticated profile receives the signed Auth user`, () => {
    const auth = section(source, 'const authService =', '/* ============================== SUPABASE CONNECTION LAYER');
    assert.match(auth, /loadAuthenticatedProfile\(session\.user\.id, session\.user\)/);
    assert.match(auth, /loadAuthenticatedProfile\(result\.user\?\.id, result\.user\)/);
    const loader = section(source, 'async function loadAuthenticatedProfile', '/* ============================== SUPABASE DATA');
    assert.match(loader, /platformRole: platformRoleFromAuthUser\(authUser\)/);
  });

  test(`${file}: control plane goes only through the protected Edge Function`, () => {
    const service = section(source, 'async function callPlatformAdmin', 'const PLATFORM_BUSINESS_STATUSES');
    assert.match(service, /callSupabaseFunction\("platform-admin", \{ operation, \.\.\.payload \}\)/);
    const view = section(source, 'function PlatformAdminView', '/* ============================== SETTINGS');
    assert.doesNotMatch(view, /supabaseRest\.(select|insertOne|updateOne|deleteOne)/);
    assert.match(view, /callPlatformAdmin\("list_businesses"\)/);
    assert.match(view, /callPlatformAdmin\("grant_lifetime_license"/);
    assert.match(view, /callPlatformAdmin\("update_business_status"/);
  });

  test(`${file}: malformed control-plane rows fail closed`, () => {
    const context = vm.createContext({ Set, Number, Math, String });
    vm.runInContext(section(source, 'const PLATFORM_BUSINESS_STATUSES', 'function useSupabaseUsers') + ';globalThis.normalize=normalizePlatformBusiness;', context);
    assert.equal(context.normalize(null), null);
    assert.equal(context.normalize({ id: 'id', name: '' }), null);
    const unknown = context.normalize({ id: 'id', name: ' Tenant ', status: 'unknown', license_type: 'magic', active_users: -3 });
    assert.deepEqual(JSON.parse(JSON.stringify(unknown)), { id: 'id', name: 'Tenant', status: 'SUSPENDED', licenseType: 'NONE', activeUsers: 0, createdAt: null, licensedAt: null, licenseRevokedAt: null });
  });

  test(`${file}: platform navigation and mutations remain claim-gated and confirmed`, () => {
    assert.match(source, /platform: \(u\) => isPlatformAdmin\(u\)/);
    assert.match(source, /tab === "platform" && \(navAllowed\(currentUser, "platform"\)/);
    const view = section(source, 'function PlatformAdminView', '/* ============================== SETTINGS');
    assert.match(view, /if \(!isPlatformAdmin\(currentUser\)\) return <RestrictedView/);
    assert.match(view, /<ConfirmDialog[\s\S]*onConfirm=\{applyAction\}/);
    assert.match(view, /No tenant data was loaded through the public client/);
    assert.match(view, /callPlatformAdmin\("list_audit_logs"\)/);
    assert.match(view, /callPlatformAdmin\("revoke_license", \{ request_id: action\.requestId/);
    assert.match(view, /requestId: newDbId\(\)/);
    assert.doesNotMatch(view, /catch \(e\) \{\s*setPendingAction\(null\)/);
  });
}

test('root and src application copies remain identical after platform administration work', () => {
  assert.equal(
    readFileSync(new URL('../App.jsx', import.meta.url), 'utf8'),
    readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'),
  );
});
