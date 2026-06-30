import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MONITOR_SCRIPT = 'scripts/monitor-transport-shock-confirmation-factor-free-proxy-score-readiness-gate.mjs';
const GATE_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-free-proxy-score-readiness-gate.mjs';
const REVIEW_FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-real-event-samples-review-ready.json';

const RUNTIME_FILES = [
  'index.html',
  'scripts/app.js',
  'scripts/modules/renderOilDirectional.js',
  'scripts/modules/renderMacroOverview.js',
  'scripts/modules/buildCrossValidationMatrix.js',
  'scripts/run-daily-pipeline.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'data/radar-data.json',
  'data/oil-directional-pressure.json'
];

const FORBIDDEN_SCRIPT_MARKERS = [
  'process.env',
  'fetch(',
  'https.request',
  'http.request',
  'axios',
  'node:https',
  'node:http',
  'data/radar-data.json',
  'data/oil-directional-pressure.json',
  'market.worker-preview.json',
  'bubble-watch'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-free-proxy-score-readiness-gate-monitor-p32',
  'monitor:transport-shock-confirmation-factor-free-proxy-score-readiness-gate',
  'sample_targets_satisfied_requires_separate_score_review'
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

function assertMonitorScriptSafety() {
  assert(fs.existsSync(absolute(MONITOR_SCRIPT)), 'Free-proxy score-readiness gate monitor is missing.');
  assert(fs.existsSync(absolute(GATE_SCRIPT)), 'P-score-31 gate script is missing.');
  const source = readText(MONITOR_SCRIPT);
  for (const marker of FORBIDDEN_SCRIPT_MARKERS) {
    assert(!source.includes(marker), `Gate monitor contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-free-proxy-score-readiness-gate-monitor-p32',
    'sample_targets_incomplete_collect_more',
    'collect_real_event_samples_until_gate_targets_are_met',
    'realEventSamplesRemaining',
    'zeroControlSamplesRemaining',
    'artifact-only Transport Shock free-proxy score-readiness gate monitor',
    'scoreWriteApproved: false',
    'productionDataWriteApproved: false'
  ]) {
    assert(source.includes(marker), `Gate monitor missing marker: ${marker}`);
  }
}

function assertMonitorOutput() {
  const result = JSON.parse(runNode([
    MONITOR_SCRIPT,
    '--input',
    REVIEW_FIXTURE,
    '--dry-run',
    '--no-output',
    '--json'
  ]));
  assert(result.monitorVersion === 'transport-shock-free-proxy-score-readiness-gate-monitor-p32', 'Unexpected monitor version.');
  assert(result.status === 'sample_targets_incomplete_collect_more', 'Starter fixture should remain sample-target incomplete.');
  assert(result.gate.status === 'score_readiness_gate_collect_more_keep_no_score_write', 'Gate status mismatch.');
  assert(result.gate.gatePassed === false, 'Starter fixture must not pass gate.');
  assert(result.targetGaps.realEventSamples.observed === 1, 'Expected one real-event sample.');
  assert(result.targetGaps.realEventSamples.target === 6, 'Expected real-event target 6.');
  assert(result.targetGaps.realEventSamples.remaining === 5, 'Expected five real-event samples remaining.');
  assert(result.targetGaps.knownDisruptionSamples.observed === 1, 'Expected one known-disruption sample.');
  assert(result.targetGaps.knownDisruptionSamples.remaining === 2, 'Expected two known-disruption samples remaining.');
  assert(result.targetGaps.zeroControlSamples.observed === 0, 'Expected zero zero-control samples.');
  assert(result.targetGaps.zeroControlSamples.remaining === 3, 'Expected three zero-control samples remaining.');
  assert(result.targetGaps.falsePositiveRate.measurable === false, 'False-positive rate should remain not measurable.');
  assert(result.targetGaps.knownDisruptionDirectionalHitRate.observed === 1, 'Expected known-disruption hit rate of 1.');
  for (const priority of [
    'collect_zero_control_real_event_samples',
    'collect_known_disruption_real_event_samples',
    'collect_total_real_event_samples'
  ]) {
    assert(result.nextSamplePriorities.some((item) => item.id === priority), `Expected priority: ${priority}`);
  }
  assert(result.manualAction.requiredNow === false, 'Incomplete targets should not require score integration action.');
  assert(result.manualAction.recommendation === 'collect_real_event_samples_until_gate_targets_are_met', 'Unexpected recommendation.');
  assert(result.scoreWriteApproved === false, 'Monitor must not approve score write.');
  assert(result.productionDataWriteApproved === false, 'Monitor must not approve production write.');
  assert(result.scoreIntegrationApproved === false, 'Monitor must not approve score integration.');
  assert(result.eligibleForMainScore === false, 'Monitor must not be main-score eligible.');
  assert(result.productionImpact.affectsScoring === false, 'Monitor must not affect scoring.');
  assert(result.productionImpact.affectsMainJudgment === false, 'Monitor must not affect main judgment.');
  assert(result.boundary.includes('does not fetch network'), 'Boundary must keep no-network discipline.');
  assert(!JSON.stringify(result).includes('https://'), 'Monitor output must not include raw URLs.');
}

function assertRuntimeUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} appears to wire gate monitor into runtime: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/PROJECT_BACKLOG.md');
  const agents = readText('AGENTS.md');
  const packageJson = JSON.parse(readText('package.json'));
  const checkSuite = readText('scripts/check-suite.mjs');
  for (const marker of [
    'transport-shock-free-proxy-score-readiness-gate-monitor-p32',
    'sample_targets_incomplete_collect_more',
    'scoreWriteApproved=false',
    'productionDataWriteApproved=false'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy score-readiness gate monitor'), 'PROJECT_BACKLOG missing gate monitor marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy score-readiness gate monitor'), 'AGENTS.md missing gate monitor boundary.');
  assert(packageJson.scripts['monitor:transport-shock-confirmation-factor-free-proxy-score-readiness-gate'], 'package.json missing gate monitor script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-score-readiness-gate-monitor'], 'package.json missing gate monitor checker.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-score-readiness-gate-monitor'), 'check-suite missing gate monitor checker.');
}

function main() {
  assertMonitorScriptSafety();
  assertMonitorOutput();
  assertRuntimeUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy score-readiness gate monitor: PASS');
}

main();
