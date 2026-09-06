import { readJson, runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SAMPLE_REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-free-proxy-historical-replay-sample.mjs';
const SAMPLE_SET_REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-free-proxy-historical-replay-samples.mjs';
const RUNNER_SCRIPT = 'scripts/replay-transport-shock-confirmation-factor-free-proxy-historical-replay.mjs';
const EXPANDED_REVIEW = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-samples-review-expanded-pass.json';

const SAMPLE_INPUTS = [
  ['known_disruption_tightening', 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-known-disruption.json', 2],
  ['headline_only_false_positive', 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-headline-only.json', 0],
  ['single_chokepoint_noise', 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-single-chokepoint-noise.json', 0],
  ['stale_physical_proxy', 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-stale-physical-proxy.json', 0],
  ['market_confirmation_divergence', 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-market-confirmation-divergence.json', 0],
  ['benign_baseline', 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-benign-baseline.json', 0]
];

const SAMPLE_REVIEWS = [
  'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-review-known-disruption.json',
  'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-review-headline-only.json',
  'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-review-single-chokepoint-noise.json',
  'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-review-stale-physical-proxy.json',
  'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-review-market-confirmation-divergence.json',
  'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-sample-review-benign-baseline.json'
];

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

const RUNTIME_FORBIDDEN_MARKERS = [
  'free-proxy-historical-replay-sample-expansion',
  'free-proxy-historical-replay-samples-review-expanded-pass',
  'expanded_sample_family_coverage_pass_keep_no_score_write'
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

function assertSampleInputsReviewIndividually() {
  for (const [familyKey, fixturePath, expectedContribution] of SAMPLE_INPUTS) {
    assert(fs.existsSync(absolute(fixturePath)), `Sample input fixture missing: ${fixturePath}`);
    const stdout = runNode([
      SAMPLE_REVIEW_SCRIPT,
      '--input',
      fixturePath,
      '--no-output',
      '--json'
    ]);
    const review = JSON.parse(stdout);
    assert(review.status === 'sample_review_ready_keep_no_score_write', `${fixturePath} did not review cleanly.`);
    assert(review.familyKey === familyKey, `${fixturePath} familyKey mismatch.`);
    assert(review.observedCandidateContributionPct === expectedContribution, `${fixturePath} contribution mismatch.`);
    assert(review.acceptedForFutureReplayDataset === true, `${fixturePath} must be accepted for future replay dataset only.`);
    assert(review.historicalBacktestPerformed === false, `${fixturePath} must not claim historical backtest.`);
    assert(review.scoreWriteApproved === false, `${fixturePath} must not approve score write.`);
    assert(review.productionWriteApproved === false, `${fixturePath} must not approve production write.`);
    assert(review.eligibleForMainScore === false, `${fixturePath} must not be eligible for main score.`);
    assert(review.boundaries.noNetworkCall === true, `${fixturePath} missing noNetworkCall boundary.`);
    assert(review.boundaries.noScoreWrite === true, `${fixturePath} missing noScoreWrite boundary.`);
    assert(!JSON.stringify(review).includes('https://'), `${fixturePath} review output must not store raw URLs.`);
  }
}

function assertReviewFixtures() {
  for (const reviewPath of SAMPLE_REVIEWS) {
    assert(fs.existsSync(absolute(reviewPath)), `Sample review fixture missing: ${reviewPath}`);
    const review = readJson(reviewPath);
    assert(review.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-review-v1', `${reviewPath} schemaVersion mismatch.`);
    assert(review.status === 'sample_review_ready_keep_no_score_write', `${reviewPath} status mismatch.`);
    assert(review.acceptedForFutureReplayDataset === true, `${reviewPath} not accepted for future replay dataset.`);
    assert(review.historicalBacktestPerformed === false, `${reviewPath} must not claim historical backtest.`);
    assert(review.scoreWriteApproved === false, `${reviewPath} must not approve score write.`);
    assert(review.productionWriteApproved === false, `${reviewPath} must not approve production write.`);
    assert(review.eligibleForMainScore === false, `${reviewPath} must not be eligible for main score.`);
    assert(review.review.rawCitationStored === false, `${reviewPath} must not store raw citation.`);
    assert(review.review.compactEvidence.every((row) => row.rawCitationStored === false), `${reviewPath} compact evidence must not store raw citation.`);
  }
}

function assertGeneratedSampleSetReview() {
  const args = [
    SAMPLE_SET_REVIEW_SCRIPT,
    ...SAMPLE_REVIEWS.flatMap((fixturePath) => ['--input', fixturePath]),
    '--min-samples',
    '6',
    '--min-zero-control-samples',
    '5',
    '--no-output',
    '--json'
  ];
  const review = JSON.parse(runNode(args));
  assert(review.status === 'pass', 'Expanded sample set review should pass.');
  assert(review.sampleReviewCount === 6, 'Expanded sample set should include six reviews.');
  assert(review.usableSampleReviewCount === 6, 'Expanded sample set should include six usable reviews.');
  assert(review.zeroControlSampleCount === 5, 'Expanded sample set should include five zero controls.');
  assert(review.knownDisruptionSampleCount === 1, 'Expanded sample set should include one known disruption.');
  assert(review.zeroControlContributionPct === 0, 'Expanded zero-control contribution must be 0.');
  for (const [familyKey] of SAMPLE_INPUTS) {
    assert(review.familyCoverage[familyKey] === 1, `Expanded sample set missing family coverage: ${familyKey}`);
  }
  assert(review.historicalBacktestPerformed === false, 'Expanded sample set must not claim historical backtest.');
  assert(review.scoreWriteApproved === false, 'Expanded sample set must not approve score write.');
  assert(review.productionWriteApproved === false, 'Expanded sample set must not approve production write.');
  assert(review.eligibleForMainScore === false, 'Expanded sample set must not be eligible for main score.');
}

function assertExpandedReviewFixture() {
  assert(fs.existsSync(absolute(EXPANDED_REVIEW)), 'Expanded sample-set review fixture is missing.');
  const fixture = readJson(EXPANDED_REVIEW);
  assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review-v1', 'Expanded fixture schemaVersion mismatch.');
  assert(fixture.status === 'pass', 'Expanded fixture must pass.');
  assert(fixture.sampleReviewCount === 6, 'Expanded fixture expected six sample reviews.');
  assert(fixture.zeroControlSampleCount === 5, 'Expanded fixture expected five zero controls.');
  assert(fixture.knownDisruptionSampleCount === 1, 'Expanded fixture expected one known disruption.');
  assert(fixture.zeroControlContributionPct === 0, 'Expanded fixture zero control contribution must be 0.');
  assert(fixture.historicalBacktestPerformed === false, 'Expanded fixture must not claim historical backtest.');
  assert(fixture.scoreWriteApproved === false, 'Expanded fixture must not approve score write.');
  assert(fixture.productionWriteApproved === false, 'Expanded fixture must not approve production write.');
  assert(fixture.eligibleForMainScore === false, 'Expanded fixture must not be eligible for main score.');
  for (const [familyKey] of SAMPLE_INPUTS) {
    assert(fixture.familyCoverage[familyKey] === 1, `Expanded fixture missing family coverage: ${familyKey}`);
  }
}

function assertRunnerWithExpandedFixture() {
  const replay = JSON.parse(runNode([
    RUNNER_SCRIPT,
    '--input',
    EXPANDED_REVIEW,
    '--no-output',
    '--json'
  ]));
  assert(replay.status === 'dry_run_pass_no_score_write', 'Runner should pass against expanded fixture.');
  assert(replay.metrics.usableSampleCount === 6, 'Runner expanded fixture expected six usable samples.');
  assert(replay.metrics.zeroControlSampleCount === 5, 'Runner expanded fixture expected five zero controls.');
  assert(replay.metrics.knownDisruptionSampleCount === 1, 'Runner expanded fixture expected one known disruption.');
  assert(replay.metrics.falsePositiveRate === 0, 'Runner expanded fixture falsePositiveRate must stay 0.');
  assert(replay.metrics.knownDisruptionDirectionalHitRate === 1, 'Runner expanded fixture knownDisruptionDirectionalHitRate must stay 1.');
  assert(replay.metrics.maximumCandidateContributionPct === 2, 'Runner expanded fixture maximum contribution should stay 2.');
  assert(replay.scoreWriteApproved === false, 'Runner expanded fixture must not approve score write.');
  assert(replay.productionWriteApproved === false, 'Runner expanded fixture must not approve production write.');
  assert(replay.eligibleForMainScore === false, 'Runner expanded fixture must not be eligible for main score.');
  assert(replay.boundaries.noProductionReplayExecution === true, 'Runner expanded fixture must lock noProductionReplayExecution.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains sample-expansion marker and may have been wired too early: ${marker}`);
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
    'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-expansion-v1',
    'expanded_sample_family_coverage_pass_keep_no_score_write',
    'historicalBacktestPerformed=false'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy historical replay sample expansion'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing sample expansion marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy historical replay sample expansion'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing sample expansion boundary.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-historical-replay-sample-expansion'], 'package.json missing sample expansion checker.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-historical-replay-sample-expansion'), 'check-suite missing sample expansion checker.');
}

function main() {
  assertSampleInputsReviewIndividually();
  assertReviewFixtures();
  assertGeneratedSampleSetReview();
  assertExpandedReviewFixture();
  assertRunnerWithExpandedFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy historical replay sample expansion: PASS');
}

main();
