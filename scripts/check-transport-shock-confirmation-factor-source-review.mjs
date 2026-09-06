import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_DOC = 'docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_REVIEW.md';
const REVIEW_FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor-source-review-v1.json';

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

const REQUIRED_DOC_PHRASES = [
  'P-score-2 source-review only',
  'Free Route-Linked Tanker Transport Pressure Proxy',
  'Baltic Weekly Tanker Report public route-signal',
  'No live fetch',
  'No production data write',
  'No frontend change',
  'No shadow score',
  'No ODP `finalBias` change',
  'No main-score or today-judgment weighting',
  'routeFreightConfirmation = not_connected',
  'marketConfirmation = not_connected',
  'Solactive Breakwave Wet Freight Futures Index',
  'CME TD3C',
  'ICE TD3C',
  'Baltic Weekly Tanker Report',
  'Baltic daily TD/TC route assessments',
  'not approved for live production ingestion',
  'transport_shock_confirmation_factor_manual_sample_scaffold_no_live_fetch_no_production_write'
];

const REQUIRED_SOURCE_KEYS = new Set([
  'imf_portwatch_chokepoint_context',
  'iea_middle_east_chokepoint_monitor',
  'solactive_breakwave_wet_freight_futures_index',
  'cme_td3c_public_product_page',
  'ice_td3c_public_product_page',
  'baltic_weekly_tanker_report_public_route_signal',
  'baltic_daily_td_tc_route_assessments'
]);

const REQUIRED_BUCKET_KEYS = new Set([
  'free_route_linked_tanker_transport_pressure_proxy',
  'baltic_weekly_tanker_report_public_route_signal'
]);

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-confirmation-factor-source-review-v1',
  'transport_shock_confirmation_factor_source_review',
  'transportShockConfirmationFactor',
  'free_route_linked_tanker_transport_pressure_proxy',
  'baltic_weekly_tanker_report_public_route_signal',
  'solactive_breakwave_wet_freight_futures_index',
  'baltic_daily_td_tc_route_assessments'
];

const FORBIDDEN_APPROVAL_PATTERNS = [
  /liveFetchApproved\s*[:=]\s*true/i,
  /productionDataWriteApproved\s*[:=]\s*true/i,
  /workflowAutomationApproved\s*[:=]\s*true/i,
  /frontendDisplayApproved\s*[:=]\s*true/i,
  /shadowScoreApproved\s*[:=]\s*true/i,
  /mainScoreApproved\s*[:=]\s*true/i,
  /odpFinalBiasApproved\s*[:=]\s*true/i,
  /brentPromotionApproved\s*[:=]\s*true/i,
  /globalRiskHeatmapApproved\s*[:=]\s*true/i,
  /crossValidationApproved\s*[:=]\s*true/i,
  /valueScrapingApproved\s*[:=]\s*true/i,
  /routeValueRedistributionApproved\s*[:=]\s*true/i
];

