import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-market-confirmation-manual-sample.mjs';
const SAMPLE_INPUT = 'docs/fixtures/transport-shock-confirmation-factor/market-confirmation-manual-sample-input.json';

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
  'realtime/market.json',
  'market.worker-preview.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-market-confirmation-manual-sample-input-v1',
  'transport-shock-market-confirmation-manual-sample-review-v1',
  'transport-shock-market-confirmation-manual-sample-scaffold-v1',
  'review-transport-shock-market-confirmation-manual-sample'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Transport shock market-confirmation manual sample review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Review script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'dry-run-only Transport Shock market-confirmation manual sample scaffold',
    'noMarketConfirmationWrite',
    'noScoreWrite',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
    'marketConfirmation',
    'not_connected',
    'eligibleForMainScore'
  ]) {
    assert(source.includes(marker), `Review script missing required boundary marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(SAMPLE_INPUT)), 'Market-confirmation manual sample fixture is missing.');
  const fixture = JSON.parse(readText(SAMPLE_INPUT));
  assert(fixture.schemaVersion === 'transport-shock-market-confirmation-manual-sample-input-v1', 'Unexpected sample input schemaVersion.');
  assert(fixture.sourceReviewContract === 'transport-shock-confirmation-factor-market-confirmation-source-review-v1', 'Unexpected sourceReviewContract.');
  assert(fixture.sourceRights?.liveFetchApproved === false, 'Fixture must not approve live fetch.');
  assert(fixture.sourceRights?.productionWriteApproved === false, 'Fixture must not approve production write.');
  assert(fixture.sourceRights?.marketConfirmationWriteApproved === false, 'Fixture must not approve marketConfirmation write.');
  assert(fixture.sourceRights?.scoreApproved === false, 'Fixture must not approve scoring.');
  assert(Array.isArray(fixture.observations), 'Fixture observations must be an array.');
  assert(fixture.observations.some((row) => row.sourceKey === 'brent_futures_price_curve_proxy'), 'Fixture missing Brent futures proxy observation.');
  assert(fixture.observations.some((row) => row.sourceKey === 'eia_brent_spot_proxy'), 'Fixture missing EIA Brent spot proxy observation.');
  assert(fixture.observations.some((row) => row.sourceKey === 'oil_news_market_reaction_bucket'), 'Fixture missing Oil News market reaction observation.');
}

function assertReviewOutput() {
  const stdout = runNode([REVIEW_SCRIPT, '--input', SAMPLE_INPUT, '--no-output', '--json']);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-market-confirmation-manual-sample-review-v1', 'Unexpected review schemaVersion.');
  assert(review.contractVersion === 'transport-shock-market-confirmation-manual-sample-scaffold-v1', 'Unexpected review contractVersion.');
  assert(review.sourceReviewContract === 'transport-shock-confirmation-factor-market-confirmation-source-review-v1', 'Unexpected sourceReviewContract.');
  assert(review.status === 'dry_run_only', 'Review status must remain dry_run_only.');
  assert(review.promotionEligible === false, 'Review must not be promotion eligible.');
  assert(review.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.marketConfirmationWriteApproved === false, 'Review must not approve marketConfirmation write.');
  assert(review.scoreWriteApproved === false, 'Review must not approve score write.');
  assert(review.frontendDisplayApproved === false, 'Review must not approve frontend display.');
  assert(review.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(review.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(review.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(review.review.acceptedObservationCount === 4, 'Expected four accepted observations from fixture.');
  assert(review.review.rejectedObservationCount === 0, 'Fixture should have no rejected observations.');
  assert(review.review.bucketCoverage.brent_price_structure_confirmation === 2, 'Expected two Brent price-structure observations.');
  assert(review.review.bucketCoverage.oil_news_market_reaction_confirmation === 1, 'Expected one Oil News market-reaction observation.');
  assert(review.review.bucketCoverage.odp_market_stress_context === 1, 'Expected one ODP market-stress observation.');
  assert(review.review.directionCounts.tightening === 1, 'Expected one tightening observation.');
  assert(review.review.directionCounts.easing === 1, 'Expected one easing observation.');
  assert(review.review.directionCounts.market_reaction_present === 1, 'Expected one market reaction observation.');
  assert(review.review.directionCounts.mixed === 1, 'Expected one mixed observation.');
  assert(review.review.acceptedObservations.every((row) => row.rawCitationStored === false), 'Accepted observations must not store raw citation text.');
  assert(review.review.acceptedObservations.every((row) => row.sourceCitationHash), 'Accepted observations should include citation hashes.');
  assert(
    review.review.acceptedObservations.find((row) => row.sourceKey === 'odp_crack_spread_proxy')?.value === null,
    'Null market sample values must remain null, not 0.'
  );
  assert(review.boundaries.noNetworkCall === true, 'Review boundaries must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Review boundaries must lock noProductionWrite.');
  assert(review.boundaries.noMarketConfirmationWrite === true, 'Review boundaries must lock noMarketConfirmationWrite.');
  assert(review.boundaries.noScoreWrite === true, 'Review boundaries must lock noScoreWrite.');
  assert(review.boundaries.affectsScoring === false, 'Review boundaries must lock affectsScoring false.');
  assert(review.boundaries.affectsMainJudgment === false, 'Review boundaries must lock affectsMainJudgment false.');
}

function assertMissingInputIsNonFatal() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--input',
    'manual-artifacts/transport-shock-confirmation-factor/missing-market-confirmation-input.json',
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.status === 'input_missing_dry_run_only', 'Missing manual input should stay a dry-run-only state.');
  assert(review.promotionEligible === false, 'Missing input must not be promotion eligible.');
  assert(review.review.acceptedObservationCount === 0, 'Missing input should not produce accepted observations.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains market-confirmation manual-sample marker: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
  const packageJson = JSON.parse(readText('package.json'));
  const checkSuite = readText('scripts/check-suite.mjs');

  for (const marker of [
    'review:transport-shock-market-confirmation-manual-sample',
    'transport-shock-market-confirmation-manual-sample-review-v1',
    'market-confirmation manual sample scaffold',
    'no marketConfirmation write',
    'no score write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-market-confirmation-manual-sample-scaffold-v1',
    'transport-shock-market-confirmation-manual-sample-review-v1',
    'marketConfirmation` 继续 `not_connected`'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-market-confirmation-manual-sample-scaffold-v1'), 'SIGNAL_INTAKE missing market manual sample marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor market-confirmation manual sample scaffold'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing market manual sample marker.');
  assert(agents.includes('Transport Shock Confirmation Factor market-confirmation manual sample scaffold'), 'AGENTS missing market manual sample boundary.');
  assert(packageJson.scripts['review:transport-shock-market-confirmation-manual-sample'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-market-confirmation-manual-sample-scaffold'], 'package.json missing check script.');
  assert(checkSuite.includes('check:transport-shock-market-confirmation-manual-sample-scaffold'), 'check-suite missing market manual sample check.');
}

function main() {
  assertReviewScriptSafety();
  assertFixture();
  assertReviewOutput();
  assertMissingInputIsNonFatal();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock market-confirmation manual sample scaffold: PASS');
}

main();
