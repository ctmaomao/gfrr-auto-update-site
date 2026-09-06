import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_DOC = 'docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_MARKET_CONFIRMATION_SOURCE_REVIEW.md';
const REVIEW_FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor-market-confirmation-source-review-v1.json';

const REQUIRED_DOC_PHRASES = [
  'P-score-15 market-confirmation source-review only',
  'transport-shock-confirmation-factor-market-confirmation-source-review-v1',
  'No live fetch',
  'No new data source',
  'No production data write',
  'No marketConfirmation write',
  'No score write',
  'No ODP `finalBias` change',
  'No main-score or today-judgment weighting',
  'marketConfirmation = not_connected',
  'Brent futures price curve proxy',
  'ICE Brent futures structure context',
  'EIA Brent spot proxy',
  'Oil News market reaction bucket',
  'market_confirmation_source_review_ready_for_manual_sample_scaffold',
  'transport_shock_market_confirmation_manual_sample_scaffold_no_live_fetch_no_production_write'
];

const REQUIRED_SOURCE_KEYS = new Set([
  'brent_futures_price_curve_proxy',
  'ice_brent_futures_structure_context',
  'eia_brent_spot_proxy',
  'odp_brent_wti_price_reaction_proxy',
  'odp_crack_spread_proxy',
  'oil_news_market_reaction_bucket'
]);

const REQUIRED_BUCKET_KEYS = new Set([
  'brent_price_structure_confirmation',
  'oil_news_market_reaction_confirmation',
  'odp_market_stress_context'
]);

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
  'transport-shock-confirmation-factor-market-confirmation-source-review-v1',
  'transport_shock_confirmation_factor_market_confirmation_source_review',
  'brent_price_structure_confirmation',
  'oil_news_market_reaction_confirmation',
  'transport_shock_market_confirmation_manual_sample_scaffold_no_live_fetch_no_production_write'
];

const FORBIDDEN_APPROVAL_PATTERNS = [
  /liveFetchApproved\s*[:=]\s*true/i,
  /newDataSourceApproved\s*[:=]\s*true/i,
  /productionDataWriteApproved\s*[:=]\s*true/i,
  /workflowAutomationApproved\s*[:=]\s*true/i,
  /frontendDisplayApproved\s*[:=]\s*true/i,
  /marketConfirmationWriteApproved\s*[:=]\s*true/i,
  /scoreWriteApproved\s*[:=]\s*true/i,
  /mainScoreApproved\s*[:=]\s*true/i,
  /odpFinalBiasApproved\s*[:=]\s*true/i,
  /brentPromotionApproved\s*[:=]\s*true/i,
  /globalRiskHeatmapApproved\s*[:=]\s*true/i,
  /crossValidationApproved\s*[:=]\s*true/i
];

