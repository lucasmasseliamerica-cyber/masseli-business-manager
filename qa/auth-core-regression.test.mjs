import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual implementations without importing JSX or reaching a network.
for (const file of ['src/App.jsx', 'App.jsx']) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  function section(start, end) {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert.ok(a >= 0 && b > a, `Implementation boundaries missing in ${file}`);
    return source.slice(a, b);
  }
  const permissions = vm.createContext({});
  vm.runInContext(section('const PERMISSIONS =', 'const ROLE_LABEL =') + ';globalThis.can = can;', permissions);
  test(`${file}: unknown roles deny defaults and explicit overrides`, () => {
    for (const role of ['UNKNOWN', undefined, null, '', 'owner', 'toString', '__proto__']) {
      for (const key of ['manageSales', 'manageExpenses', 'manageUsers']) {
        assert.equal(permissions.can({role, permissions:{[key]:true}}, key), false);
        assert.equal(permissions.can({role}, key), false);
      }
    }
  });
  test(`${file}: valid roles retain defaults and overrides`, () => {
    assert.equal(permissions.can(null, 'manageSales'), false);
    assert.equal(permissions.can({role:'OWNER'}, 'manageUsers'), true);
    assert.equal(permissions.can({role:'MANAGER'}, 'manageSales'), true);
    assert.equal(permissions.can({role:'EMPLOYEE'}, 'manageUsers'), false);
    assert.equal(permissions.can({role:'MANAGER',permissions:{manageSales:false}}, 'manageSales'), false);
    assert.equal(permissions.can({role:'EMPLOYEE',permissions:{viewReports:true}}, 'viewReports'), true);
  });
  function auth(fetch) {
    const context = vm.createContext({fetch, Date, Promise});
    vm.runInContext(`
      let _supabaseSession = {accessToken:'old', refreshToken:'refresh', expiresAt:0};
      let _supabaseRefreshPromise = null;
      const SUPABASE_URL = 'https://msinksoilkluooxenecy.supabase.co';
      const SUPABASE_ANON_KEY = 'test-key';
      function persistSupabaseSession(value) { _supabaseSession = value; }
      ${section('let _onSupabaseSessionInvalid', '/* ============================== end Phase 6.1 additions')}
      ${section('const supabaseAuth =', 'async function callSupabaseFunction')}
      globalThis.api = {restore:()=>supabaseAuth.restoreSession(), ensure:ensureFreshSession,
        session:()=>_supabaseSession};
    `, context);
    return context.api;
  }
  test(`${file}: concurrent restoration and request refresh share one fetch`, async () => {
    let calls = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    const api = auth(async () => {
      calls++; await gate;
      return {ok:true,status:200,json:async()=>({access_token:'new',refresh_token:'rotated',expires_in:3600})};
    });
    const pending = [api.restore(), api.restore(), api.ensure()];
    const observed = calls;
    release();
    const sessions = await Promise.all(pending);
    assert.equal(observed, 1);
    assert.ok(sessions.every(s => s.accessToken === 'new' && s.refreshToken === 'rotated'));
    await api.restore(); assert.equal(calls, 1, 'fresh session requires no extra refresh');
  });
  for (const status of [400, 401, 429, 500]) {
    test(`${file}: refresh ${status} preserves expected session state and releases gate`, async () => {
      let calls = 0;
      const api = auth(async () => {
        calls++;
        return calls === 1 ? {ok:false,status,json:async()=>({})}
          : {ok:true,status:200,json:async()=>({access_token:'recovered',expires_in:3600})};
      });
      const session = await api.restore();
      if (status === 400 || status === 401) {
        assert.equal(session, null); assert.equal(api.session(), null);
      } else {
        assert.equal(session.accessToken, 'old');
        assert.equal((await api.restore()).accessToken, 'recovered');
        assert.equal(calls, 2);
      }
    });
  }
}
