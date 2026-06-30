import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-score-readiness.mjs';
const FIXTURE_RADAR = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-radar.json';
const FIXTURE_NEWS = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-oil-news.json';
const FIXTURE_THERMAL = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-oil-thermal.json';
const FIXTURE_ODP = 'docs/fixtures/transport-shock-confirmation-factor/score-readiness-oil-directional.json';
const FIXTURE_HISTORY = 'docs/fixtures/transport-shock-confirmation-factor/history-samples-review-pass.json';

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
  'ready_for_separate_reviewed_score_design'
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

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`node ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return String(result.stdout || '');
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
  for (const fixture of [FIXTURE_RADAR, FIXTURE_NEWS, FIXTURE_THERMAL, FIXTURE_ODP, FIXTURE_HISTORY]) {
    assert(fs.existsSync(absolute(fixture)), `Fixture missing: ${fixture}`);
  }
  const radar = JSON.parse(readText(FIXTURE_RADAR));
  const candidate = radar.macroDrivers.energyTransport.transportShockCandidate;
  assert(candidate.contractVersion === 'transport-shock-candidate-v1', 'Radar fixture candidate contract mismatch.');
  assert(candidate.eligibleForMainScore === false, 'Radar fixture must not be main-score eligible.');
  assert(candidate.routeFreightConfirmation === 'not_connected', 'Radar fixture route gate must stay not_connected.');
  assert(candidate.marketConfirmation === 'not_connected', 'Radar fixture market gate must stay not_connected.');
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
  const backlog = readText('docs/PROJECT_BACKLOG.md');
  const agents = readText('AGENTS.md');
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
  assert(backlog.includes('Transport Shock Confirmation Factor score-readiness matrix'), 'PROJECT_BACKLOG missing score-readiness marker.');
  assert(agents.includes('Transport Shock Confirmation Factor score-readiness matrix'), 'AGENTS.md missing score-readiness boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-score-readiness'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-score-readiness'], 'package.json missing check script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-score-readiness'), 'check-suite missing score-readiness check.');
}

function main() {
  assertScriptSafety();
  assertFixtures();
  assertReadinessOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor score-readiness matrix: PASS');
}

main();
