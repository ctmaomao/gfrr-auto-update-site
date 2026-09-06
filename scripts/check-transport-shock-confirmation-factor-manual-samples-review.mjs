import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-manual-samples.mjs';
const SAMPLE_A = 'docs/fixtures/transport-shock-confirmation-factor/manual-sample-review-a.json';
const SAMPLE_B = 'docs/fixtures/transport-shock-confirmation-factor/manual-sample-review-b.json';

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
  'transport-shock-confirmation-factor-manual-samples-review-v1',
  'review-transport-shock-confirmation-factor-manual-samples',
  'manual_samples_review_ready_keep_non_production'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Transport shock manual samples review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Review script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local Transport Shock Confirmation Factor sample collection review only',
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

function assertFixtures() {
  for (const sample of [SAMPLE_A, SAMPLE_B]) {
    assert(fs.existsSync(absolute(sample)), `Fixture missing: ${sample}`);
    const fixture = JSON.parse(readText(sample));
    assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-manual-sample-review-v1', `${sample} schemaVersion mismatch.`);
    assert(fixture.status === 'dry_run_only', `${sample} must remain dry_run_only.`);
    assert(fixture.productionWriteApproved === false, `${sample} must not approve production write.`);
    assert(fixture.routeFreightConfirmation === 'not_connected', `${sample} routeFreightConfirmation must stay not_connected.`);
    assert(fixture.marketConfirmation === 'not_connected', `${sample} marketConfirmation must stay not_connected.`);
    assert(fixture.eligibleForMainScore === false, `${sample} eligibleForMainScore must stay false.`);
    assert(fixture.boundaries?.noNetworkCall === true, `${sample} missing noNetworkCall boundary.`);
    assert(fixture.boundaries?.noProductionWrite === true, `${sample} missing noProductionWrite boundary.`);
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
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-manual-samples-review-v1', 'Unexpected review schemaVersion.');
  assert(review.status === 'pass', 'Expected fixture sample review to pass.');
  assert(review.recommendation === 'manual_samples_review_ready_keep_non_production', 'Unexpected recommendation.');
  assert(review.sampleCount === 2, 'Expected two samples.');
  assert(review.usableSampleCount === 2, 'Expected two usable samples.');
  assert(review.promotionEligible === false, 'Review must not be promotion eligible.');
  assert(review.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.productionDisplayApproved === false, 'Review must not approve production display.');
  assert(review.shadowScoreApproved === false, 'Review must not approve shadow score.');
  assert(review.frontendDisplayApproved === false, 'Review must not approve frontend display.');
  assert(review.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(review.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(review.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(review.bucketSampleCoverage.free_route_linked_tanker_transport_pressure_proxy === 2, 'Expected two free-proxy samples.');
  assert(review.bucketSampleCoverage.baltic_weekly_tanker_report_public_route_signal === 2, 'Expected two Baltic Weekly samples.');
  assert(review.directionCounts.tightening === 3, 'Expected three tightening observations.');
  assert(review.directionCounts.mixed === 2, 'Expected two mixed observations.');
  assert(review.directionCounts.easing === 1, 'Expected one easing observation.');
  assert(review.sourceCoverage.solactive_breakwave_wet_freight_futures_index === 2, 'Expected repeated Solactive source coverage.');
  assert(review.productionImpact.affectsScoring === false, 'Review must not affect scoring.');
  assert(review.productionImpact.affectsMainJudgment === false, 'Review must not affect main judgment.');
  assert(review.boundaries.noNetworkCall === true, 'Review boundaries must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Review boundaries must lock noProductionWrite.');
  const serialized = JSON.stringify(review);
  assert(!serialized.includes('operator-provided citation'), 'Review output must not store raw citation text.');
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
  assert(review.promotionEligible === false, 'Empty review must not be promotion eligible.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains manual-samples marker and may have wired Transport Shock Confirmation Factor: ${marker}`);
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
    'review:transport-shock-confirmation-factor-manual-samples',
    'transport-shock-confirmation-factor-manual-samples-review-v1',
    'manual-artifacts/transport-shock-confirmation-factor',
    'sample collection review',
    'no production data write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-manual-samples-review-v1',
    'manual_samples_review_ready_keep_non_production',
    'not_connected'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-manual-samples-review-v1'), 'SIGNAL_INTAKE missing manual samples review marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor manual samples review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing manual samples review marker.');
  assert(agents.includes('Transport Shock Confirmation Factor manual samples review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing manual samples review boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-manual-samples'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-manual-samples-review'], 'package.json missing check script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-manual-samples-review'), 'check-suite missing manual samples review check.');
}

function main() {
  assertReviewScriptSafety();
  assertFixtures();
  assertReviewOutput();
  assertEmptyReviewIsNonFatalWhenAllowed();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor manual samples review: PASS');
}

main();
