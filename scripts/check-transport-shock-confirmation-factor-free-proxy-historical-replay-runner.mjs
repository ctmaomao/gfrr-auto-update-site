import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPLAY_SCRIPT = 'scripts/replay-transport-shock-confirmation-factor-free-proxy-historical-replay.mjs';
const SAMPLE_SET_REVIEW = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-samples-review-pass.json';

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
  'market.worker-preview.json',
  'bubble-watch'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-v1',
  'replay-transport-shock-confirmation-factor-free-proxy-historical-replay',
  'dry_run_pass_no_score_write'
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

function assertReplayScriptSafety() {
  assert(fs.existsSync(absolute(REPLAY_SCRIPT)), 'Historical replay dry-run script is missing.');
  const source = readText(REPLAY_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Historical replay dry-run script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local Transport Shock free-proxy historical replay runner dry-run scaffold only',
    'dry_run_pass_no_score_write',
    'dryRunReplayPerformed',
    'productionHistoricalReplayPerformed',
    'historicalBacktestPerformed',
    'falsePositiveRate',
    'knownDisruptionDirectionalHitRate',
    'noScoreWrite',
    'noProductionWrite'
  ]) {
    assert(source.includes(marker), `Historical replay dry-run script missing required marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(SAMPLE_SET_REVIEW)), 'Historical replay sample-set fixture is missing.');
  const fixture = JSON.parse(readText(SAMPLE_SET_REVIEW));
  assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review-v1', 'Sample-set fixture schemaVersion mismatch.');
  assert(fixture.status === 'pass', 'Sample-set fixture must pass.');
  assert(fixture.zeroControlContributionPct === 0, 'Sample-set zero-control contribution must stay 0.');
  assert(fixture.historicalBacktestPerformed === false, 'Sample-set fixture must not claim historical backtest.');
  assert(fixture.scoreWriteApproved === false, 'Sample-set fixture must not approve score write.');
  assert(fixture.productionWriteApproved === false, 'Sample-set fixture must not approve production write.');
  assert(fixture.eligibleForMainScore === false, 'Sample-set fixture must not be eligible for main score.');
  assert(fixture.boundaries?.noNetworkCall === true, 'Sample-set fixture missing noNetworkCall boundary.');
  assert(fixture.boundaries?.noProductionWrite === true, 'Sample-set fixture missing noProductionWrite boundary.');
  assert(fixture.boundaries?.rawCitationStored === false, 'Sample-set fixture must not store raw citation.');
}

function assertReplayOutput() {
  const stdout = runNode([
    REPLAY_SCRIPT,
    '--input',
    SAMPLE_SET_REVIEW,
    '--no-output',
    '--json'
  ]);
  const replay = JSON.parse(stdout);
  assert(replay.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-v1', 'Unexpected replay schemaVersion.');
  assert(replay.contractVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-dry-run-v1', 'Unexpected contractVersion.');
  assert(replay.status === 'dry_run_pass_no_score_write', 'Expected dry-run replay pass.');
  assert(replay.replayExecutionMode === 'dry_run_manual_artifact_only', 'Replay execution mode must stay manual-artifact dry-run.');
  assert(replay.dryRunReplayPerformed === true, 'Dry-run replay should be performed on fixture.');
  assert(replay.productionHistoricalReplayPerformed === false, 'Production historical replay must not be performed.');
  assert(replay.historicalBacktestPerformed === false, 'Historical backtest must not be claimed.');
  assert(replay.scoreIntegrationApproved === false, 'Score integration must not be approved.');
  assert(replay.scoreWriteApproved === false, 'Score write must not be approved.');
  assert(replay.productionWriteApproved === false, 'Production write must not be approved.');
  assert(replay.frontendDisplayApproved === false, 'Frontend display must not be approved.');
  assert(replay.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(replay.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(replay.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(replay.metrics.usableSampleCount === 2, 'Expected two usable samples.');
  assert(replay.metrics.zeroControlSampleCount === 1, 'Expected one zero-control sample.');
  assert(replay.metrics.knownDisruptionSampleCount === 1, 'Expected one known-disruption sample.');
  assert(replay.metrics.falsePositiveRate === 0, 'False-positive rate must be 0 for fixture.');
  assert(replay.metrics.knownDisruptionDirectionalHitRate === 1, 'Known-disruption hit rate must be 1 for fixture.');
  assert(replay.metrics.maximumCandidateContributionPct === 2, 'Maximum contribution should be 2 for fixture.');
  assert(replay.productionImpact.affectsScoring === false, 'Replay must not affect scoring.');
  assert(replay.productionImpact.affectsMainJudgment === false, 'Replay must not affect main judgment.');
  assert(replay.boundaries.noNetworkCall === true, 'Replay boundary must lock noNetworkCall.');
  assert(replay.boundaries.noProductionWrite === true, 'Replay boundary must lock noProductionWrite.');
  assert(replay.boundaries.noScoreWrite === true, 'Replay boundary must lock noScoreWrite.');
  assert(replay.boundaries.noProductionReplayExecution === true, 'Replay boundary must lock noProductionReplayExecution.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains historical replay dry-run marker and may have been wired too early: ${marker}`);
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
    'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-v1',
    'dry_run_pass_no_score_write',
    'historicalBacktestPerformed=false'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy historical replay runner dry-run scaffold'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing dry-run runner marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy historical replay runner dry-run scaffold'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing dry-run runner boundary.');
  assert(packageJson.scripts['replay:transport-shock-confirmation-factor-free-proxy-historical-replay'], 'package.json missing replay script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-historical-replay-runner'], 'package.json missing replay checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-historical-replay-runner'), 'check-suite missing replay checker.');
}

function main() {
  assertReplayScriptSafety();
  assertFixture();
  assertReplayOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy historical replay runner dry-run: PASS');
}

main();
