// Offline acceptance only. Reads sanitized reports; never reads a checkpoint or contacts Supabase.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SALE_ACCEPTANCE = Object.freeze([
  ['catalog', 'Catálogo e contratos de segurança'],
  ['owner_a_b', 'Identidade OWNER A/B e empresas'],
  ['permissions', 'Permissões exigidas'],
  ['read_isolation', 'Isolamento de leitura'],
  ['exclusive_fixture', 'Fixture exclusiva e elegibilidade'],
  ['snapshot', 'Snapshot original'],
  ['ui_totals', 'Totais, desconto e imposto exibidos no PDV'],
  ['ui_translation', 'Estados de cancelamento PT/EN'],
  ['same_id_replay', 'Replay do mesmo ID após perda da resposta'],
  ['persist_reload', 'Persistência e reconsulta após reload'],
  ['write_isolation', 'Negação das probes de escrita B/anônimo'],
  ['stock_deduction', 'Baixa de estoque após a venda'],
  ['single_income', 'Receita única da venda'],
  ['ui_reversal', 'Cancelamento pela interface e reconsulta'],
  ['history_preserved', 'Histórico e auditorias preservados'],
  ['stock_and_cost_restored', 'Quantidade e custo médio restaurados'],
  ['financial_net_zero', 'Receita e compensação únicas, líquido zero'],
].map(([id, title]) => Object.freeze({ id, title })));
const recoveryChecks = new Set(['history_preserved', 'stock_and_cost_restored', 'financial_net_zero']);
const known = new Set(SALE_ACCEPTANCE.map(c => c.id));
export const SALE_EVIDENCE_PATH = 'docs/evidence/sale-b-1253-reported-real-evidence-20261021.json';
export function loadReportedSaleEvidence() {
  return JSON.parse(readFileSync(new URL('../' + SALE_EVIDENCE_PATH, import.meta.url), 'utf8'));
}

export function reconcileSaleAcceptance(evidence) {
  const original = evidence?.original, recovery = evidence?.recovery;
  const originalChecks = original?.checks;
  const realSources = evidence?.evidence_kind === 'USER_CONFIRMED_JOURNEY'
    && evidence.project_ref === 'msinksoilkluooxenecy'
    && evidence.branch === 'automation/nexalvo-qa-actions'
    && original?.evidence_kind === 'USER_REPORTED_REAL_WINDOWS_EXECUTION'
    && recovery?.evidence_kind === 'USER_REPORTED_REAL_AUTHENTICATED_READONLY'
    && Number.isSafeInteger(original?.order_number) && original.order_number > 0
    && original.order_number === recovery?.order_number;
  const validChecks = originalChecks && typeof originalChecks === 'object' && !Array.isArray(originalChecks)
    && Object.entries(originalChecks).every(([id, status]) => known.has(id) && ['PASS', 'FAIL', 'BLOCKED'].includes(status));
  const restorationConfirmed = recovery?.code === 'READONLY_CANCELLED_SALE_CONFIRMED_NOT_FULL_HOMOLOGATION'
    && recovery.recovery_status === 'PASS' && recovery.restored === true && recovery.recovery_checkpoint_unchanged === true
    && [...recoveryChecks].every(id => recovery.checks?.[id] === 'PASS')
    && [2, 3].includes(recovery.audit_entries_observed)
    && recovery.financial_summary?.income_rows === 1 && recovery.financial_summary?.refund_rows === 1
    && recovery.financial_summary?.net_cents === 0
    && recovery.sale_ids_forwarded === 0 && recovery.reversal_requests_forwarded === 0;
  const valid = realSources && validChecks && restorationConfirmed;
  const checks = SALE_ACCEPTANCE.map(({ id, title }) => {
    let status = valid ? originalChecks[id] ?? 'BLOCKED' : 'BLOCKED';
    let source = status === 'BLOCKED' ? 'MISSING_EVIDENCE' : 'ORIGINAL_EXECUTION';
    // Supplement only the three explicit restoration checks. Never override FAIL or infer UI/replay/probes.
    if (valid && status === 'BLOCKED' && recoveryChecks.has(id)) {
      status = 'PASS'; source = 'READONLY_RECOVERY';
    }
    return { id, title, status, source };
  });
  const passed = checks.filter(c => c.status === 'PASS').length;
  const failed = checks.filter(c => c.status === 'FAIL').length;
  const blocked = checks.filter(c => c.status === 'BLOCKED').length;
  return {
    scope: 'B_JOURNEY_OFFLINE_EVIDENCE_RECONCILIATION',
    status: failed ? 'FAIL' : valid && passed === checks.length ? 'PASS' : 'BLOCKED',
    code: !valid ? 'REAL_MATCHING_REPORTS_AND_RESTORATION_REQUIRED'
      : failed ? 'ORIGINAL_CHECK_FAILURE_NOT_OVERRIDDEN'
      : blocked ? 'ORIGINAL_CHECKS_STILL_MISSING' : 'ORIGINAL_AND_READONLY_RECOVERY_RECONCILED',
    total: checks.length, passed, failed, blocked,
    percent: Number((100 * passed / checks.length).toFixed(2)),
    original_passed: checks.filter(c => c.status === 'PASS' && c.source === 'ORIGINAL_EXECUTION').length,
    recovery_passed: checks.filter(c => c.status === 'PASS' && c.source === 'READONLY_RECOVERY').length,
    operations_executed: 0,
    provenance: 'USER_REPORTED_REAL_REPORTS_NOT_DIRECT_SESSION_OBSERVATION',
    checks,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = reconcileSaleAcceptance(loadReportedSaleEvidence());
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 2;
}
