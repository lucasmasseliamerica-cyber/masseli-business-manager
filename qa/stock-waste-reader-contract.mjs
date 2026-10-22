// Existing TEST RPC captured in the reviewed public security export. No new DB
// function/grant is proposed. Never infer empty waste history from stock ledger.
export const STOCK_WASTE_READER_CONTRACT = Object.freeze({
  signature: 'public.fn_read_waste_transactions_secure()',
  source_sha256: 'a9e17a9bd5284616fc2356555beb407fb823994e4d34b8ebcdc10784b7e2856f',
  expected: Object.freeze({
    body_fingerprint: '4dbda260df3b744caf55d2c2ba8c031f',
    body_sha256: '7c2a163faa7d766485c6cfd3d8acb84815f2e3faf7260de02830cdc5d81e3b1a',
    identity_arguments: '',
    returns_waste_transactions: true,
    language: 'sql',
    volatility: 's',
    is_strict: false,
    returns_set: true,
    argument_defaults: 0,
    security_definer: true,
    owner: 'postgres',
    empty_search_path: true,
    anon_execute: false,
    authenticated_execute: true,
    overloads: 1,
  }),
});
