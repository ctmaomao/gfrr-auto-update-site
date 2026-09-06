import { runNode } from './lib/check-script-helpers.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
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

const SCRIPT_FORBIDDEN_MARKERS = [
  'process.env',
  'fetch(',
  'https.request',
  'http.request',
  'axios',
  'node:https',
  'node:http',
  'data/radar-data.json',
  'data/oil-directional-pressure.json',
  'market.worker-preview.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1',
  'review-transport-shock-confirmation-factor-free-proxy-score-readiness-gate',
  'score_readiness_gate_ready_for_separate_review_keep_no_score_write'
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

function assertGateScriptSafety() {
  assert(fs.existsSync(absolute(GATE_SCRIPT)), 'Score-readiness gate script is missing.');
  const source = readText(GATE_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Score-readiness gate script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local Transport Shock free-proxy score-readiness gate using real-event sample-set review only',
    'score_readiness_gate_collect_more_keep_no_score_write',
    'continue_collecting_real_event_samples_before_score_integration_review',
    'scoreReadinessApproved',
    'scoreIntegrationApproved',
    'scoreWriteApproved',
    'productionWriteApproved',
    'eligibleForMainScore',
    'noScoreWrite'
  ]) {
    assert(source.includes(marker), `Score-readiness gate script missing required marker: ${marker}`);
  }
}

function assertReviewFixture() {
  assert(fs.existsSync(absolute(REVIEW_FIXTURE)), 'Real-event samples review fixture is missing.');
  const fixture = JSON.parse(readText(REVIEW_FIXTURE));
  assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples-review-v1', 'Review fixture schemaVersion mismatch.');
  assert(fixture.status === 'real_event_sample_set_review_ready_keep_no_score_write', 'Review fixture status mismatch.');
  assert(fixture.usableSampleCount === 1, 'Review fixture should contain one usable sample.');
  assert(fixture.knownDisruptionSampleCount === 1, 'Review fixture should contain one known-disruption sample.');
  assert(fixture.zeroControlSampleCount === 0, 'Review fixture should contain zero zero-control samples.');
  assert(fixture.scoreReadinessApproved === false, 'Review fixture must not approve score readiness.');
  assert(fixture.scoreWriteApproved === false, 'Review fixture must not approve score write.');
  assert(fixture.productionWriteApproved === false, 'Review fixture must not approve production write.');
  assert(fixture.eligibleForMainScore === false, 'Review fixture must not be main-score eligible.');
  assert(fixture.productionHistoricalReplayPerformed === false, 'Review fixture must not claim production replay.');
  assert(fixture.historicalBacktestPerformed === false, 'Review fixture must not claim historical backtest.');
  assert(fixture.boundaries.noNetworkCall === true, 'Review fixture must lock noNetworkCall.');
  assert(fixture.boundaries.noProductionWrite === true, 'Review fixture must lock noProductionWrite.');
  assert(fixture.boundaries.noScoreWrite === true, 'Review fixture must lock noScoreWrite.');
  assert(!JSON.stringify(fixture).includes('https://'), 'Review fixture must not include raw URLs.');
}

