import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-free-proxy-historical-replay-runner.mjs';
const RUNNER_FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-runner-pass.json';

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
  'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-review-v1',
  'review-transport-shock-confirmation-factor-free-proxy-historical-replay-runner',
  'runner_fixture_review_pass_keep_no_score_write'
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

function assertReviewScriptSafety() {
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Historical replay runner review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Runner review script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local Transport Shock free-proxy historical replay runner fixture review only',
    'runner_fixture_review_pass_keep_no_score_write',
    'expand_historical_replay_samples_before_any_score_candidate_keep_no_score_write',
    'productionHistoricalReplayPerformed',
    'historicalBacktestPerformed',
    'scoreWriteApproved',
    'eligibleForMainScore',
    'noProductionReplayExecution',
    'noScoreWrite'
  ]) {
    assert(source.includes(marker), `Runner review script missing required marker: ${marker}`);
  }
}

function assertRunnerFixture() {
  assert(fs.existsSync(absolute(RUNNER_FIXTURE)), 'Historical replay runner fixture is missing.');
  const fixture = JSON.parse(readText(RUNNER_FIXTURE));
  assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-v1', 'Runner fixture schemaVersion mismatch.');
  assert(fixture.status === 'dry_run_pass_no_score_write', 'Runner fixture must be dry-run pass.');
  assert(fixture.dryRunReplayPerformed === true, 'Runner fixture must perform dry-run replay.');
  assert(fixture.productionHistoricalReplayPerformed === false, 'Runner fixture must not claim production historical replay.');
  assert(fixture.historicalBacktestPerformed === false, 'Runner fixture must not claim historical backtest.');
  assert(fixture.scoreWriteApproved === false, 'Runner fixture must not approve score write.');
  assert(fixture.productionWriteApproved === false, 'Runner fixture must not approve production write.');
  assert(fixture.frontendDisplayApproved === false, 'Runner fixture must not approve frontend display.');
  assert(fixture.eligibleForMainScore === false, 'Runner fixture must not be eligible for main score.');
  assert(fixture.routeFreightConfirmation === 'not_connected', 'Runner fixture routeFreightConfirmation must stay not_connected.');
  assert(fixture.marketConfirmation === 'not_connected', 'Runner fixture marketConfirmation must stay not_connected.');
  assert(fixture.metrics.usableSampleCount === 2, 'Runner fixture expected two usable samples.');
  assert(fixture.metrics.falsePositiveRate === 0, 'Runner fixture falsePositiveRate must be 0.');
  assert(fixture.metrics.knownDisruptionDirectionalHitRate === 1, 'Runner fixture knownDisruptionDirectionalHitRate must be 1.');
  assert(fixture.metrics.maximumCandidateContributionPct === 2, 'Runner fixture maximumCandidateContributionPct must be 2.');
  assert(fixture.boundaries.noNetworkCall === true, 'Runner fixture missing noNetworkCall boundary.');
  assert(fixture.boundaries.noProductionWrite === true, 'Runner fixture missing noProductionWrite boundary.');
  assert(fixture.boundaries.noScoreWrite === true, 'Runner fixture missing noScoreWrite boundary.');
  assert(fixture.boundaries.noProductionReplayExecution === true, 'Runner fixture missing noProductionReplayExecution boundary.');
  assert(fixture.boundaries.rawCitationStored === false, 'Runner fixture must not store raw citation.');
}

function assertReviewOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--input',
    RUNNER_FIXTURE,
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-review-v1', 'Unexpected review schemaVersion.');
  assert(review.contractVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-fixture-review-v1', 'Unexpected review contractVersion.');
  assert(review.status === 'runner_fixture_review_pass_keep_no_score_write', 'Expected runner fixture review pass.');
  assert(review.recommendation === 'expand_historical_replay_samples_before_any_score_candidate_keep_no_score_write', 'Unexpected review recommendation.');
  assert(review.blockerCount === 0, 'Review should have no blockers.');
  assert(review.warningCount === 2, 'Review should keep two warnings.');
  assert(review.metrics.falsePositiveRate === 0, 'Review falsePositiveRate should be 0.');
  assert(review.metrics.knownDisruptionDirectionalHitRate === 1, 'Review knownDisruptionDirectionalHitRate should be 1.');
  assert(review.metrics.maximumCandidateContributionPct === 2, 'Review maximumCandidateContributionPct should be 2.');
  assert(review.productionHistoricalReplayPerformed === false, 'Review must not claim production historical replay.');
  assert(review.historicalBacktestPerformed === false, 'Review must not claim historical backtest.');
  assert(review.scoreIntegrationApproved === false, 'Review must not approve score integration.');
  assert(review.scoreWriteApproved === false, 'Review must not approve score write.');
  assert(review.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.frontendDisplayApproved === false, 'Review must not approve frontend display.');
  assert(review.eligibleForMainScore === false, 'Review must not be eligible for main score.');
  assert(review.productionImpact.affectsScoring === false, 'Review must not affect scoring.');
  assert(review.productionImpact.affectsMainJudgment === false, 'Review must not affect main judgment.');
  assert(review.boundaries.noNetworkCall === true, 'Review boundary must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Review boundary must lock noProductionWrite.');
  assert(review.boundaries.noScoreWrite === true, 'Review boundary must lock noScoreWrite.');
  assert(review.boundaries.noProductionReplayExecution === true, 'Review boundary must lock noProductionReplayExecution.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains runner review marker and may have been wired too early: ${marker}`);
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
    'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-review-v1',
    'runner_fixture_review_pass_keep_no_score_write',
    'productionHistoricalReplayPerformed=false'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy historical replay runner fixture review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing runner fixture review marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy historical replay runner fixture review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing runner fixture review boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-free-proxy-historical-replay-runner'], 'package.json missing runner review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-historical-replay-runner-review'], 'package.json missing runner review checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-historical-replay-runner-review'), 'check-suite missing runner review checker.');
}

function main() {
  assertReviewScriptSafety();
  assertRunnerFixture();
  assertReviewOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy historical replay runner review: PASS');
}

main();
