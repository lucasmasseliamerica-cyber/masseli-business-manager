import test from 'node:test';
import assert from 'node:assert/strict';
import { probeC1RuntimeReadonly } from './stock-c1-runtime-readonly.TEST.mjs';
import { sanitizeC1ExecutionStage, sanitizeC1RuntimeDiagnostic } from './stock-c1-diagnostics.mjs';

test('C1 local runtime diagnosis rejects execution recovery and fixture arguments before starting anything', async () => {
  let starts = 0;
  for (const args of [['--execute'], ['--apply'], ['--reconcile-readonly', 'SYNTHETIC_PRIVATE_PATH']]) {
    const report = await probeC1RuntimeReadonly({}, args, async () => { starts++; });
    assert.equal(report.status, 'BLOCKED'); assert.equal(report.stock_requests_forwarded, 0);
    assert.equal(report.checkpoints_modified, 0); assert.equal(report.full_homologation, false);
  }
  assert.equal(starts, 0);
});
test('C1 local runtime diagnosis uses no QA configuration and closes its own runtime without claiming homologation', async () => {
  let closes = 0;
  const report = await probeC1RuntimeReadonly({}, [], async ({ config, onStage }) => {
    assert.equal(config.origin, 'https://msinksoilkluooxenecy.supabase.co');
    assert.equal(config.key, 'sb_publishable_LOCAL_RUNTIME_ONLY'); onStage('CHROMIUM_LAUNCH');
    return { close: async () => { closes++; } };
  });
  assert.equal(report.status, 'PASS'); assert.equal(report.code, 'C1_LOCAL_RUNTIME_READY_NOT_HOMOLOGATION');
  assert.equal(report.supabase_requests_forwarded, 0); assert.equal(report.checkpoints_modified, 0);
  assert.equal(report.full_homologation, false); assert.equal(closes, 1);
});
test('C1 runtime diagnostics preserve the fixed failure while removing paths messages tokens and untrusted codes', async () => {
  const diagnostic = { stage: 'VITE_READY', reason: 'VITE_EXITED', port: 4189, exit_code: 2 };
  const report = await probeC1RuntimeReadonly({}, [], async ({ onStage }) => {
    onStage('VITE_READY'); const error = Error('Bearer SYNTHETIC_PRIVATE person@example.invalid C:\\private');
    error.code = 'C1_VITE_EXITED'; error.runtimeDiagnostic = { ...diagnostic, message: error.message, path: error.message }; throw error;
  });
  assert.equal(report.code, 'C1_VITE_EXITED'); assert.equal(report.blocked_stage, 'VITE_READY');
  assert.deepEqual(report.runtime_diagnostic, diagnostic);
  assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC_PRIVATE|Bearer|example\.invalid|private|message/);
  const unknown = await probeC1RuntimeReadonly({}, [], async () => { const error = Error('SYNTHETIC_PRIVATE'); error.code = 'SYNTHETIC_PRIVATE'; throw error; });
  assert.equal(unknown.code, 'C1_LOCAL_RUNTIME_UNCONFIRMED');
});
test('C1 runtime diagnostic and execution-stage allowlists reject arbitrary upstream fields', () => {
  const valid = { stage: 'CHROMIUM_LAUNCH', reason: 'CHROMIUM_LAUNCH_REJECTED', port: 4189, exit_code: null };
  assert.deepEqual(sanitizeC1RuntimeDiagnostic({ ...valid, path: 'SYNTHETIC_PRIVATE', token: 'SYNTHETIC_PRIVATE' }), valid);
  for (const change of [{ stage: 'SYNTHETIC_PRIVATE' }, { reason: 'SYNTHETIC_PRIVATE' }, { port: 5173 }, { exit_code: 'SYNTHETIC_PRIVATE' }])
    assert.equal(sanitizeC1RuntimeDiagnostic({ ...valid, ...change }), null);
  assert.equal(sanitizeC1ExecutionStage('C:\\private'), null);
  assert.equal(sanitizeC1ExecutionStage('INVENTORY_OPEN'), 'INVENTORY_OPEN');
});
