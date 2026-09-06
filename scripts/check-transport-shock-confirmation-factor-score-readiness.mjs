import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-score-readiness.mjs';
const FIXTURE_RADAR = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-radar.json';
const FIXTURE_RADAR_FRESH = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-radar-fresh.json';
const FIXTURE_NEWS = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-oil-news.json';
const FIXTURE_THERMAL = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-oil-thermal.json';
const FIXTURE_ODP = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-oil-directional.json';
const FIXTURE_HISTORY = 'docs/fixtures/transport-shock-confirmation-factor/history-samples-review-pass.json';
const FIXTURE_PREFLIGHT_PASSED = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-preflight-passed.json';
const FIXTURE_PREFLIGHT_MISSING = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-preflight-missing.json';

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
  'market.worker-preview.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-confirmation-factor-score-readiness-v1',
  'review-transport-shock-confirmation-factor-score-readiness',
  'ready_for_separate_reviewed_score_design',
  'ready_for_score_design_review_no_score_write'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Transport shock score-readiness review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Score-readiness script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'artifact-only Transport Shock Confirmation Factor score-readiness matrix',
    'not_ready_for_score',
    'keep_display_only_collect_route_market_cross_confirmation',
    'score_integration_preflight_passed_for_design_review_no_score_write',
    'preflight_reclassified',
    'route_level_tanker_freight_confirmation',
    'market_confirmation',
    'oil_news_cross_confirmation',
    'oil_thermal_facility_confirmation',
    'eligibleForMainScore',
    'noScoreWrite'
  ]) {
    assert(source.includes(marker), `Score-readiness script missing required marker: ${marker}`);
  }
}

function assertFixtures() {
  for (const fixture of [FIXTURE_RADAR, FIXTURE_RADAR_FRESH, FIXTURE_NEWS, FIXTURE_THERMAL, FIXTURE_ODP, FIXTURE_HISTORY, FIXTURE_PREFLIGHT_PASSED]) {
    assert(fs.existsSync(absolute(fixture)), `Fixture missing: ${fixture}`);
  }
  const radar = JSON.parse(readText(FIXTURE_RADAR));
  const candidate = radar.macroDrivers.energyTransport.transportShockCandidate;
  assert(candidate.contractVersion === 'transport-shock-candidate-v1', 'Radar fixture candidate contract mismatch.');
  assert(candidate.eligibleForMainScore === false, 'Radar fixture must not be main-score eligible.');
  assert(candidate.routeFreightConfirmation === 'not_connected', 'Radar fixture route gate must stay not_connected.');
  assert(candidate.marketConfirmation === 'not_connected', 'Radar fixture market gate must stay not_connected.');
  const freshRadar = JSON.parse(readText(FIXTURE_RADAR_FRESH));
  assert(freshRadar.macroDrivers.energyTransport.latestAgeDays <= 1, 'Fresh radar fixture must clear PortWatch freshness.');
  const preflight = JSON.parse(readText(FIXTURE_PREFLIGHT_PASSED));
  assert(preflight.schemaVersion === 'transport-shock-confirmation-factor-score-integration-preflight-v1', 'Preflight fixture schema mismatch.');
  assert(preflight.scoreIntegrationPreflightPassed === true, 'Preflight fixture must pass.');
  assert(preflight.scoreWriteApproved === false, 'Preflight fixture must not approve score write.');
}

function assertReadinessOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--radar',
    FIXTURE_RADAR,
    '--oil-news',
    FIXTURE_NEWS,
    '--oil-thermal',
    FIXTURE_THERMAL,
    '--oil-directional',
    FIXTURE_ODP,
    '--history-review',
    FIXTURE_HISTORY,
    '--score-integration-preflight',
    FIXTURE_PREFLIGHT_MISSING,
    '--no-output',
    '--json'
  ]);
  const readiness = JSON.parse(stdout);
  assert(readiness.schemaVersion === 'transport-shock-confirmation-factor-score-readiness-v1', 'Unexpected readiness schema.');
  assert(readiness.status === 'not_ready_for_score', 'Fixture should remain not_ready_for_score.');
  assert(readiness.recommendation === 'keep_display_only_collect_route_market_cross_confirmation', 'Unexpected recommendation.');
  assert(readiness.scoreReady === false, 'Fixture must not be score ready.');
  assert(readiness.eligibleForMainScore === false, 'Readiness must not make factor main-score eligible.');
  assert(readiness.productionWriteApproved === false, 'Readiness must not approve production write.');
  assert(readiness.scoreWriteApproved === false, 'Readiness must not approve score write.');
  assert(readiness.frontendDisplayApproved === false, 'Readiness must not approve frontend display.');
  assert(readiness.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(readiness.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(readiness.summary.hardBlockerCount >= 5, 'Expected hard blockers before score design.');
  for (const blocker of [
    'portwatch_source_freshness',
    'route_level_tanker_freight_confirmation',
    'market_confirmation',
    'route_freight_source_rights',
    'oil_news_cross_confirmation',
    'oil_thermal_facility_confirmation'
  ]) {
    assert(readiness.summary.hardBlockerIds.includes(blocker), `Expected blocker: ${blocker}`);
  }
  assert(readiness.rows.find((item) => item.id === 'history_sample_quality')?.status === 'pass', 'History sample review should pass.');
  assert(readiness.rows.find((item) => item.id === 'odp_physical_anchor')?.status === 'pass', 'ODP anchor should pass.');
  assert(readiness.productionImpact.affectsScoring === false, 'Readiness must not affect scoring.');
  assert(readiness.productionImpact.affectsMainJudgment === false, 'Readiness must not affect main judgment.');
  assert(readiness.boundaries.noNetworkCall === true, 'Readiness must lock noNetworkCall.');
  assert(readiness.boundaries.noProductionWrite === true, 'Readiness must lock noProductionWrite.');
  assert(readiness.boundaries.noScoreWrite === true, 'Readiness must lock noScoreWrite.');
}

function assertPreflightReadyOutput() {
  const stdout = runNode([
    REVIEW_SCRIPT,
    '--radar',
    FIXTURE_RADAR_FRESH,
    '--oil-news',
    FIXTURE_NEWS,
    '--oil-thermal',
    FIXTURE_THERMAL,
    '--oil-directional',
    FIXTURE_ODP,
    '--history-review',
    FIXTURE_HISTORY,
    '--score-integration-preflight',
    FIXTURE_PREFLIGHT_PASSED,
    '--no-output',
    '--json'
  ]);
  const readiness = JSON.parse(stdout);
  assert(readiness.schemaVersion === 'transport-shock-confirmation-factor-score-readiness-v1', 'Unexpected readiness schema.');
  assert(readiness.status === 'ready_for_score_design_review_no_score_write', 'Preflight path should be ready for score design review only.');
  assert(readiness.recommendation === 'open_separate_reviewed_score_design_pr_do_not_auto_wire', 'Unexpected preflight-ready recommendation.');
  assert(readiness.scoreReady === true, 'Preflight path should set scoreReady for separate review.');
  assert(readiness.scoreReadyReason === 'score_integration_preflight_passed_for_design_review_no_score_write', 'Unexpected scoreReadyReason.');
  assert(readiness.eligibleForMainScore === false, 'Preflight path must not make factor main-score eligible.');
  assert(readiness.productionWriteApproved === false, 'Preflight path must not approve production write.');
  assert(readiness.scoreWriteApproved === false, 'Preflight path must not approve score write.');
  assert(readiness.frontendDisplayApproved === false, 'Preflight path must not approve frontend display.');
  assert(readiness.summary.hardBlockerCount === 0, 'Preflight path should have no remaining hard blockers.');
  assert(readiness.summary.reclassifiedCount === 5, 'Expected five legacy blockers to be reclassified by preflight.');
  assert(readiness.scoreIntegrationPreflight.passed === true, 'Preflight check should pass.');
  for (const rowId of [
    'route_level_tanker_freight_confirmation',
    'market_confirmation',
    'route_freight_source_rights',
    'oil_news_cross_confirmation',
    'oil_thermal_facility_confirmation'
  ]) {
    const row = readiness.rows.find((item) => item.id === rowId);
    assert(row?.status === 'preflight_reclassified', `Expected preflight_reclassified row: ${rowId}`);
    assert(row?.severity === 'design_review_required', `Expected design_review_required row: ${rowId}`);
  }
  assert(readiness.productionImpact.affectsScoring === false, 'Preflight path must not affect scoring.');
  assert(readiness.productionImpact.affectsMainJudgment === false, 'Preflight path must not affect main judgment.');
  assert(readiness.boundaries.noScoreWrite === true, 'Preflight path must lock noScoreWrite.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains score-readiness marker and may have been wired too early: ${marker}`);
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
    'review:transport-shock-confirmation-factor-score-readiness',
    'transport-shock-confirmation-factor-score-readiness-v1',
    'not_ready_for_score',
    'no score write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-score-readiness-v1',
    'keep_display_only_collect_route_market_cross_confirmation',
    'eligibleForMainScore=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-score-readiness-v1'), 'SIGNAL_INTAKE missing score-readiness marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor score-readiness matrix'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing score-readiness marker.');
  assert(agents.includes('Transport Shock Confirmation Factor score-readiness matrix'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing score-readiness boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-score-readiness'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-score-readiness'], 'package.json missing check script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-score-readiness'), 'check-suite missing score-readiness check.');
}

function main() {
  assertScriptSafety();
  assertFixtures();
  assertReadinessOutput();
  assertPreflightReadyOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor score-readiness matrix: PASS');
}

main();
