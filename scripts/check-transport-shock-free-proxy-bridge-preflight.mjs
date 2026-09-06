import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-free-proxy-bridge-preflight.mjs';
const FIXTURE_BRIDGE = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-score-bridge-review-v1.json';
const FIXTURE_FREE_PROXY_GATE =
  'docs/fixtures/transport-shock-confirmation-factor/score-integration-preflight-free-proxy-gate-passed.json';
const FIXTURE_CROSS_CONFIRMATION =
  'docs/fixtures/transport-shock-confirmation-factor/cross-confirmation-route-high-frequency-blocked.json';

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
  'transport-shock-free-proxy-bridge-preflight-v1',
  'review-transport-shock-free-proxy-bridge-preflight',
  'free_proxy_bridge_preflight_ready_for_separate_score_design_no_score_write'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Free-proxy bridge preflight script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Free-proxy bridge preflight script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-free-proxy-bridge-preflight-v1',
    'free_proxy_bridge_preflight_blocked_on_high_frequency_no_score_write',
    'not_applicable_to_free_proxy_low_weight_path',
    'routeFreightConfirmationCleared: false',
    'highFrequencyPhysicalConfirmationRequired',
    'bridgePreflightOnly',
    'noScoreWrite'
  ]) {
    assert(source.includes(marker), `Free-proxy bridge preflight script missing marker: ${marker}`);
  }
}

function assertFixtures() {
  for (const fixture of [FIXTURE_BRIDGE, FIXTURE_FREE_PROXY_GATE, FIXTURE_CROSS_CONFIRMATION]) {
    assert(fs.existsSync(absolute(fixture)), `Fixture missing: ${fixture}`);
  }
  const bridge = JSON.parse(readText(FIXTURE_BRIDGE));
  const gate = JSON.parse(readText(FIXTURE_FREE_PROXY_GATE));
  const cross = JSON.parse(readText(FIXTURE_CROSS_CONFIRMATION));
  assert(bridge.contractVersion === 'transport-shock-free-proxy-score-bridge-review-v1', 'Bridge fixture schema mismatch.');
  assert(gate.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1', 'Free-proxy gate fixture schema mismatch.');
  assert(gate.gatePassed === true, 'Free-proxy gate fixture must pass.');
  assert(cross.schemaVersion === 'transport-shock-confirmation-factor-cross-confirmation-v1', 'Cross-confirmation fixture schema mismatch.');
  assert(cross.summary.hardBlockerIds.includes('route_freight_confirmation'), 'Cross-confirmation fixture missing route freight blocker.');
  assert(cross.summary.hardBlockerIds.includes('high_frequency_physical_confirmation'), 'Cross-confirmation fixture missing high-frequency blocker.');
}

function assertPreflightOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--bridge-review',
    FIXTURE_BRIDGE,
    '--free-proxy-gate',
    FIXTURE_FREE_PROXY_GATE,
    '--cross-confirmation',
    FIXTURE_CROSS_CONFIRMATION,
    '--no-output',
    '--json'
  ]);
  const review = JSON.parse(stdout);
  assert(review.schemaVersion === 'transport-shock-free-proxy-bridge-preflight-v1', 'Unexpected schemaVersion.');
  assert(review.status === 'free_proxy_bridge_preflight_blocked_on_high_frequency_no_score_write', 'Expected high-frequency blocker status.');
  assert(review.bridgePreflightPassed === false, 'Bridge preflight must not pass while high-frequency remains blocked.');
  assert(review.summary.reclassifiedBlockerIds.includes('route_freight_confirmation'), 'Route freight blocker should be reclassified for free-proxy path.');
  assert(!review.summary.remainingHardBlockerIds.includes('route_freight_confirmation'), 'Route freight blocker must not remain hard blocker for free-proxy preflight.');
  assert(review.summary.remainingHardBlockerIds.includes('high_frequency_physical_confirmation'), 'High-frequency blocker must remain.');
  assert(review.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(review.routeFreightConfirmationCleared === false, 'Route freight confirmation must not be cleared.');
  assert(review.freeProxyRouteFreightRequirement === 'not_applicable_to_free_proxy_low_weight_path', 'Unexpected route freight requirement.');
  assert(review.highFrequencyPhysicalConfirmationRequired === true, 'High-frequency confirmation must remain required.');
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
  assert(review.boundaries.bridgePreflightOnly === true, 'Preflight must lock bridgePreflightOnly.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P47 bridge preflight marker: ${marker}`);
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
    'review:transport-shock-free-proxy-bridge-preflight',
    'transport-shock-free-proxy-bridge-preflight-v1',
    'free_proxy_bridge_preflight_blocked_on_high_frequency_no_score_write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-free-proxy-bridge-preflight-v1'), 'SIGNAL_INTAKE missing P47 marker.');
  assert(backlog.includes('Transport Shock free-proxy bridge preflight'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing P47 marker.');
  assert(agents.includes('Transport Shock free-proxy bridge preflight'), 'AGENTS missing P47 boundary.');
  assert(packageJson.scripts['review:transport-shock-free-proxy-bridge-preflight'], 'package.json missing P47 review script.');
  assert(packageJson.scripts['check:transport-shock-free-proxy-bridge-preflight'], 'package.json missing P47 check script.');
  assert(checkSuite.includes('check:transport-shock-free-proxy-bridge-preflight'), 'check-suite missing P47 check.');
}

function main() {
  assertScriptSafety();
  assertFixtures();
  assertPreflightOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock free-proxy bridge preflight: PASS');
}

main();
