import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PROJECT_SCRIPT = 'scripts/project-transport-shock-confirmation-factor-free-proxy-score-candidate.mjs';
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor-free-proxy-score-design-v1.json';

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
  'transport-shock-confirmation-factor-free-proxy-score-candidate-v1',
  'project-transport-shock-confirmation-factor-free-proxy-score-candidate',
  'free_proxy_score_candidate_blocked_no_score_write',
  'transportShockFreeProxyScoreCandidate'
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
  assert(fs.existsSync(absolute(PROJECT_SCRIPT)), 'Free-proxy score candidate projection script is missing.');
  const source = readText(PROJECT_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Free-proxy score candidate script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'artifact-only Transport Shock Confirmation Factor free-proxy score candidate projection',
    'free_proxy_only_low_weight_candidate',
    'candidateScoreContributionPct',
    'noNetworkCall',
    'noProductionWrite',
    'noScoreWrite',
    'routeFreightConfirmation',
    'not_connected',
    'eligibleForMainScore'
  ]) {
    assert(source.includes(marker), `Free-proxy score candidate script missing required boundary marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'Free-proxy score design fixture is missing.');
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.contractVersion === 'transport-shock-confirmation-factor-free-proxy-score-design-v1', 'Fixture contractVersion mismatch.');
  assert(fixture.status === 'design_only_no_score_write', 'Fixture must stay design-only.');
  assert(fixture.scoreCap.maxFutureMainScoreContributionPct === 3, 'Fixture score cap must stay 3%.');
  assert(fixture.scoreCap.newsOnlyContributionPct === 0, 'Fixture news-only cap must stay 0%.');
  assert(fixture.scoreCap.singleChokepointOnlyContributionPct === 0, 'Fixture single-chokepoint cap must stay 0%.');
  assert(fixture.scoreCap.stalePortWatchContributionPct === 0, 'Fixture stale-PortWatch cap must stay 0%.');
  assert(fixture.approvalState.scoreWriteApproved === false, 'Fixture must not approve score write.');
  assert(fixture.approvalState.productionWriteApproved === false, 'Fixture must not approve production write.');
  assert(fixture.currentProductionState.routeFreightConfirmation === 'not_connected', 'Fixture routeFreightConfirmation must stay not_connected.');
  assert(fixture.currentProductionState.marketConfirmation === 'not_connected', 'Fixture marketConfirmation must stay not_connected.');
  assert(fixture.currentProductionState.eligibleForMainScore === false, 'Fixture eligibleForMainScore must stay false.');
}

function assertProjectionOutput() {
  const stdout = runNode([
    PROJECT_SCRIPT,
    '--input',
    FIXTURE,
    '--no-output',
    '--json'
  ]);
  const projection = JSON.parse(stdout);
  assert(projection.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-candidate-v1', 'Unexpected projection schemaVersion.');
  assert(projection.status === 'free_proxy_score_candidate_blocked_no_score_write', 'Expected blocked no-score-write projection.');
  assert(projection.recommendation === 'collect_required_confirmations_before_separate_score_pr', 'Unexpected recommendation.');
  assert(projection.maxFutureMainScoreContributionPct === 3, 'Expected max future contribution cap of 3%.');
  assert(projection.candidateScoreContributionPct === 0, 'Candidate contribution must stay 0 until gates pass.');
  assert(projection.hardCaps.newsOnlyContributionPct === 0, 'News-only contribution must stay 0%.');
  assert(projection.hardCaps.singleChokepointOnlyContributionPct === 0, 'Single chokepoint contribution must stay 0%.');
  assert(projection.hardCaps.stalePortWatchContributionPct === 0, 'Stale PortWatch contribution must stay 0%.');
  assert(projection.scoreScope === 'free_proxy_only_low_weight_candidate', 'Unexpected scoreScope.');
  assert(projection.confidence === 'none', 'Confidence must stay none while score gates are blocked.');
  assert(projection.scoreWriteApproved === false, 'Projection must not approve score write.');
  assert(projection.productionWriteApproved === false, 'Projection must not approve production write.');
  assert(projection.mainScoreApproved === false, 'Projection must not approve main score.');
  assert(projection.freeProxyScoreGenerated === false, 'Projection must not claim generated score.');
  assert(projection.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(projection.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(projection.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  for (const blocker of [
    'portwatch_live_not_verified',
    'non_news_physical_confirmation_missing',
    'market_confirmation_review_missing',
    'thermal_or_eia_anchor_missing',
    'history_sample_review_missing',
    'backtest_or_replay_review_missing'
  ]) {
    assert(projection.blockers.includes(blocker), `Projection missing blocker: ${blocker}`);
  }
  assert(projection.productionImpact.affectsScoring === false, 'Projection must not affect scoring.');
  assert(projection.productionImpact.affectsMainJudgment === false, 'Projection must not affect main judgment.');
  assert(projection.boundaries.noNetworkCall === true, 'Projection must lock noNetworkCall.');
  assert(projection.boundaries.noProductionWrite === true, 'Projection must lock noProductionWrite.');
  assert(projection.boundaries.noScoreWrite === true, 'Projection must lock noScoreWrite.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains free-proxy score candidate marker and may have been wired too early: ${marker}`);
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
    'project:transport-shock-confirmation-factor-free-proxy-score-candidate',
    'transport-shock-confirmation-factor-free-proxy-score-candidate-v1',
    'free_proxy_score_candidate_blocked_no_score_write',
    'candidateScoreContributionPct=0'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-free-proxy-score-candidate-v1',
    'free_proxy_score_candidate_blocked_no_score_write',
    'scoreWriteApproved=false',
    'eligibleForMainScore=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-free-proxy-score-candidate-v1'), 'SIGNAL_INTAKE missing free-proxy score candidate marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy score candidate projection'), 'PROJECT_BACKLOG missing free-proxy score candidate marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy score candidate projection'), 'AGENTS.md missing free-proxy score candidate boundary.');
  assert(packageJson.scripts['project:transport-shock-confirmation-factor-free-proxy-score-candidate'], 'package.json missing projection script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-score-candidate'], 'package.json missing checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-score-candidate'), 'check-suite missing free-proxy score candidate check.');
}

function main() {
  assertScriptSafety();
  assertFixture();
  assertProjectionOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy score candidate projection: PASS');
}

main();