function assertGateOutput() {
  const gate = JSON.parse(runNode([
    GATE_SCRIPT,
    '--input',
    REVIEW_FIXTURE,
    '--no-output',
    '--json'
  ]));
  assert(gate.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1', 'Unexpected gate schemaVersion.');
  assert(gate.contractVersion === 'transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1', 'Unexpected gate contractVersion.');
  assert(gate.status === 'score_readiness_gate_collect_more_keep_no_score_write', 'Starter fixture should collect more samples.');
  assert(gate.recommendation === 'continue_collecting_real_event_samples_before_score_integration_review', 'Unexpected gate recommendation.');
  assert(gate.gatePassed === false, 'Starter fixture must not pass gate.');
  assert(gate.scoreReadinessGatePassed === false, 'Starter fixture must not pass score-readiness gate.');
  assert(gate.scoreReadinessApproved === false, 'Gate must not approve score readiness.');
  assert(gate.scoreIntegrationApproved === false, 'Gate must not approve score integration.');
  assert(gate.scoreWriteApproved === false, 'Gate must not approve score write.');
  assert(gate.productionWriteApproved === false, 'Gate must not approve production write.');
  assert(gate.eligibleForMainScore === false, 'Gate must not be main-score eligible.');
  assert(gate.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(gate.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(gate.productionHistoricalReplayPerformed === false, 'Gate must not claim production replay.');
  assert(gate.historicalBacktestPerformed === false, 'Gate must not claim historical backtest.');
  assert(gate.thresholds.minRealEventSamples === 6, 'Default min real-event samples should be 6.');
  assert(gate.thresholds.minKnownDisruptionSamples === 3, 'Default min known-disruption samples should be 3.');
  assert(gate.thresholds.minZeroControlSamples === 3, 'Default min zero-control samples should be 3.');
  assert(gate.thresholds.maxFalsePositiveRate === 0.2, 'Default false-positive cap should be 0.2.');
  assert(gate.thresholds.minKnownDisruptionDirectionalHitRate === 0.6, 'Default directional hit threshold should be 0.6.');
  assert(gate.observed.usableSampleCount === 1, 'Expected one usable observed sample.');
  assert(gate.observed.knownDisruptionSampleCount === 1, 'Expected one known-disruption observed sample.');
  assert(gate.observed.zeroControlSampleCount === 0, 'Expected zero zero-control observed samples.');
  assert(gate.observed.knownDisruptionDirectionalHitRate === 1, 'Expected known-disruption hit rate of 1.');
  assert(gate.observed.falsePositiveRate === null, 'Expected null false-positive rate without zero controls.');
  for (const blocker of [
    'real_event_sample_count_below_threshold',
    'known_disruption_sample_count_below_threshold',
    'zero_control_sample_count_below_threshold',
    'false_positive_rate_unavailable'
  ]) {
    assert(gate.blockers.some((item) => item.id === blocker), `Expected gate blocker: ${blocker}`);
  }
  assert(gate.productionImpact.affectsScoring === false, 'Gate must not affect scoring.');
  assert(gate.productionImpact.affectsMainJudgment === false, 'Gate must not affect main judgment.');
  assert(gate.boundaries.noNetworkCall === true, 'Gate must lock noNetworkCall.');
  assert(gate.boundaries.noProductionWrite === true, 'Gate must lock noProductionWrite.');
  assert(gate.boundaries.noScoreWrite === true, 'Gate must lock noScoreWrite.');
  assert(gate.boundaries.noMainJudgmentEligibility === true, 'Gate must lock noMainJudgmentEligibility.');
  assert(!JSON.stringify(gate).includes('https://'), 'Gate output must not include raw URLs.');
}

function assertStrictDoesNotFailBlockedFixture() {
  const result = spawnSync(process.execPath, [
    GATE_SCRIPT,
    '--input',
    REVIEW_FIXTURE,
    '--strict',
    '--no-output'
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  assert(result.status === 0, `Strict mode should allow blocked fixture: ${result.stderr || result.stdout}`);
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains free-proxy score-readiness gate marker and may have been wired too early: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
  const packageJson = JSON.parse(readText('package.json'));
  const checkSuite = readText('scripts/check-suite.mjs');
  for (const marker of [
    'transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1',
    'score_readiness_gate_collect_more_keep_no_score_write',
    'scoreReadinessApproved=false',
    'historicalBacktestPerformed=false'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy score-readiness gate'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing score-readiness gate marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy score-readiness gate'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing score-readiness gate boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-free-proxy-score-readiness-gate'], 'package.json missing gate review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-score-readiness-gate'], 'package.json missing gate checker.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-score-readiness-gate'), 'check-suite missing gate checker.');
}

function main() {
  assertGateScriptSafety();
  assertReviewFixture();
  assertGateOutput();
  assertStrictDoesNotFailBlockedFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy score-readiness gate: PASS');
}

main();
