import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-score-integration-preflight.mjs';
const FIXTURE_FREE_PROXY_GATE = 'docs/fixtures/transport-shock-confirmation-factor/score-integration-preflight-free-proxy-gate-passed.json';
const FIXTURE_CROSS_CONFIRMATION = 'docs/fixtures/transport-shock-confirmation-factor/score-integration-preflight-cross-confirmation-blocked.json';
const FIXTURE_CROSS_CONFIRMATION_ROUTE_ONLY = 'docs/fixtures/transport-shock-confirmation-factor/score-integration-preflight-cross-confirmation-route-only.json';
const FIXTURE_FREE_PROXY_BRIDGE_PASSED = 'docs/fixtures/transport-shock-confirmation-factor/score-integration-preflight-free-proxy-bridge-passed.json';

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
  'market.worker-preview.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-confirmation-factor-score-integration-preflight-v1',
  'review-transport-shock-confirmation-factor-score-integration-preflight',
  'score_integration_preflight_ready_for_design_review_no_score_write'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Score-integration preflight script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Score-integration preflight script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'artifact-only Transport Shock score-integration preflight',
    'score_integration_preflight_blocked_keep_no_score_write',
    'clear_cross_confirmation_blockers_before_score_design',
    'free_proxy_score_readiness_gate',
    'cross_confirmation_review',
    'free_proxy_bridge_preflight',
    'reclassifiedCrossConfirmationHardBlockerIds',
    'scoreIntegrationPreflightOnly',
    'eligibleForMainScore',
    'noScoreWrite'
  ]) {
    assert(source.includes(marker), `Score-integration preflight script missing required marker: ${marker}`);
  }
}

function assertFixtures() {
  for (const fixture of [
    FIXTURE_FREE_PROXY_GATE,
    FIXTURE_CROSS_CONFIRMATION,
    FIXTURE_CROSS_CONFIRMATION_ROUTE_ONLY,
    FIXTURE_FREE_PROXY_BRIDGE_PASSED
  ]) {
    assert(fs.existsSync(absolute(fixture)), `Fixture missing: ${fixture}`);
  }
  const gate = JSON.parse(readText(FIXTURE_FREE_PROXY_GATE));
  const cross = JSON.parse(readText(FIXTURE_CROSS_CONFIRMATION));
  assert(gate.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1', 'Free-proxy gate fixture schema mismatch.');
  assert(gate.gatePassed === true, 'Free-proxy gate fixture must pass.');
  assert(cross.schemaVersion === 'transport-shock-confirmation-factor-cross-confirmation-v1', 'Cross-confirmation fixture schema mismatch.');
  assert(cross.crossConfirmationReady === false, 'Cross-confirmation fixture must remain blocked.');
  const routeOnly = JSON.parse(readText(FIXTURE_CROSS_CONFIRMATION_ROUTE_ONLY));
  assert(routeOnly.summary.hardBlockerIds.length === 1 && routeOnly.summary.hardBlockerIds[0] === 'route_freight_confirmation', 'Route-only cross-confirmation fixture must only block on route freight.');
  const bridge = JSON.parse(readText(FIXTURE_FREE_PROXY_BRIDGE_PASSED));
  assert(bridge.schemaVersion === 'transport-shock-free-proxy-bridge-preflight-v1', 'Bridge preflight fixture schema mismatch.');
  assert(bridge.bridgePreflightPassed === true, 'Bridge preflight fixture must pass.');
  assert(bridge.summary.remainingHardBlockerIds.length === 0, 'Bridge preflight fixture must have no remaining blockers.');
}

function assertPreflightOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--free-proxy-gate',
    FIXTURE_FREE_PROXY_GATE,
    '--cross-confirmation',
    FIXTURE_CROSS_CONFIRMATION,
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-score-integration-preflight-v1', 'Unexpected schemaVersion.');
  assert(review.status === 'score_integration_preflight_blocked_keep_no_score_write', 'Preflight must remain blocked when cross-confirmation is blocked.');
  assert(review.recommendation === 'clear_cross_confirmation_blockers_before_score_design', 'Unexpected recommendation.');
  assert(review.scoreIntegrationPreflightPassed === false, 'Preflight must not pass.');
  assert(review.summary.blockerCount === 1, 'Expected one high-level blocker from cross-confirmation.');
  assert(review.summary.blockers.some((item) => item.checkId === 'cross_confirmation_review' && item.id === 'cross_confirmation_not_ready'), 'Expected cross-confirmation blocker.');
  assert(review.summary.crossConfirmationHardBlockerIds.includes('route_freight_confirmation'), 'Expected route freight hard blocker passthrough.');
  assert(review.summary.crossConfirmationHardBlockerIds.includes('market_confirmation'), 'Expected market confirmation hard blocker passthrough.');
  assert(review.summary.remainingCrossConfirmationHardBlockerIds.includes('market_confirmation'), 'Market blocker must remain after bridge logic.');
  assert(review.checks.find((item) => item.id === 'free_proxy_score_readiness_gate')?.status === 'pass', 'Free-proxy gate should pass fixture.');
  assert(review.checks.find((item) => item.id === 'cross_confirmation_review')?.status === 'blocker', 'Cross-confirmation should block fixture.');
  assert(review.scoreReadinessApproved === false, 'Preflight must not approve score readiness.');
  assert(review.scoreIntegrationApproved === false, 'Preflight must not approve score integration.');
  assert(review.scoreWriteApproved === false, 'Preflight must not approve score write.');
  assert(review.productionWriteApproved === false, 'Preflight must not approve production write.');
  assert(review.frontendDisplayApproved === false, 'Preflight must not approve frontend display.');
  assert(review.eligibleForMainScore === false, 'Preflight must not create main-score eligibility.');
  assert(review.productionImpact.affectsScoring === false, 'Preflight must not affect scoring.');
  assert(review.productionImpact.affectsMainJudgment === false, 'Preflight must not affect main judgment.');
  assert(review.boundaries.noNetworkCall === true, 'Preflight must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Preflight must lock noProductionWrite.');
  assert(review.boundaries.noScoreWrite === true, 'Preflight must lock noScoreWrite.');
  assert(review.boundaries.scoreIntegrationPreflightOnly === true, 'Preflight must lock scoreIntegrationPreflightOnly.');
}

function assertBridgeReclassifiedOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--free-proxy-gate',
    FIXTURE_FREE_PROXY_GATE,
    '--cross-confirmation',
    FIXTURE_CROSS_CONFIRMATION_ROUTE_ONLY,
    '--free-proxy-bridge-preflight',
    FIXTURE_FREE_PROXY_BRIDGE_PASSED,
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.status === 'score_integration_preflight_ready_for_design_review_no_score_write', 'Route-only blocker should be reclassified by passed bridge preflight.');
  assert(review.recommendation === 'open_separate_score_design_pr_no_auto_wire', 'Unexpected bridge-reclassified recommendation.');
  assert(review.scoreIntegrationPreflightPassed === true, 'Bridge-reclassified preflight should pass.');
  assert(review.summary.blockerCount === 0, 'Bridge-reclassified preflight should have no blockers.');
  assert(review.summary.reclassifiedCrossConfirmationHardBlockerIds.includes('route_freight_confirmation'), 'Route freight blocker should be listed as reclassified.');
  assert(review.summary.remainingCrossConfirmationHardBlockerIds.length === 0, 'No hard blockers should remain after bridge reclassification.');
  assert(review.checks.find((item) => item.id === 'cross_confirmation_review')?.status === 'pass', 'Cross-confirmation should be effective-pass after bridge reclassification.');
  assert(review.checks.find((item) => item.id === 'free_proxy_bridge_preflight')?.status === 'pass', 'Bridge preflight should pass fixture.');
  assert(review.scoreReadinessApproved === false, 'Bridge-reclassified preflight must not approve score readiness.');
  assert(review.scoreIntegrationApproved === false, 'Bridge-reclassified preflight must not approve score integration.');
  assert(review.scoreWriteApproved === false, 'Bridge-reclassified preflight must not approve score write.');
  assert(review.eligibleForMainScore === false, 'Bridge-reclassified preflight must not create main-score eligibility.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains score-integration preflight marker and may have been wired too early: ${marker}`);
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
    'review:transport-shock-confirmation-factor-score-integration-preflight',
    'transport-shock-confirmation-factor-score-integration-preflight-v1',
    'score_integration_preflight_blocked_keep_no_score_write',
    'no score write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-score-integration-preflight-v1',
    'clear_cross_confirmation_blockers_before_score_design',
    'eligibleForMainScore=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-score-integration-preflight-v1'), 'SIGNAL_INTAKE missing score-integration preflight marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor score-integration preflight'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing score-integration preflight marker.');
  assert(agents.includes('Transport Shock Confirmation Factor score-integration preflight'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing score-integration preflight boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-score-integration-preflight'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-score-integration-preflight'], 'package.json missing checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-score-integration-preflight'), 'check-suite missing score-integration preflight check.');
}

function main() {
  assertScriptSafety();
  assertFixtures();
  assertPreflightOutput();
  assertBridgeReclassifiedOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor score-integration preflight: PASS');
}

main();
