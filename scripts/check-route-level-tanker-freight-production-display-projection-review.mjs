import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-route-level-tanker-freight-production-display-projections.mjs';
const PROJECTION_FIXTURE = 'docs/fixtures/route-level-tanker-freight/production-display-projection-pass.json';

const RUNTIME_FILES = [
  'scripts/run-daily-pipeline.mjs',
  'scripts/run-realtime.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'scripts/modules/renderOilDirectional.js',
  'scripts/modules/renderMacroOverview.js'
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
  'route-level-tanker-freight-production-display-projection-review-v1',
  'review-route-level-tanker-freight-production-display-projections',
  'projection_review_ready_for_human_display_design_keep_non_production'
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

function assertScriptSafety() {
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Projection review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Projection review script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local route-level tanker freight production display projection review only',
    'outputOnlyToManualArtifacts',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
    'notProductionData',
    'directDisplayApproved',
    'routeFreightConfirmation',
    'not_connected',
    'eligibleForMainScore'
  ]) {
    assert(source.includes(marker), `Projection review script missing required boundary marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(PROJECTION_FIXTURE)), 'Projection fixture is missing.');
  const fixture = JSON.parse(readText(PROJECTION_FIXTURE));
  assert(fixture.schemaVersion === 'route-level-tanker-freight-production-display-projection-v1', 'Projection fixture schema mismatch.');
  assert(fixture.status === 'dry_run_only', 'Projection fixture must be dry_run_only.');
  assert(fixture.projectionState === 'manual_review_ready_non_production', 'Projection fixture should be manual-review-ready non-production.');
  assert(fixture.displayCandidate.directDisplayApproved === false, 'Projection fixture must not approve direct display.');
  assert(fixture.currentProductionState.routeFreightConfirmation === 'not_connected', 'Projection fixture routeFreightConfirmation must stay not_connected.');
  assert(fixture.currentProductionState.eligibleForMainScore === false, 'Projection fixture must not be main-score eligible.');
}

function assertReviewOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--input',
    PROJECTION_FIXTURE,
    '--min-projections',
    '1',
    '--no-output',
    '--json',
    '--strict'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'route-level-tanker-freight-production-display-projection-review-v1', 'Unexpected review schemaVersion.');
  assert(review.status === 'pass', 'Expected projection review to pass.');
  assert(review.recommendation === 'projection_review_ready_for_human_display_design_keep_non_production', 'Unexpected recommendation.');
  assert(review.projectionCount === 1, 'Expected one projection.');
  assert(review.usableProjectionCount === 1, 'Expected one usable projection.');
  assert(review.promotionEligible === false, 'Projection review must not be promotion eligible.');
  assert(review.productionWriteApproved === false, 'Projection review must not approve production write.');
  assert(review.productionDisplayApproved === false, 'Projection review must not approve production display.');
  assert(review.directDisplayApproved === false, 'Projection review must not approve direct display.');
  assert(review.routeFreightConfirmation === 'not_connected', 'Projection review routeFreightConfirmation must stay not_connected.');
  assert(review.marketConfirmation === 'not_connected', 'Projection review marketConfirmation must stay not_connected.');
  assert(review.eligibleForMainScore === false, 'Projection review must stay non-scoring.');
  assert(review.projectionStateCounts.manual_review_ready_non_production === 1, 'Expected one manual_review_ready_non_production projection.');
  assert(review.routeCoverage.some((route) => route.routeCode === 'TD3C'), 'Expected TD3C route coverage.');
  assert(review.productionImpact.affectsScoring === false, 'Projection review must not affect scoring.');
  assert(review.boundaries.noNetworkCall === true, 'Projection review must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Projection review must lock noProductionWrite.');
  const serialized = JSON.stringify(review);
  assert(!serialized.includes('operator-provided citation'), 'Projection review output must not store raw citation text.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains projection-review marker and may have been wired: ${marker}`);
    }
  }
  const radarData = readText('data/radar-data.json');
  for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
    assert(!radarData.includes(marker), `data/radar-data.json contains projection-review marker: ${marker}`);
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
    'review:route-level-tanker-freight-production-display-projections',
    'route-level-tanker-freight-production-display-projection-review-v1',
    'production display projection review',
    'not_connected'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('route-level-tanker-freight-production-display-projection-review-v1'), 'SIGNAL_INTAKE missing projection review marker.');
  assert(backlog.includes('Route-level tanker freight production display projection review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing projection review marker.');
  assert(agents.includes('route-level tanker freight production display projection review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing projection review boundary.');
  assert(packageJson.scripts['review:route-level-tanker-freight-production-display-projections'], 'package.json missing projection review script.');
  assert(packageJson.scripts['check:route-level-tanker-freight-production-display-projection-review'], 'package.json missing projection review check script.');
  assert(checkSuite.includes('check:route-level-tanker-freight-production-display-projection-review'), 'check-suite missing projection review check.');
}

function main() {
  assertScriptSafety();
  assertFixture();
  assertReviewOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight production display projection review: PASS');
}

main();
