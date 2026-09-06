import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOC = 'docs/TRANSPORT_SHOCK_FREE_PROXY_SCORE_BRIDGE_REVIEW.md';
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-score-bridge-review-v1.json';

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
  'transport-shock-free-proxy-score-bridge-review-v1',
  'transport_shock_free_proxy_score_bridge_review',
  'bridge_review_route_freight_reclassified_high_frequency_still_blocked_no_score_write',
  'not_applicable_to_free_proxy_low_weight_path'
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
  assert(fs.existsSync(absolute(DOC)), 'P46 free-proxy score bridge review doc is missing.');
  const doc = readText(DOC);
  for (const marker of [
    'Transport Shock Free-Proxy Score Bridge Review',
    'transport-shock-free-proxy-score-bridge-review-v1',
    'bridge_review_route_freight_reclassified_high_frequency_still_blocked_no_score_write',
    '`routeFreightConfirmation` remains `not_connected`',
    '`route_freight_confirmation` can be treated as not required',
    '`high_frequency_physical_confirmation` remains a hard blocker',
    'Maximum future main-score contribution',
    'P-score-47 artifact-only free-proxy bridge preflight'
  ]) {
    assert(doc.includes(marker), `${DOC} missing marker: ${marker}`);
  }
  for (const forbidden of [
    'routeFreightConfirmation is confirmed',
    'thermal blocker bypass is approved',
    'score write approved',
    'main-score is now connected'
  ]) {
    assert(!doc.includes(forbidden), `${DOC} contains forbidden approval claim: ${forbidden}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'P46 free-proxy score bridge review fixture is missing.');
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.contractVersion === 'transport-shock-free-proxy-score-bridge-review-v1', 'Unexpected contractVersion.');
  assert(fixture.kind === 'transport_shock_free_proxy_score_bridge_review', 'Unexpected kind.');
  assert(fixture.status === 'bridge_review_route_freight_reclassified_high_frequency_still_blocked_no_score_write', 'Unexpected status.');

  const production = fixture.currentProductionState || {};
  assert(production.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(production.highFrequencyPhysicalConfirmation === 'blocked', 'highFrequencyPhysicalConfirmation must stay blocked.');
  assert(production.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(production.scoreWriteApproved === false, 'scoreWriteApproved must stay false.');
  assert(production.productionWriteApproved === false, 'productionWriteApproved must stay false.');

  const bridge = fixture.bridgeDecision || {};
  assert(bridge.futurePathKey === 'free_transport_pressure_proxy_low_weight_path', 'Unexpected futurePathKey.');
  assert(bridge.maxFutureMainScoreContributionPct <= 3, 'Bridge cap must be <= 3%.');
  assert(bridge.routeFreightConfirmationCleared === false, 'Bridge must not clear routeFreightConfirmation.');
  assert(bridge.routeFreightConfirmationRequiredForFreeProxyPath === false, 'Route freight must not be required for free-proxy path.');
  assert(bridge.routeFreightBlockerReclassification === 'not_applicable_to_free_proxy_low_weight_path', 'Unexpected route freight reclassification.');
  assert(bridge.trueRouteLevelTankerFreightStillUnavailable === true, 'Bridge must preserve true route freight unavailable state.');
  assert(bridge.unauthorizedScrapingApproved === false, 'Bridge must not approve unauthorized scraping.');

  for (const [key, value] of Object.entries(fixture.requiredPrerequisitesForBridgePreflight || {})) {
    assert(value === true, `requiredPrerequisitesForBridgePreflight.${key} must be true.`);
  }

  assert(Array.isArray(fixture.hardBlockersThatRemain), 'hardBlockersThatRemain must be an array.');
  assert(
    fixture.hardBlockersThatRemain.some((blocker) =>
      blocker.blockerId === 'high_frequency_physical_confirmation'
      && blocker.status === 'hard_blocker_remains'
      && blocker.clearedByThisBridge === false
    ),
    'high_frequency_physical_confirmation must remain a hard blocker.'
  );

  assert(Array.isArray(fixture.blockedPaths), 'blockedPaths must be an array.');
  assert(
    fixture.blockedPaths.some((pathItem) => pathItem.pathKey === 'licensed_route_level_tanker_freight_confirmation' && pathItem.routeFreightConfirmationApproved === false),
    'Licensed route-level tanker freight path must remain unapproved.'
  );
  assert(
    fixture.blockedPaths.some((pathItem) => pathItem.pathKey === 'thermal_blocker_bypass' && pathItem.thermalBlockerBypassApproved === false),
    'Thermal blocker bypass path must remain unapproved.'
  );

  for (const [key, value] of Object.entries(fixture.approvalState || {})) {
    assert(value === false, `approvalState.${key} must be false.`);
  }
  const boundaries = fixture.boundaries || {};
  for (const field of [
    'bridgeReviewOnly',
    'noUnauthorizedScraping',
    'noRouteFreightConfirmationClear',
    'noThermalBlockerBypass',
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
      assert(!source.includes(marker), `${relativePath} contains P46 bridge marker: ${marker}`);
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
    'TRANSPORT_SHOCK_FREE_PROXY_SCORE_BRIDGE_REVIEW.md',
    'transport-shock-free-proxy-score-bridge-review-v1'
  ]) {
    assert(index.includes(marker), `docs/INDEX.md missing marker: ${marker}`);
  }
  for (const marker of [
    'Transport Shock free-proxy score bridge review',
    'transport-shock-free-proxy-score-bridge-review-v1',
    'bridge_review_route_freight_reclassified_high_frequency_still_blocked_no_score_write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-free-proxy-score-bridge-review-v1'), 'SIGNAL_INTAKE missing P46 marker.');
  assert(backlog.includes('Transport Shock free-proxy score bridge review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing P46 marker.');
  assert(agents.includes('Transport Shock free-proxy score bridge review'), 'AGENTS missing P46 boundary.');
  assert(packageJson.scripts['check:transport-shock-free-proxy-score-bridge-review'], 'package.json missing P46 check script.');
  assert(checkSuite.includes('check:transport-shock-free-proxy-score-bridge-review'), 'check-suite missing P46 check.');
}

function main() {
  assertDoc();
  assertFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock free-proxy score bridge review: PASS');
}

main();
