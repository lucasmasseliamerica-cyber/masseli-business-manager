import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SALE_ACCEPTANCE, loadReportedSaleEvidence, reconcileSaleAcceptance } from './sale-journey-acceptance.mjs';

test('17-check reconciliation uses the exact runner contract without changing either real report', () => {
  const source = readFileSync(new URL('./sale-journey.TEST.mjs', import.meta.url), 'utf8');
  const runnerChecks = [...source.match(/const checks = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(SALE_ACCEPTANCE.map(c => c.id), runnerChecks);
  const evidence = loadReportedSaleEvidence(), before = JSON.stringify(evidence);
  const report = reconcileSaleAcceptance(evidence);
  assert.equal(report.status, 'PASS');
  assert.deepEqual([report.total, report.passed, report.failed, report.blocked, report.percent], [17, 17, 0, 0, 100]);
  assert.deepEqual([report.original_passed, report.recovery_passed], [14, 3]);
  assert.equal(evidence.original.reported_code, 'SALE_AUDIT_NOT_CONFIRMED');
  assert.equal(evidence.recovery.code, 'READONLY_CANCELLED_SALE_CONFIRMED_NOT_FULL_HOMOLOGATION');
  assert.equal(JSON.stringify(evidence), before, 'reconciliation must not rewrite original BLOCKED results');
});

test('read-only recovery alone cannot approve UI, replay, reload, stock deduction or write isolation', () => {
  const evidence = loadReportedSaleEvidence();
  evidence.original.checks = Object.fromEntries(SALE_ACCEPTANCE.map(c => [c.id, 'BLOCKED']));
  // Even explicitly supplied recovery PASS flags cannot substitute original UI/probe evidence.
  evidence.recovery.checks = Object.fromEntries(SALE_ACCEPTANCE.map(c => [c.id, 'PASS']));
  const report = reconcileSaleAcceptance(evidence);
  assert.equal(report.status, 'BLOCKED'); assert.equal(report.passed, 3); assert.equal(report.blocked, 14);
  for (const id of ['ui_totals', 'ui_translation', 'same_id_replay', 'persist_reload', 'write_isolation', 'stock_deduction', 'single_income', 'ui_reversal']) {
    assert.equal(report.checks.find(c => c.id === id).status, 'BLOCKED');
  }
});

test('partial original evidence stays partial and explicit FAIL is never erased by restoration', () => {
  const evidence = loadReportedSaleEvidence(); delete evidence.original.checks.ui_translation;
  let report = reconcileSaleAcceptance(evidence);
  assert.equal(report.status, 'BLOCKED'); assert.equal(report.passed, 16);
  for (const id of ['write_isolation', 'history_preserved']) {
    const failed = loadReportedSaleEvidence(); failed.original.checks[id] = 'FAIL';
    report = reconcileSaleAcceptance(failed);
    assert.equal(report.status, 'FAIL'); assert.equal(report.failed, 1);
    assert.equal(report.checks.find(c => c.id === id).status, 'FAIL');
  }
});

test('simulations, other projects/orders and malformed or unknown checks fail closed', () => {
  const changes = [
    e => e.evidence_kind = 'SIMULATED_HTTP',
    e => e.project_ref = 'OTHER_PROJECT',
    e => e.branch = 'main',
    e => e.original.evidence_kind = 'CI_ONLY',
    e => e.recovery.evidence_kind = 'SIMULATED_HTTP',
    e => e.recovery.order_number = 12530,
    e => e.original.checks = [],
    e => e.original.checks.unknown = 'PASS',
    e => e.original.checks.ui_totals = 'pass',
  ];
  for (const change of changes) {
    const evidence = loadReportedSaleEvidence(); change(evidence);
    const report = reconcileSaleAcceptance(evidence);
    assert.equal(report.status, 'BLOCKED'); assert.equal(report.passed, 0);
  }
});

test('changed checkpoint, duplicate financial rows, missing audits or forwarded mutations block acceptance', () => {
  const changes = [
    e => e.recovery.recovery_status = 'BLOCKED',
    e => e.recovery.restored = false,
    e => e.recovery.recovery_checkpoint_unchanged = false,
    e => e.recovery.checks.history_preserved = 'BLOCKED',
    e => e.recovery.audit_entries_observed = 1,
    e => e.recovery.financial_summary.income_rows = 2,
    e => e.recovery.financial_summary.refund_rows = 0,
    e => e.recovery.financial_summary.net_cents = 1,
    e => e.recovery.sale_ids_forwarded = 1,
    e => e.recovery.reversal_requests_forwarded = 1,
    e => delete e.recovery.reversal_requests_forwarded,
  ];
  for (const change of changes) {
    const evidence = loadReportedSaleEvidence(); change(evidence);
    assert.equal(reconcileSaleAcceptance(evidence).status, 'BLOCKED');
  }
  assert.equal(reconcileSaleAcceptance(null).status, 'BLOCKED');
});
