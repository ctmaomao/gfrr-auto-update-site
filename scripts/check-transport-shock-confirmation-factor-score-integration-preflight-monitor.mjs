import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MONITOR_SCRIPT = 'scripts/monitor-transport-shock-confirmation-factor-score-integration-preflight.mjs';
const FIXTURE_FREE_PROXY_GATE =
  'docs/fixtures/transport-shock-confirmation-factor/score-integration-preflight-free-proxy-gate-passed.json';
const FIXTURE_CROSS_CONFIRMATION =
  'docs/fixtures/transport-shock-confirmation-factor/score-integration-preflight-cross-confirmation-blocked.json';

const RUNTIME_FILES = [
  'index.html',
  'scripts/app.js',
  'scripts/modules/renderMacroOverview.js',
  'scripts/modules/buildCrossValidationMatrix.js',
  'scripts/run-daily-pipeline.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'data/radar-data.json',
  'data/oil-directional-pressure.json'
];

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`node ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return String(result.stdout || '');
}

function assertScriptSafety() {
  assert(fs.existsSync(absolute(MONITOR_SCRIPT)), 'Score-integration preflight monitor script is missing.');
  const source = readText(MONITOR_SCRIPT);
  for (const forbidden of ['fetch(', 'https.request', 'http.request', 'axios', 'node:https', 'node:http', 'process.env.FIRMS']) {
    assert(!source.includes(forbidden), `Monitor script contains forbidden marker: ${forbidden}`);
  }
  for (const marker of [
    'transport-shock-score-integration-preflight-monitor-p43',
    'blocked_on_external_evidence_or_source_rights',
    'source_rights_or_authorized_route_freight_required',
    'live_physical_confirmation_required',
    'cannot_clear_remaining_blockers_with_code_only_changes',
    'scoreWriteApproved: false',
    'productionWriteApproved: false'
  ]) {
    assert(source.includes(marker), `Monitor script missing marker: ${marker}`);
  }
}

function assertMonitorOutput() {
  const stdout = runNode([
    MONITOR_SCRIPT,
    '--free-proxy-gate',
    FIXTURE_FREE_PROXY_GATE,
    '--cross-confirmation',
    FIXTURE_CROSS_CONFIRMATION,
    '--dry-run',
    '--no-output',
    '--json'
  ]);
  const monitor = JSON.parse(stdout);
  assert(monitor.monitorVersion === 'transport-shock-score-integration-preflight-monitor-p43', 'Unexpected monitor version.');
  assert(monitor.status === 'blocked_on_external_evidence_or_source_rights', 'Expected external evidence/source-rights block.');
  assert(monitor.preflight.scoreIntegrationPreflightPassed === false, 'Fixture preflight must remain blocked.');
  assert(monitor.preflight.crossConfirmationHardBlockerIds.includes('route_freight_confirmation'), 'Missing route freight hard blocker.');
  assert(monitor.preflight.crossConfirmationHardBlockerIds.includes('high_frequency_physical_confirmation'), 'Missing high-frequency hard blocker.');
  const routeBlocker = monitor.hardBlockers.find((item) => item.id === 'route_freight_confirmation');
  const highFrequencyBlocker = monitor.hardBlockers.find((item) => item.id === 'high_frequency_physical_confirmation');
  assert(routeBlocker?.category === 'source_rights_or_authorized_route_freight_required', 'Unexpected route blocker category.');
  assert(routeBlocker?.codeOnlyClearable === false, 'Route blocker must not be code-only clearable.');
  assert(highFrequencyBlocker?.category === 'live_physical_confirmation_required', 'Unexpected high-frequency blocker category.');
  assert(highFrequencyBlocker?.codeOnlyClearable === false, 'High-frequency blocker must not be code-only clearable.');
  assert(monitor.codeOnlyCompletion.complete === false, 'Code-only completion must remain false.');
  assert(monitor.codeOnlyCompletion.remainingNonCodeBlockerIds.includes('route_freight_confirmation'), 'Route blocker must remain non-code blocker.');
  assert(monitor.manualAction.requiredBeforeMoreCode === true, 'Monitor should require external evidence before more score code.');
  assert(monitor.scoreWriteApproved === false, 'Monitor must not approve score write.');
  assert(monitor.productionWriteApproved === false, 'Monitor must not approve production write.');
  assert(monitor.eligibleForMainScore === false, 'Monitor must not approve main-score eligibility.');
  assert(monitor.productionImpact.affectsScoring === false, 'Monitor must not affect scoring.');
  assert(monitor.productionImpact.affectsMainJudgment === false, 'Monitor must not affect main judgment.');
}

function assertRuntimeUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    const source = readText(relativePath);
    for (const marker of [
      'transport-shock-score-integration-preflight-monitor-p43',
      'blocked_on_external_evidence_or_source_rights',
      'monitor:transport-shock-confirmation-factor-score-integration-preflight'
    ]) {
      assert(!source.includes(marker), `${relativePath} appears to wire preflight monitor into runtime: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/PROJECT_BACKLOG.md');
  const agents = readText('AGENTS.md');
  const packageJson = JSON.parse(readText('package.json'));
  const checkSuite = readText('scripts/check-suite.mjs');

  for (const marker of [
    'transport-shock-score-integration-preflight-monitor-p43',
    'score-integration preflight monitor',
    'blocked_on_external_evidence_or_source_rights'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-score-integration-preflight-monitor-p43'), 'SIGNAL_INTAKE missing preflight monitor marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor score-integration preflight monitor'), 'PROJECT_BACKLOG missing preflight monitor marker.');
  assert(agents.includes('Transport Shock Confirmation Factor score-integration preflight monitor'), 'AGENTS missing preflight monitor marker.');
  assert(packageJson.scripts['monitor:transport-shock-confirmation-factor-score-integration-preflight'], 'package.json missing monitor script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-score-integration-preflight-monitor'], 'package.json missing monitor check script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-score-integration-preflight-monitor'), 'check-suite missing preflight monitor check.');
}

function main() {
  assertScriptSafety();
  assertMonitorOutput();
  assertRuntimeUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor score-integration preflight monitor: PASS');
}

main();
