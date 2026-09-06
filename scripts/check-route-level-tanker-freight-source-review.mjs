import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_REVIEW.md';
const REVIEW_FIXTURE = 'docs/fixtures/route-level-tanker-freight-source-review-v1.json';

const RUNTIME_FILES = [
  'scripts/run-daily-pipeline.mjs',
  'scripts/run-realtime.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js'
];

const REQUIRED_DOC_PHRASES = [
  'Review only',
  'No live fetch',
  'No production source approval',
  'No production data write',
  'No workflow change',
  'No frontend change',
  'No Worker runtime change',
  'No ODP `finalBias` change',
  'route-level oil tanker freight confirmation layer',
  'macroDrivers.energyTransport.transportShockCandidate.routeFreightConfirmation = not_connected',
  'Baltic Exchange official tanker route assessments',
  'ICE wet freight',
  'CME Baltic wet freight futures',
  'Paid route-level freight intelligence vendors',
  'aggregate BDTI / BCTI / BDI',
  'sourceApproved=false',
  'liveFetchApproved=false',
  'productionDataWriteApproved=false',
  'route_level_tanker_freight_proof_of_source_design_no_live_fetch_no_production_data_write'
];

const REQUIRED_SOURCE_KEYS = new Set([
  'baltic_exchange_tanker_route_assessments',
  'ice_wet_freight_derivatives',
  'cme_baltic_wet_freight_futures',
  'paid_route_level_freight_intelligence_vendors',
  'stockq_aggregate_baltic_context'
]);

const REQUIRED_ROUTE_BUCKETS = new Set([
  'hormuz_meg_crude',
  'meg_clean_products',
  'red_sea_suez_cape_rerouting'
]);

const RUNTIME_FORBIDDEN_MARKERS = [
  'route_level_tanker_freight_confirmation_source_review',
  'ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_REVIEW',
  'routeLevelTankerFreight',
  'baltic_exchange_tanker_route_assessments',
  'ice_wet_freight_derivatives',
  'cme_baltic_wet_freight_futures',
  'paid_route_level_freight_intelligence_vendors',
  'TD3C',
  'TD34_if_formally_published_and_licensed',
  'TC5'
];

const FORBIDDEN_APPROVAL_PATTERNS = [
  /sourceApproved\s*[:=]\s*true/i,
  /liveFetchApproved\s*[:=]\s*true/i,
  /productionDataWriteApproved\s*[:=]\s*true/i,
  /routeValueRedistributionApproved\s*[:=]\s*true/i,
  /routeLevelConfirmationApproved\s*[:=]\s*true/i,
  /marketConfirmationApproved\s*[:=]\s*true/i,
  /mainScoreApproved\s*[:=]\s*true/i,
  /odpFinalBiasApproved\s*[:=]\s*true/i
];