const FORBIDDEN_CONNECTED_CLAIMS = [
  '运输冲击确认因子已接入',
  'Transport Shock Confirmation Factor is live',
  'Solactive 已接入',
  'Baltic Weekly 已接入',
  'TD3C 数值已接入',
  'routeFreightConfirmation = confirmed',
  'eligibleForMainScore = true'
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
  assert(fs.existsSync(absolute(REVIEW_DOC)), 'Transport Shock Confirmation Factor source review doc is missing.');
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
  assert(fs.existsSync(absolute(REVIEW_FIXTURE)), 'Transport Shock Confirmation Factor source review fixture is missing.');
  const fixtureText = readText(REVIEW_FIXTURE);
  const fixture = JSON.parse(fixtureText);

  assert(fixture.contractVersion === 'transport-shock-confirmation-factor-source-review-v1', 'Unexpected fixture contractVersion.');
  assert(fixture.kind === 'transport_shock_confirmation_factor_source_review', 'Unexpected fixture kind.');
  assert(fixture.status === 'source_review_ready_for_manual_sample_scaffold', 'Unexpected fixture status.');
  assert(fixture.intendedFutureLayer === 'transportShockConfirmationFactor', 'Unexpected intendedFutureLayer.');

  for (const field of [
    'sourceSelectionFinalized',
    'liveFetchApproved',
    'productionDataWriteApproved',
    'workflowAutomationApproved',
    'frontendDisplayApproved',
    'shadowScoreApproved',
    'mainScoreApproved',
    'odpFinalBiasApproved',
    'brentPromotionApproved',
    'globalRiskHeatmapApproved',
    'crossValidationApproved'
  ]) {
    assert(fixture.approvalState?.[field] === false, `approvalState.${field} must be false.`);
  }

  assert(fixture.currentProductionState?.eligibleForMainScore === false, 'current eligibleForMainScore must remain false.');
  assert(fixture.currentProductionState?.routeFreightConfirmation === 'not_connected', 'current routeFreightConfirmation must remain not_connected.');
  assert(fixture.currentProductionState?.marketConfirmation === 'not_connected', 'current marketConfirmation must remain not_connected.');
  assert(fixture.currentProductionState?.transportShockConfirmationFactorProductionFieldExists === false, 'production field must not exist.');

  assert(Array.isArray(fixture.sourceFamilies), 'sourceFamilies must be an array.');
  const sourceKeys = new Set(fixture.sourceFamilies.map((source) => source.sourceKey));
  for (const sourceKey of REQUIRED_SOURCE_KEYS) {
    assert(sourceKeys.has(sourceKey), `Missing source family: ${sourceKey}`);
  }
  for (const source of fixture.sourceFamilies) {
    assert(source.liveFetchApproved === false, `${source.sourceKey}.liveFetchApproved must be false.`);
    assert(source.productionWriteApproved === false, `${source.sourceKey}.productionWriteApproved must be false.`);
    assert(source.scoreApproved === false, `${source.sourceKey}.scoreApproved must be false.`);
    if (Object.hasOwn(source, 'valueScrapingApproved')) {
      assert(source.valueScrapingApproved === false, `${source.sourceKey}.valueScrapingApproved must be false.`);
    }
    if (Object.hasOwn(source, 'routeValueRedistributionApproved')) {
      assert(source.routeValueRedistributionApproved === false, `${source.sourceKey}.routeValueRedistributionApproved must be false.`);
    }
  }

  assert(Array.isArray(fixture.candidateBuckets), 'candidateBuckets must be an array.');
  const bucketKeys = new Set(fixture.candidateBuckets.map((bucket) => bucket.bucketKey));
  for (const bucketKey of REQUIRED_BUCKET_KEYS) {
    assert(bucketKeys.has(bucketKey), `Missing candidate bucket: ${bucketKey}`);
  }
  for (const bucket of fixture.candidateBuckets) {
    assert(Array.isArray(bucket.inputs), `${bucket.bucketKey}.inputs must be an array.`);
    assert(bucket.productionApproved === false, `${bucket.bucketKey}.productionApproved must be false.`);
  }

  const boundaries = fixture.boundaries || {};
  for (const field of [
    'reviewOnly',
    'noLiveFetch',
    'noProductionWrite',
    'noWorkflowChange',
    'noFrontendChange',
    'noWorkerRuntimeChange',
    'noShadowScore'
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
    fixture.nextAllowedStep === 'transport_shock_confirmation_factor_manual_sample_scaffold_no_live_fetch_no_production_write',
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
      assert(!source.includes(marker), `${relativePath} contains source-review marker and may have wired Transport Shock Confirmation Factor: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const index = readText('docs/INDEX.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
  const scoreContract = readText('docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_TO_SCORE_CONTRACT.md');

  for (const marker of [
    'Transport Shock Confirmation Factor source-review',
    'transport-shock-confirmation-factor-source-review-v1',
    'Free Route-Linked Tanker Transport Pressure Proxy',
    'Baltic Weekly Tanker Report public route-signal',
    'no live fetch',
    'no production data write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-source-review-v1',
    'transport_shock_confirmation_factor_manual_sample_scaffold_no_live_fetch_no_production_write',
    'no live fetch',
    'no production data write'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-source-review-v1'), 'SIGNAL_INTAKE missing source-review marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor source-review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing source-review marker.');
  assert(index.includes('docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_REVIEW.md'), 'INDEX missing source review doc.');
  assert(agents.includes('Transport Shock Confirmation Factor source-review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing source-review boundary.');
  assert(scoreContract.includes('P-score-2 free proxy + Baltic Weekly source-review'), 'source-to-score contract missing P-score-2 path.');
}

function main() {
  assertReviewDoc();
  assertReviewFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor source-review: PASS');
}

main();