const FORBIDDEN_CONNECTED_CLAIMS = [
  'marketConfirmation = confirmed',
  'marketConfirmation 已接入',
  'Transport Shock market confirmation is live',
  'eligibleForMainScore = true',
  'scoreWriteApproved = true'
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

function assertReviewDoc() {
  assert(fs.existsSync(absolute(REVIEW_DOC)), 'Market confirmation source-review doc is missing.');
  const doc = readText(REVIEW_DOC);
  const docLower = doc.toLowerCase();

  for (const phrase of REQUIRED_DOC_PHRASES) {
    assert(docLower.includes(phrase.toLowerCase()), `Review doc missing required phrase: ${phrase}`);
  }
  for (const pattern of FORBIDDEN_APPROVAL_PATTERNS) {
    assert(!pattern.test(doc), `Review doc contains forbidden approval pattern: ${pattern}`);
  }
  for (const claim of FORBIDDEN_CONNECTED_CLAIMS) {
    assert(!doc.includes(claim), `Review doc contains forbidden connected claim: ${claim}`);
  }
}

function assertReviewFixture() {
  assert(fs.existsSync(absolute(REVIEW_FIXTURE)), 'Market confirmation source-review fixture is missing.');
  const fixtureText = readText(REVIEW_FIXTURE);
  const fixture = JSON.parse(fixtureText);

  assert(
    fixture.contractVersion === 'transport-shock-confirmation-factor-market-confirmation-source-review-v1',
    'Unexpected fixture contractVersion.'
  );
  assert(
    fixture.kind === 'transport_shock_confirmation_factor_market_confirmation_source_review',
    'Unexpected fixture kind.'
  );
  assert(
    fixture.status === 'market_confirmation_source_review_ready_for_manual_sample_scaffold',
    'Unexpected fixture status.'
  );
  assert(
    fixture.currentProductionState?.marketConfirmation === 'not_connected',
    'marketConfirmation must remain not_connected.'
  );
  assert(fixture.currentProductionState?.eligibleForMainScore === false, 'eligibleForMainScore must remain false.');

  for (const field of [
    'sourceSelectionFinalized',
    'liveFetchApproved',
    'newDataSourceApproved',
    'productionDataWriteApproved',
    'workflowAutomationApproved',
    'frontendDisplayApproved',
    'marketConfirmationWriteApproved',
    'scoreWriteApproved',
    'mainScoreApproved',
    'odpFinalBiasApproved',
    'brentPromotionApproved',
    'globalRiskHeatmapApproved',
    'crossValidationApproved'
  ]) {
    assert(fixture.approvalState?.[field] === false, `approvalState.${field} must be false.`);
  }

  assert(Array.isArray(fixture.sourceFamilies), 'sourceFamilies must be an array.');
  const sourceKeys = new Set(fixture.sourceFamilies.map((source) => source.sourceKey));
  for (const sourceKey of REQUIRED_SOURCE_KEYS) {
    assert(sourceKeys.has(sourceKey), `Missing source family: ${sourceKey}`);
  }
  for (const source of fixture.sourceFamilies) {
    assert(source.liveFetchApproved === false, `${source.sourceKey}.liveFetchApproved must be false.`);
    assert(source.productionWriteApproved === false, `${source.sourceKey}.productionWriteApproved must be false.`);
    assert(source.marketConfirmationWriteApproved === false, `${source.sourceKey}.marketConfirmationWriteApproved must be false.`);
    assert(source.scoreApproved === false, `${source.sourceKey}.scoreApproved must be false.`);
    if (Object.hasOwn(source, 'usesOdpFinalBias')) {
      assert(source.usesOdpFinalBias === false, `${source.sourceKey}.usesOdpFinalBias must be false.`);
    }
  }

  assert(Array.isArray(fixture.candidateBuckets), 'candidateBuckets must be an array.');
  const bucketKeys = new Set(fixture.candidateBuckets.map((bucket) => bucket.bucketKey));
  for (const bucketKey of REQUIRED_BUCKET_KEYS) {
    assert(bucketKeys.has(bucketKey), `Missing candidate bucket: ${bucketKey}`);
  }
  for (const bucket of fixture.candidateBuckets) {
    assert(bucket.productionApproved === false, `${bucket.bucketKey}.productionApproved must be false.`);
  }

  for (const field of [
    'marketAloneCannotConfirmTransportShock',
    'requiresPhysicalRouteAgreementBeforeFutureConfirmation',
    'requiresAnotherNonNewsConfirmationBeforeFutureConfirmation',
    'odpFinalBiasCannotBeInput',
    'priceReactionIsNotPhysicalConfirmation'
  ]) {
    assert(fixture.interpretationRules?.[field] === true, `interpretationRules.${field} must be true.`);
  }

  const boundaries = fixture.boundaries || {};
  for (const field of [
    'reviewOnly',
    'noLiveFetch',
    'noNewDataSource',
    'noProductionWrite',
    'noWorkflowChange',
    'noFrontendChange',
    'noWorkerRuntimeChange',
    'noMarketConfirmationWrite',
    'noScoreWrite'
  ]) {
    assert(boundaries[field] === true, `boundaries.${field} must be true.`);
  }
  for (const field of [
    'affectsValues',
    'affectsDisplayInputsBaseline',
    'affectsEffectiveDisplayInputs',
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance',
    'affectsBrentPromotion',
    'affectsOdpFinalBias',
    'affectsMainJudgment',
    'affectsGlobalRiskHeatmap',
    'affectsCrossValidation'
  ]) {
    assert(boundaries[field] === false, `boundaries.${field} must be false.`);
  }
  assert(
    fixture.nextAllowedStep === 'transport_shock_market_confirmation_manual_sample_scaffold_no_live_fetch_no_production_write',
    'Unexpected nextAllowedStep.'
  );

  for (const pattern of FORBIDDEN_APPROVAL_PATTERNS) {
    assert(!pattern.test(fixtureText), `Fixture contains forbidden approval pattern: ${pattern}`);
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains market-confirmation source-review marker: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const index = readText('docs/INDEX.md');
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
  const packageJson = JSON.parse(readText('package.json'));
  const checkSuite = readText('scripts/check-suite.mjs');

  for (const marker of [
    'TRANSPORT_SHOCK_CONFIRMATION_FACTOR_MARKET_CONFIRMATION_SOURCE_REVIEW.md',
    'transport-shock-confirmation-factor-market-confirmation-source-review-v1'
  ]) {
    assert(index.includes(marker), `INDEX missing marker: ${marker}`);
  }
  for (const marker of [
    'Transport Shock Confirmation Factor market-confirmation source-review',
    'transport-shock-confirmation-factor-market-confirmation-source-review-v1',
    'marketConfirmation remains `not_connected`',
    'no score write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-market-confirmation-source-review-v1',
    'transport_shock_market_confirmation_manual_sample_scaffold_no_live_fetch_no_production_write',
    'marketConfirmationWriteApproved=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-market-confirmation-source-review-v1'), 'SIGNAL_INTAKE missing marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor market-confirmation source-review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing marker.');
  assert(agents.includes('Transport Shock Confirmation Factor market-confirmation source-review'), 'AGENTS missing marker.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-market-confirmation-source-review'], 'package.json missing check script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-market-confirmation-source-review'), 'check-suite missing market-confirmation source-review check.');
}

function main() {
  assertReviewDoc();
  assertReviewFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor market-confirmation source-review: PASS');
}

main();
