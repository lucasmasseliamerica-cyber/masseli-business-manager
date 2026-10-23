// Local Vite/Chromium diagnosis only: no Auth, session, fixture or checkpoint.
// Keep the regression basename distinct for Windows: stock-c1-runtime-readonly-regression.test.mjs.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { prepareC1Runtime } from './stock-c1-browser-runtime.mjs';
import { sanitizeC1ExecutionStage, sanitizeC1RuntimeDiagnostic } from './stock-c1-diagnostics.mjs';
const safeCodes = new Set(['C1_BROWSER_DEPENDENCIES_UNAVAILABLE', 'C1_BROWSER_EXECUTABLE_MISSING', 'C1_LOCAL_PORT_IN_USE',
  'C1_LOCAL_PORT_UNAVAILABLE', 'C1_VITE_START_FAILED', 'C1_VITE_EXITED', 'C1_LOCAL_SERVER_UNAVAILABLE', 'C1_CHROMIUM_LAUNCH_FAILED']);
export async function probeC1RuntimeReadonly(env = process.env, args = [], prepareRuntime = prepareC1Runtime) {
  const report = { scope: 'C1_LOCAL_RUNTIME_READONLY', status: 'BLOCKED', code: 'C1_LOCAL_RUNTIME_ARGUMENTS_FORBIDDEN',
    stock_requests_forwarded: 0, audit_requests_forwarded: 0, negative_requests_forwarded: 0,
    supabase_requests_forwarded: 0, checkpoints_modified: 0, full_homologation: false };
  if (args.length) return report;
  let runtime, stage = 'RUNTIME_DEPENDENCIES';
  try {
    runtime = await prepareRuntime({ env, config: { origin: 'https://msinksoilkluooxenecy.supabase.co',
      key: 'sb_publishable_LOCAL_RUNTIME_ONLY' }, onStage: value => { stage = sanitizeC1ExecutionStage(value) || 'RUNTIME_DEPENDENCIES'; } });
    report.status = 'PASS'; report.code = 'C1_LOCAL_RUNTIME_READY_NOT_HOMOLOGATION';
  } catch (error) {
    report.code = safeCodes.has(error?.code) ? error.code : 'C1_LOCAL_RUNTIME_UNCONFIRMED';
    report.blocked_stage = stage;
    const diagnostic = sanitizeC1RuntimeDiagnostic(error?.runtimeDiagnostic);
    if (diagnostic) { report.runtime_diagnostic = diagnostic; report.blocked_stage = diagnostic.stage; }
  } finally { try { await runtime?.close(); } catch { /* no raw exception or private path */ } }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let report;
  try {
    const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (git('branch', '--show-current') !== 'automation/nexalvo-qa-actions' || git('status', '--porcelain')) throw Error('QA');
    report = await probeC1RuntimeReadonly(process.env, process.argv.slice(2));
  } catch { report = { scope: 'C1_LOCAL_RUNTIME_READONLY', status: 'BLOCKED', code: 'C1_CLEAN_QA_REQUIRED', full_homologation: false }; }
  console.log(JSON.stringify(report, null, 2)); process.exitCode = report.status === 'PASS' ? 0 : 2;
}
