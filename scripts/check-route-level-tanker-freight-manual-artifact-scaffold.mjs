import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-route-level-tanker-freight-manual-artifact.mjs';
const SAMPLE_INPUT = 'docs/fixtures/route-level-tanker-freight/manual-input.sample.json';

const RUNTIME_FILES = [
  'scripts/run-daily-pipeline.mjs',
  'scripts/run-realtime.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js'
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
  'realtime/market.json',
  'market.worker-preview.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'route-level-tanker-freight-manual-input-v1',
  'route-level-tanker-freight-proof-review-v1',
  'route-level-tanker-freight-manual-artifact-scaffold-v1',
  'review-route-level-tanker-freight-manual-artifact',
  'manual_artifact_reviewable_keep_dry_run_only'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Manual artifact review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Review script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'dry-run-only route-level tanker freight manual artifact review',
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
  assert(fs.existsSync(absolute(SAMPLE_INPUT)), 'Manual artifact sample fixture is missing.');
  const fixture = JSON.parse(readText(SAMPLE_INPUT));
  assert(fixture.schemaVersion === 'route-level-tanker-freight-manual-input-v1', 'Unexpected sample input schemaVersion.');
  assert(fixture.sourceReview?.licenseReviewed === false, 'Sample input must not assert licenseReviewed.');
  assert(fixture.sourceReview?.redistributionApproved === false, 'Sample input must not assert redistributionApproved.');
  assert(Array.isArray(fixture.routes), 'Sample input routes must be an array.');
  assert(fixture.routes.some((route) => route.routeCode === 'TD3C'), 'Sample input missing TD3C route.');
  assert(fixture.routes.some((route) => route.routeCode === 'TC5'), 'Sample input missing TC5 route.');
  assert(fixture.routes.some((route) => route.routeCode === 'TD20'), 'Sample input missing TD20 route.');
  assert(fixture.routes.some((route) => route.routeCode === 'BDTI'), 'Sample input missing aggregate BDTI context route.');
}

function assertReviewOutput() {
  const stdout = runNode([REVIEW_SCRIPT, '--input', SAMPLE_INPUT, '--no-output', '--json']);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'route-level-tanker-freight-proof-review-v1', 'Unexpected review schemaVersion.');
  assert(review.contractVersion === 'route-level-tanker-freight-manual-artifact-scaffold-v1', 'Unexpected review contractVersion.');
  assert(review.status === 'dry_run_only', 'Review status must remain dry_run_only.');
  assert(review.promotionEligible === false, 'Review must not be promotion eligible.');
  assert(review.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(review.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(review.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(review.review.acceptedRouteCount === 3, 'Expected three route-level accepted routes from the sample.');
  assert(review.review.contextOnlyCount === 1, 'Expected one aggregate context-only route from the sample.');
  assert(review.review.rejectedRouteCount === 0, 'Sample should have no rejected routes.');
  assert(review.review.bucketCoverage.hormuz_meg_crude === 1, 'Expected one Hormuz crude route.');
  assert(review.review.bucketCoverage.meg_clean_products === 1, 'Expected one MEG clean products route.');
  assert(review.review.bucketCoverage.red_sea_suez_cape_rerouting === 1, 'Expected one Red Sea/Suez route.');
  assert(review.review.bucketCoverage.aggregate_context_only === 1, 'Expected one aggregate context route.');
  assert(review.review.acceptedRoutes.every((route) => route.rawCitationStored === false), 'Accepted routes must not store raw citation text.');
  assert(review.review.acceptedRoutes.every((route) => route.sourceCitationHash), 'Accepted routes should store citation hashes.');
  assert(review.boundaries.noNetworkCall === true, 'Review boundaries must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Review boundaries must lock noProductionWrite.');
  assert(review.boundaries.affectsScoring === false, 'Review boundaries must lock affectsScoring false.');
}

function assertMissingInputIsNonFatal() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--input',
    'manual-artifacts/route-level-tanker-freight/missing-input.json',
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.status === 'input_missing_dry_run_only', 'Missing manual input should stay a dry-run-only non-production state.');
  assert(review.promotionEligible === false, 'Missing input must not be promotion eligible.');
  assert(review.review.acceptedRouteCount === 0, 'Missing input should not produce accepted routes.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains manual-artifact marker and may have wired route-level freight: ${marker}`);
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
    'review:route-level-tanker-freight-manual-artifact',
    'manual artifact scaffold',
    'dry-run-only',
    'manual-artifacts/route-level-tanker-freight',
    'routeFreightConfirmation',
    'not_connected'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'route-level tanker freight manual artifact scaffold',
    'route-level-tanker-freight-proof-review-v1',
    'not_connected'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.toLowerCase().includes('manual artifact scaffold'), 'SIGNAL_INTAKE missing manual artifact scaffold marker.');
  assert(backlog.includes('Route-level tanker freight manual artifact scaffold'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing manual artifact scaffold marker.');
  assert(agents.includes('route-level tanker freight manual artifact scaffold'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing manual artifact scaffold boundary.');
  assert(packageJson.scripts['review:route-level-tanker-freight-manual-artifact'], 'package.json missing review script.');
  assert(packageJson.scripts['check:route-level-tanker-freight-manual-artifact-scaffold'], 'package.json missing check script.');
  assert(checkSuite.includes('check:route-level-tanker-freight-manual-artifact-scaffold'), 'check-suite missing manual artifact scaffold check.');
}

function main() {
  assertReviewScriptSafety();
  assertFixture();
  assertReviewOutput();
  assertMissingInputIsNonFatal();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight manual artifact scaffold: PASS');
}

main();
