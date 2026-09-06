import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-free-proxy-historical-replay-samples.mjs';
const SAMPLE_HEADLINE_ONLY = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-review-headline-only.json';
const SAMPLE_KNOWN_DISRUPTION = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-review-known-disruption.json';

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
  'transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review-v1',
  'review-transport-shock-confirmation-factor-free-proxy-historical-replay-samples',
  'historical_replay_sample_set_ready_keep_no_score_write'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Historical replay samples review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Historical replay samples review script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local Transport Shock free-proxy historical replay sample set review only',
    'historical_replay_sample_set_ready_keep_no_score_write',
    'zeroControlContributionPct',
    'historicalBacktestPerformed',
    'noReplayExecution',
    'noScoreWrite',
    'noProductionWrite',
    'rawCitationStored'
  ]) {
    assert(source.includes(marker), `Historical replay samples review script missing required marker: ${marker}`);
  }
}

function assertFixtures() {
  for (const sample of [SAMPLE_HEADLINE_ONLY, SAMPLE_KNOWN_DISRUPTION]) {
    assert(fs.existsSync(absolute(sample)), `Fixture missing: ${sample}`);
    const fixture = JSON.parse(readText(sample));
    assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1', `${sample} schemaVersion mismatch.`);
    assert(fixture.status === 'sample_review_ready_keep_no_score_write', `${sample} must stay ready/no-score-write.`);
    assert(fixture.acceptedForFutureReplayDataset === true, `${sample} must be accepted for future dataset only.`);
    assert(fixture.historicalBacktestPerformed === false, `${sample} must not claim historical backtest.`);
    assert(fixture.scoreWriteApproved === false, `${sample} must not approve score write.`);
    assert(fixture.productionWriteApproved === false, `${sample} must not approve production write.`);
    assert(fixture.eligibleForMainScore === false, `${sample} eligibleForMainScore must stay false.`);
    assert(fixture.routeFreightConfirmation === 'not_connected', `${sample} routeFreightConfirmation must stay not_connected.`);
    assert(fixture.marketConfirmation === 'not_connected', `${sample} marketConfirmation must stay not_connected.`);
    assert(fixture.boundaries?.noNetworkCall === true, `${sample} missing noNetworkCall boundary.`);
    assert(fixture.boundaries?.noProductionWrite === true, `${sample} missing noProductionWrite boundary.`);
    assert(fixture.boundaries?.noScoreWrite === true, `${sample} missing noScoreWrite boundary.`);
    assert(fixture.boundaries?.noReplayExecution === true, `${sample} missing noReplayExecution boundary.`);
    assert(fixture.review?.rawCitationStored === false, `${sample} must not store raw citation.`);
    assert(fixture.review.compactEvidence.every((row) => row.rawCitationStored === false), `${sample} compact evidence must not store raw citation.`);
  }
}

function assertReviewOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--input',
    SAMPLE_HEADLINE_ONLY,
    '--input',
    SAMPLE_KNOWN_DISRUPTION,
    '--min-samples',
    '2',
    '--min-zero-control-samples',
    '1',
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review-v1', 'Unexpected review schemaVersion.');
  assert(review.contractVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review-v1', 'Unexpected contractVersion.');
  assert(review.status === 'pass', 'Expected sample set review to pass.');
  assert(review.recommendation === 'historical_replay_sample_set_ready_keep_no_score_write', 'Unexpected recommendation.');
  assert(review.sampleReviewCount === 2, 'Expected two sample reviews.');
  assert(review.usableSampleReviewCount === 2, 'Expected two usable sample reviews.');
  assert(review.zeroControlSampleCount === 1, 'Expected one zero-control sample.');
  assert(review.knownDisruptionSampleCount === 1, 'Expected one known-disruption sample.');
  assert(review.zeroControlContributionPct === 0, 'Zero-control contribution must stay 0.');
  assert(review.familyCoverage.headline_only_false_positive === 1, 'Expected headline-only family coverage.');
  assert(review.familyCoverage.known_disruption_tightening === 1, 'Expected known-disruption family coverage.');
  assert(review.historicalReplayRunnerImplemented === false, 'Review must not claim replay runner implementation.');
  assert(review.historicalBacktestPerformed === false, 'Review must not claim historical backtest.');
  assert(review.scoreIntegrationApproved === false, 'Review must not approve score integration.');
  assert(review.scoreWriteApproved === false, 'Review must not approve score write.');
  assert(review.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.productionDisplayApproved === false, 'Review must not approve production display.');
  assert(review.frontendDisplayApproved === false, 'Review must not approve frontend display.');
  assert(review.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(review.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(review.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(review.productionImpact.affectsScoring === false, 'Review must not affect scoring.');
  assert(review.productionImpact.affectsMainJudgment === false, 'Review must not affect main judgment.');
  assert(review.boundaries.noNetworkCall === true, 'Review boundaries must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Review boundaries must lock noProductionWrite.');
  assert(review.boundaries.noScoreWrite === true, 'Review boundaries must lock noScoreWrite.');
  assert(review.boundaries.noReplayExecution === true, 'Review boundaries must lock noReplayExecution.');
  const serialized = JSON.stringify(review);
  assert(!serialized.includes('operator-provided citation'), 'Review output must not store raw citation text.');
  assert(!serialized.includes('https://'), 'Review output must not store raw citation URLs.');
}

function assertEmptyReviewIsNonFatalWhenAllowed() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--allow-empty',
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.status === 'empty', 'Empty allowed review should return empty.');
  assert(review.historicalBacktestPerformed === false, 'Empty review must not claim historical backtest.');
  assert(review.scoreWriteApproved === false, 'Empty review must not approve score write.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains historical replay sample-set marker and may have been wired too early: ${marker}`);
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
    'transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review-v1',
    'historical_replay_sample_set_ready_keep_no_score_write',
    'historicalBacktestPerformed=false'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy historical replay sample set review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing sample set review marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy historical replay sample set review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing sample set review boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-free-proxy-historical-replay-samples'], 'package.json missing sample set review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review'], 'package.json missing sample set review checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review'), 'check-suite missing sample set review check.');
}

function main() {
  assertReviewScriptSafety();
  assertFixtures();
  assertReviewOutput();
  assertEmptyReviewIsNonFatalWhenAllowed();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy historical replay samples review: PASS');
}

main();
