// C1 runs after the single-authority platform cutover. Do not accept the earlier
// hardening body: it lacks the ACTIVE-business check. No Supabase access here.
export const C1_AUDIT_CONTRACT = Object.freeze({
  version: 'POST_CUTOVER_ACTIVE_TENANT_V1',
  source: 'migrations/20261016_platform_admin_TEST.sql',
  signature: 'public.fn_write_audit(text,text)',
  expected: Object.freeze({
    body_fingerprint: 'ab9a6025c3457cb489b7ac24de19feb5',
    body_sha256: '7fecdf24cfd6cf01a27a9c846ffe16cb03950f9b84e4ba54737539d56b8e68f8',
    identity_arguments: 'p_action text, p_details text',
    returns_audit_logs: true,
    language: 'plpgsql',
    volatility: 'v',
    is_strict: false,
    returns_set: false,
    argument_defaults: 0,
    security_definer: true,
    owner: 'postgres',
    empty_search_path: true,
    anon_execute: false,
    authenticated_execute: true,
    overloads: 1,
  }),
});
