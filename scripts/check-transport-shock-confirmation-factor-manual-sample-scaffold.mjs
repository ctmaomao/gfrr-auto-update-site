import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-manual-sample.mjs';
const SAMPLE_INPUT = 'docs/fixtures/transport-shock-confirmation-factor/manual-sample-input.json';

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
  'transport-shock-confirmation-factor-manual-sample-input-v1',
  'transport-shock-confirmation-factor-manual-sample-review-v1',
  'transport-shock-confirmation-factor-manual-sample-scaffold-v1',
  'review-transport-shock-confirmation-factor-manual-sample'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Transport shock manual sample review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Review script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'dry-run-only Transport Shock Confirmation Factor manual sample scaffold',
    'outputOnlyToManualArtifacts',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
    'routeFreightConfirmation',
    'not_connected',
    'eligibleForMainScore'
  ]) {
    assert(source.includes(marker), `Review script missing required boundary marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(SAMPLE_INPUT)), 'Transport shock manual sample fixture is missing.');
  const fixture = JSON.parse(readText(SAMPLE_INPUT));
  assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-manual-sample-input-v1', 'Unexpected sample input schemaVersion.');
  assert(fixture.sourceReviewContract === 'transport-shock-confirmation-factor-source-review-v1', 'Unexpected sourceReviewContract.');
  assert(fixture.sourceRights?.liveFetchApproved === false, 'Fixture must not approve live fetch.');
  assert(fixture.sourceRights?.productionWriteApproved === false, 'Fixture must not approve production write.');
  assert(fixture.sourceRights?.scoreApproved === false, 'Fixture must not approve scoring.');
  assert(Array.isArray(fixture.observations), 'Fixture observations must be an array.');
  assert(fixture.observations.some((row) => row.sourceKey === 'solactive_breakwave_wet_freight_futures_index'), 'Fixture missing Solactive observation.');
  assert(fixture.observations.some((row) => row.sourceKey === 'cme_td3c_public_product_page'), 'Fixture missing CME TD3C observation.');
  assert(fixture.observations.some((row) => row.sourceKey === 'baltic_weekly_tanker_report_public_route_signal'), 'Fixture missing Baltic Weekly observation.');
}

function assertReviewOutput() {
  const stdout = runNode([REVIEW_SCRIPT, '--input', SAMPLE_INPUT, '--no-output', '--json']);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-manual-sample-review-v1', 'Unexpected review schemaVersion.');
  assert(review.contractVersion === 'transport-shock-confirmation-factor-manual-sample-scaffold-v1', 'Unexpected review contractVersion.');
  assert(review.status === 'dry_run_only', 'Review status must remain dry_run_only.');
  assert(review.promotionEligible === false, 'Review must not be promotion eligible.');
  assert(review.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.shadowScoreApproved === false, 'Review must not approve shadow score.');
  assert(review.frontendDisplayApproved === false, 'Review must not approve frontend display.');
  assert(review.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(review.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(review.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(review.review.acceptedObservationCount === 3, 'Expected three accepted observations from fixture.');
  assert(review.review.rejectedObservationCount === 0, 'Fixture should have no rejected observations.');
  assert(review.review.bucketCoverage.free_route_linked_tanker_transport_pressure_proxy === 2, 'Expected two free proxy observations.');
  assert(review.review.bucketCoverage.baltic_weekly_tanker_report_public_route_signal === 1, 'Expected one Baltic Weekly observation.');
  assert(review.review.directionCounts.tightening === 2, 'Expected two tightening observations.');
  assert(review.review.directionCounts.mixed === 1, 'Expected one mixed observation.');
  assert(review.review.acceptedObservations.every((row) => row.rawCitationStored === false), 'Accepted observations must not store raw citation text.');
  assert(review.review.acceptedObservations.every((row) => row.sourceCitationHash), 'Accepted observations should include citation hashes.');
  assert(review.boundaries.noNetworkCall === true, 'Review boundaries must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Review boundaries must lock noProductionWrite.');
  assert(review.boundaries.affectsScoring === false, 'Review boundaries must lock affectsScoring false.');
  assert(review.boundaries.affectsMainJudgment === false, 'Review boundaries must lock affectsMainJudgment false.');
}

function assertMissingInputIsNonFatal() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--input',
    'manual-artifacts/transport-shock-confirmation-factor/missing-input.json',
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
      assert(!source.includes(marker), `${relativePath} contains manual-sample marker and may have wired Transport Shock Confirmation Factor: ${marker}`);
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
    'review:transport-shock-confirmation-factor-manual-sample',
    'transport-shock-confirmation-factor-manual-sample-review-v1',
    'manual-artifacts/transport-shock-confirmation-factor',
    'manual sample scaffold',
    'no live fetch',
    'no production data write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-manual-sample-scaffold-v1',
    'transport-shock-confirmation-factor-manual-sample-review-v1',
    'manual-artifacts/transport-shock-confirmation-factor',
    'not_connected'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-manual-sample-scaffold-v1'), 'SIGNAL_INTAKE missing manual sample scaffold marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor manual sample scaffold'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing manual sample scaffold marker.');
  assert(agents.includes('Transport Shock Confirmation Factor manual sample scaffold'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing manual sample scaffold boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-manual-sample'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-manual-sample-scaffold'], 'package.json missing check script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-manual-sample-scaffold'), 'check-suite missing manual sample scaffold check.');
}

function main() {
  assertReviewScriptSafety();
  assertFixture();
  assertReviewOutput();
  assertMissingInputIsNonFatal();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor manual sample scaffold: PASS');
}

main();
