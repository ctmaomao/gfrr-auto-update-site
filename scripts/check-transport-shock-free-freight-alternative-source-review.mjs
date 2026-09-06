import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOC = 'docs/TRANSPORT_SHOCK_FREE_FREIGHT_ALTERNATIVE_SOURCE_REVIEW.md';
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/free-freight-alternative-source-review-v1.json';

const RUNTIME_FILES = [
  'index.html',
  'scripts/app.js',
  'scripts/modules/renderMacroOverview.js',
  'scripts/modules/buildCrossValidationMatrix.js',
  'scripts/run-daily-pipeline.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'data/radar-data.json',
  'data/oil-directional-pressure.json'
];

const REQUIRED_SOURCE_KEYS = new Set([
  'imf_portwatch_daily_chokepoints',
  'stockq_bdti_bcti_bdi',
  'noaa_marinecadastre_ais',
  'suez_canal_authority_statistics',
  'panama_canal_authority_statistics',
  'eia_iea_chokepoint_exposure',
  'cme_td3c_delayed_product_page',
  'ice_td3c_product_page',
  'solactive_breakwave_wet_freight_index',
  'baltic_daily_td_tc_route_assessments'
]);

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-free-freight-alternative-source-review-v1',
  'transport_shock_free_freight_alternative_source_review',
  'free_transport_pressure_proxy',
  'cme_td3c_delayed_product_page',
  'noaa_marinecadastre_ais'
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

function assertDoc() {
  assert(fs.existsSync(absolute(DOC)), 'P44 free freight alternative source-review doc is missing.');
  const doc = readText(DOC);
  for (const marker of [
    'Transport Shock Free Freight Alternative Source Review',
    'transport-shock-free-freight-alternative-source-review-v1',
    'source_review_free_alternatives_no_route_freight_confirmation',
    'IMF PortWatch Daily Chokepoints Data',
    'NOAA MarineCadastre AIS',
    'CME TD3C delayed product page',
    'Link-Only / Manual Reference',
    'Blocked Without Rights',
    'free_transport_pressure_proxy',
    '`routeFreightConfirmation` must remain `not_connected`',
    'Unauthorized Baltic/TD/TC scraping is not approved',
    'does not change'
  ]) {
    assert(doc.includes(marker), `${DOC} missing marker: ${marker}`);
  }
  for (const forbidden of [
    'routeFreightConfirmation = confirmed',
    'unauthorized scraping approved',
    'score write approved',
    'main-score connected'
  ]) {
    assert(!doc.includes(forbidden), `${DOC} contains forbidden approval claim: ${forbidden}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'P44 free freight alternative source-review fixture is missing.');
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.contractVersion === 'transport-shock-free-freight-alternative-source-review-v1', 'Unexpected contractVersion.');
  assert(fixture.kind === 'transport_shock_free_freight_alternative_source_review', 'Unexpected kind.');
  assert(fixture.status === 'source_review_free_alternatives_no_route_freight_confirmation', 'Unexpected status.');
  assert(fixture.currentProductionState.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(fixture.currentProductionState.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(fixture.approvedFuturePath.pathKey === 'free_transport_pressure_proxy', 'Unexpected approved future path.');
  assert(fixture.approvedFuturePath.notA === 'route_freight_confirmation', 'Free proxy must not be route freight confirmation.');
  assert(fixture.approvedFuturePath.clearsRouteFreightConfirmation === false, 'P44 must not clear route freight confirmation.');
  assert(fixture.approvedFuturePath.maxFutureMainScoreContributionPct <= 3, 'Free proxy cap must stay <= 3%.');

  assert(Array.isArray(fixture.sourceFamilies), 'sourceFamilies must be an array.');
  const sourceKeys = new Set(fixture.sourceFamilies.map((source) => source.sourceKey));
  for (const sourceKey of REQUIRED_SOURCE_KEYS) {
    assert(sourceKeys.has(sourceKey), `Missing source family: ${sourceKey}`);
  }
  for (const source of fixture.sourceFamilies) {
    assert(source.routeFreightConfirmationApproved === false, `${source.sourceKey}.routeFreightConfirmationApproved must be false.`);
    assert(source.liveFetchApprovedByThisReview === false, `${source.sourceKey}.liveFetchApprovedByThisReview must be false.`);
    assert(source.productionWriteApproved === false, `${source.sourceKey}.productionWriteApproved must be false.`);
    assert(source.scoreApproved === false, `${source.sourceKey}.scoreApproved must be false.`);
    if (Object.hasOwn(source, 'automatedValueCaptureApproved')) {
      assert(source.automatedValueCaptureApproved === false, `${source.sourceKey}.automatedValueCaptureApproved must be false.`);
    }
    if (Object.hasOwn(source, 'routeValueRedistributionApproved')) {
      assert(source.routeValueRedistributionApproved === false, `${source.sourceKey}.routeValueRedistributionApproved must be false.`);
    }
  }
  assert(
    fixture.sourceFamilies.find((source) => source.sourceKey === 'baltic_daily_td_tc_route_assessments')?.classification === 'blocked_without_explicit_source_rights',
    'Baltic daily TD/TC must remain blocked without explicit rights.'
  );

  for (const [key, value] of Object.entries(fixture.approvalState || {})) {
    assert(value === false, `approvalState.${key} must be false.`);
  }
  const boundaries = fixture.boundaries || {};
  for (const field of [
    'reviewOnly',
    'noUnauthorizedScraping',
    'noRouteFreightConfirmation',
    'noLiveFetch',
    'noProductionWrite',
    'noWorkflowChange',
    'noFrontendChange',
    'noWorkerRuntimeChange',
    'noScoreWrite'
  ]) {
    assert(boundaries[field] === true, `boundaries.${field} must be true.`);
  }
  for (const field of ['affectsOdpFinalBias', 'affectsMainJudgment', 'affectsGlobalRiskHeatmap', 'affectsCrossValidation']) {
    assert(boundaries[field] === false, `boundaries.${field} must be false.`);
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P44 source-review marker: ${marker}`);
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
    'Transport Shock free freight alternative source-review',
    'transport-shock-free-freight-alternative-source-review-v1',
    'source_review_free_alternatives_no_route_freight_confirmation'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-free-freight-alternative-source-review-v1'), 'SIGNAL_INTAKE missing P44 marker.');
  assert(backlog.includes('Transport Shock free freight alternative source-review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing P44 marker.');
  assert(agents.includes('Transport Shock free freight alternative source-review'), 'AGENTS missing P44 boundary.');
  assert(packageJson.scripts['check:transport-shock-free-freight-alternative-source-review'], 'package.json missing P44 check script.');
  assert(checkSuite.includes('check:transport-shock-free-freight-alternative-source-review'), 'check-suite missing P44 check.');
}

function main() {
  assertDoc();
  assertFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock free freight alternative source-review: PASS');
}

main();
