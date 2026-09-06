import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-route-level-tanker-freight-manual-samples.mjs';
const SAMPLE_A = 'docs/fixtures/route-level-tanker-freight/proof-review-sample-a.json';
const SAMPLE_B = 'docs/fixtures/route-level-tanker-freight/proof-review-sample-b.json';

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
  'route-level-tanker-freight-manual-samples-review-v1',
  'review-route-level-tanker-freight-manual-samples',
  'manual_sample_review_ready_keep_non_production'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Manual samples review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Manual samples review script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local route-level tanker freight sample collection review only',
    'outputOnlyToManualArtifacts',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
    'routeFreightConfirmation',
    'not_connected',
    'eligibleForMainScore'
  ]) {
    assert(source.includes(marker), `Manual samples review script missing required boundary marker: ${marker}`);
  }
}

function assertFixtures() {
  for (const fixturePath of [SAMPLE_A, SAMPLE_B]) {
    assert(fs.existsSync(absolute(fixturePath)), `Missing fixture: ${fixturePath}`);
    const fixture = JSON.parse(readText(fixturePath));
    assert(fixture.schemaVersion === 'route-level-tanker-freight-proof-review-v1', `${fixturePath} schema mismatch.`);
    assert(fixture.status === 'dry_run_only', `${fixturePath} must be dry_run_only.`);
    assert(fixture.routeFreightConfirmation === 'not_connected', `${fixturePath} routeFreightConfirmation must stay not_connected.`);
    assert(fixture.eligibleForMainScore === false, `${fixturePath} must not be main-score eligible.`);
  }
}

function assertReviewOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--input',
    SAMPLE_A,
    '--input',
    SAMPLE_B,
    '--min-samples',
    '2',
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'route-level-tanker-freight-manual-samples-review-v1', 'Unexpected review schemaVersion.');
  assert(review.status === 'pass', 'Expected fixture sample review to pass.');
  assert(review.recommendation === 'manual_sample_review_ready_keep_non_production', 'Unexpected recommendation.');
  assert(review.sampleCount === 2, 'Expected two samples.');
  assert(review.usableSampleCount === 2, 'Expected two usable samples.');
  assert(review.promotionEligible === false, 'Review must not be promotion eligible.');
  assert(review.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.productionDisplayApproved === false, 'Review must not approve production display.');
  assert(review.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(review.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(review.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(review.bucketSampleCoverage.hormuz_meg_crude === 2, 'Expected two Hormuz samples.');
  assert(review.bucketSampleCoverage.meg_clean_products === 2, 'Expected two clean-product samples.');
  assert(review.bucketSampleCoverage.red_sea_suez_cape_rerouting === 2, 'Expected two rerouting samples.');
  assert(review.routeCoverage.some((route) => route.routeCode === 'TD3C' && route.sampleCount === 2), 'Expected repeated TD3C observation.');
  assert(review.repeatedRoutes.some((route) => route.routeCode === 'TD3C'), 'Expected TD3C in repeatedRoutes.');
  assert(review.productionImpact.affectsScoring === false, 'Review must not affect scoring.');
  assert(review.boundaries.noNetworkCall === true, 'Review boundaries must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Review boundaries must lock noProductionWrite.');
  const serialized = JSON.stringify(review);
  assert(!serialized.includes('operator-provided citation'), 'Review output must not store raw citation text.');
}

function assertEmptyState() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--allow-empty',
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.status === 'empty', 'Allow-empty review should return empty status.');
  assert(review.routeFreightConfirmation === 'not_connected', 'Empty review must stay not_connected.');
  assert(review.eligibleForMainScore === false, 'Empty review must stay non-scoring.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains manual-samples marker and may have wired route-level freight: ${marker}`);
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
    'review:route-level-tanker-freight-manual-samples',
    'manual sample collection/review',
    'route-level-tanker-freight-manual-samples-review-v1',
    'not_connected'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'route-level tanker freight manual samples review',
    'route-level-tanker-freight-manual-samples-review-v1',
    'not_connected'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.toLowerCase().includes('manual sample collection/review'), 'SIGNAL_INTAKE missing manual sample marker.');
  assert(backlog.includes('Route-level tanker freight manual sample collection/review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing manual samples marker.');
  assert(agents.includes('route-level tanker freight manual sample collection/review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing manual samples boundary.');
  assert(packageJson.scripts['review:route-level-tanker-freight-manual-samples'], 'package.json missing review script.');
  assert(packageJson.scripts['check:route-level-tanker-freight-manual-samples-review'], 'package.json missing check script.');
  assert(checkSuite.includes('check:route-level-tanker-freight-manual-samples-review'), 'check-suite missing manual samples check.');
}

function main() {
  assertScriptSafety();
  assertFixtures();
  assertReviewOutput();
  assertEmptyState();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight manual samples review: PASS');
}

main();