const FORBIDDEN_CONNECTED_CLAIMS = [
  '路线级油轮运费已接入',
  'TD3C 已接入',
  '霍尔木兹运费已确认',
  '封锁已确认',
  '断供已确认'
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
  assert(fs.existsSync(absolute(REVIEW_DOC)), 'Route-level tanker freight source review doc is missing.');
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
  assert(fs.existsSync(absolute(REVIEW_FIXTURE)), 'Route-level tanker freight source review fixture is missing.');
  const fixtureText = readText(REVIEW_FIXTURE);
  const fixture = JSON.parse(fixtureText);

  assert(fixture.contractVersion === 'route-level-tanker-freight-source-review-v1', 'Unexpected fixture contractVersion.');
  assert(fixture.kind === 'route_level_tanker_freight_confirmation_source_review', 'Unexpected fixture kind.');
  assert(fixture.status === 'review_only_no_source_approved', 'Unexpected fixture status.');
  assert(fixture.intendedFutureLayer === 'macroDrivers.energyTransport.routeFreightConfirmation', 'Unexpected intendedFutureLayer.');

  const requiredFalseFields = [
    'sourceSelectionFinalized',
    'liveFetchApproved',
    'productionDataWriteApproved',
    'realtimeWriteApproved',
    'workflowAutomationApproved',
    'frontendDisplayApproved',
    'odpFinalBiasApproved',
    'brentPromotionApproved',
    'mainScoreApproved',
    'routeValueRedistributionApproved'
  ];
  for (const field of requiredFalseFields) {
    assert(fixture[field] === false, `${field} must be false.`);
  }

  assert(fixture.currentProductionState?.routeFreightConfirmation === 'not_connected', 'current routeFreightConfirmation must remain not_connected.');
  assert(fixture.currentProductionState?.marketConfirmation === 'not_connected', 'current marketConfirmation must remain not_connected.');
  assert(fixture.currentProductionState?.eligibleForMainScore === false, 'current eligibleForMainScore must be false.');

  assert(Array.isArray(fixture.candidateRouteBuckets), 'candidateRouteBuckets must be an array.');
  const routeBuckets = new Set(fixture.candidateRouteBuckets.map((bucket) => bucket.bucketKey));
  for (const bucketKey of REQUIRED_ROUTE_BUCKETS) {
    assert(routeBuckets.has(bucketKey), `Missing route bucket: ${bucketKey}`);
  }
  for (const bucket of fixture.candidateRouteBuckets) {
    assert(Array.isArray(bucket.candidateRoutes), `${bucket.bucketKey}.candidateRoutes must be an array.`);
    assert(bucket.approvedForProduction === false, `${bucket.bucketKey}.approvedForProduction must be false.`);
  }

  assert(Array.isArray(fixture.candidateSources), 'candidateSources must be an array.');
  const sourceKeys = new Set(fixture.candidateSources.map((source) => source.sourceKey));
  for (const sourceKey of REQUIRED_SOURCE_KEYS) {
    assert(sourceKeys.has(sourceKey), `Missing candidate source: ${sourceKey}`);
  }
  for (const source of fixture.candidateSources) {
    assert(source.sourceApproved === false, `${source.sourceKey}.sourceApproved must be false.`);
    assert(source.liveFetchApproved === false, `${source.sourceKey}.liveFetchApproved must be false.`);
    assert(source.productionWriteApproved === false, `${source.sourceKey}.productionWriteApproved must be false.`);
  }

  const boundaries = fixture.boundaries || {};
  for (const field of [
    'reviewOnly',
    'noLiveFetch',
    'noProductionWrite',
    'noRealtimeWrite',
    'noWorkflowChange',
    'noFrontendChange',
    'noWorkerRuntimeChange'
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
    'affectsWorldOrderWeights',
    'affectsGlobalRiskHeatmap',
    'affectsCrossValidation'
  ]) {
    assert(boundaries[field] === false, `boundaries.${field} must be false.`);
  }
  assert(
    fixture.nextAllowedStep === 'route_level_tanker_freight_proof_of_source_design_no_live_fetch_no_production_data_write',
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
      assert(!source.includes(marker), `${relativePath} contains source-review marker and may have wired route-level tanker freight: ${marker}`);
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

  for (const marker of [
    'Route-Level Tanker Freight Confirmation Source Review',
    'route-level oil tanker freight confirmation',
    'routeFreightConfirmation',
    'not_connected',
    'TD3C',
    'TC5',
    'source-review only'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'routeFreightConfirmation',
    'Route-level tanker freight',
    'not_connected',
    'source-review only'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.toLowerCase().includes('route-level tanker freight confirmation source review'), 'SIGNAL_INTAKE missing source-review marker.');
  assert(backlog.includes('Route-level tanker freight source-review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing route-level tanker freight source-review marker.');
  assert(index.includes('docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_REVIEW.md'), 'INDEX missing route-level tanker freight source review doc.');
  assert(agents.includes('route-level tanker freight source-review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing route-level tanker freight boundary.');
}

function main() {
  assertReviewDoc();
  assertReviewFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight source review: PASS');
}

main();
