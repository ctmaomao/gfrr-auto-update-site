import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-history-samples.mjs';
const SAMPLE_A = 'docs/fixtures/transport-shock-confirmation-factor/history-sample-a.json';
const SAMPLE_B = 'docs/fixtures/transport-shock-confirmation-factor/history-sample-b.json';

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
  'transport-shock-confirmation-factor-history-samples-review-v1',
  'review-transport-shock-confirmation-factor-history-samples',
  'history_samples_review_ready_keep_display_only'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Transport shock history samples review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Review script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local Transport Shock Confirmation Factor git-history sample review only',
    'outputOnlyToManualArtifacts',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
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
    const candidate = fixture.transportShockCandidate;
    assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-history-sample-1', `${sample} schemaVersion mismatch.`);
    assert(fixture.energyTransport?.usageTermsPinned === 'imf_data_terms_pinned', `${sample} terms pin mismatch.`);
    assert(fixture.energyTransport?.redistributionCaveat === true, `${sample} redistribution caveat must stay true.`);
    assert(candidate?.contractVersion === 'transport-shock-candidate-v1', `${sample} candidate contract mismatch.`);
    assert(candidate?.candidateOnly === true, `${sample} candidateOnly must stay true.`);
    assert(candidate?.auditOnly === true, `${sample} auditOnly must stay true.`);
    assert(candidate?.eligibleForMainScore === false, `${sample} eligibleForMainScore must stay false.`);
    assert(candidate?.routeFreightConfirmation === 'not_connected', `${sample} routeFreightConfirmation must stay not_connected.`);
    assert(candidate?.marketConfirmation === 'not_connected', `${sample} marketConfirmation must stay not_connected.`);
    assert(candidate?.boundaries?.affectsScoring === false, `${sample} scoring boundary must stay false.`);
    assert(fixture.productionImpact?.affectsScoring === false, `${sample} productionImpact must not affect scoring.`);
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
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-history-samples-review-v1', 'Unexpected review schemaVersion.');
  assert(review.status === 'pass', 'Expected fixture history samples review to pass.');
  assert(review.recommendation === 'history_samples_review_ready_keep_display_only', 'Unexpected recommendation.');
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
  assert(review.sourceStatusCounts.live === 2, 'Expected two live source samples.');
  assert(review.candidateStatusCounts.elevated_watch === 2, 'Expected two elevated watch samples.');
  assert(review.candidateScore.min === 90 && review.candidateScore.max === 90, 'Expected candidate score range to stay 90.');
  assert(review.latestAgeDays.min === 7 && review.latestAgeDays.max === 8, 'Expected latestAgeDays range 7..8.');
  assert(review.productionImpact.affectsScoring === false, 'Review must not affect scoring.');
  assert(review.productionImpact.affectsMainJudgment === false, 'Review must not affect main judgment.');
  assert(review.boundaries.noNetworkCall === true, 'Review boundaries must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Review boundaries must lock noProductionWrite.');
}

function assertEmptyReviewIsNonFatalWhenAllowed() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--input-dir',
    'manual-artifacts/transport-shock-confirmation-factor/empty-history-samples-check',
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
      assert(!source.includes(marker), `${relativePath} contains history-samples review marker and may have wired Transport Shock Confirmation Factor: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
  const packageJson = JSON.parse(readText('package.json'));
  const checkSuite = readText('scripts/check-suite.mjs');

  for (const marker of [
    'review:transport-shock-confirmation-factor-history-samples',
    'transport-shock-confirmation-factor-history-samples-review-v1',
    'history sample review',
    'no production data write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-history-samples-review-v1',
    'history_samples_review_ready_keep_display_only',
    'not_connected'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor history samples review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing history samples review marker.');
  assert(agents.includes('Transport Shock Confirmation Factor history samples review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing history samples review boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-history-samples'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-history-samples-review'], 'package.json missing check script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-history-samples-review'), 'check-suite missing history samples review check.');
}

function main() {
  assertReviewScriptSafety();
  assertFixtures();
  assertReviewOutput();
  assertEmptyReviewIsNonFatalWhenAllowed();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor history samples review: PASS');
}

main();
