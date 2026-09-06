import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-free-proxy-score-write-design.mjs';
const CANDIDATE_READY = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-score-candidate-ready.json';
const CANDIDATE_BLOCKED = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-score-candidate-blocked.json';
const REPLAY_READY = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-score-replay-ready.json';

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
  'transport-shock-confirmation-factor-free-proxy-score-write-design-review-v1',
  'review-transport-shock-confirmation-factor-free-proxy-score-write-design',
  'score_write_design_review_ready_no_production_write',
  'transportShockFreeProxyScoreWriteDesign'
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
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Free-proxy score-write design review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Score-write design review script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local Transport Shock free-proxy score-write design review',
    'score_write_design_review_ready_no_production_write',
    'candidateScoreContributionPct',
    'historicalBacktestPerformed',
    'scoreWriteApproved',
    'productionWriteApproved',
    'eligibleForMainScore',
    'noScoreWrite'
  ]) {
    assert(source.includes(marker), `Score-write design review script missing required marker: ${marker}`);
  }
}

function assertFixtures() {
  for (const fixturePath of [CANDIDATE_READY, CANDIDATE_BLOCKED, REPLAY_READY]) {
    assert(fs.existsSync(absolute(fixturePath)), `Fixture missing: ${fixturePath}`);
  }
  const candidate = JSON.parse(readText(CANDIDATE_READY));
  assert(candidate.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-candidate-v1', 'Ready candidate schema mismatch.');
  assert(candidate.status === 'free_proxy_score_candidate_ready_no_score_write', 'Ready candidate status mismatch.');
  assert(candidate.candidateScoreContributionPct === 3, 'Ready candidate contribution must be 3%.');
  assert(candidate.maxFutureMainScoreContributionPct === 3, 'Ready candidate max cap must be 3%.');
  assert(candidate.scoreWriteApproved === false, 'Ready candidate must not approve score write.');
  assert(candidate.eligibleForMainScore === false, 'Ready candidate must not be eligible for main score.');

  const replay = JSON.parse(readText(REPLAY_READY));
  assert(replay.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-replay-v1', 'Ready replay schema mismatch.');
  assert(replay.status === 'free_proxy_score_replay_scaffold_pass_no_score_write', 'Ready replay status mismatch.');
  assert(replay.inputStatus === 'free_proxy_score_candidate_ready_no_score_write', 'Ready replay must use ready candidate input status.');
  assert(replay.replayControlPass === true, 'Ready replay controls must pass.');
  assert(replay.historicalBacktestPerformed === false, 'Ready replay must not claim historical backtest.');
  assert(replay.candidateScoreContributionPct === 3, 'Ready replay contribution must be 3%.');
  assert(replay.maxFutureMainScoreContributionPct === 3, 'Ready replay max cap must be 3%.');
  assert(replay.scoreWriteApproved === false, 'Ready replay must not approve score write.');
  assert(replay.scoreIntegrationApproved === false, 'Ready replay must not approve score integration.');
  assert(replay.eligibleForMainScore === false, 'Ready replay must not be eligible for main score.');
}

function assertReadyReviewOutput() {
  const review = JSON.parse(runNode([
    REVIEW_SCRIPT,
    '--candidate',
    CANDIDATE_READY,
    '--replay',
    REPLAY_READY,
    '--no-output',
    '--json'
  ]));
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-write-design-review-v1', 'Unexpected review schemaVersion.');
  assert(review.status === 'score_write_design_review_ready_no_production_write', 'Expected ready design review status.');
  assert(review.recommendation === 'open_separate_runtime_score_integration_design_review_do_not_auto_wire', 'Unexpected ready recommendation.');
  assert(review.scoreWriteDesignReady === true, 'Ready review should set scoreWriteDesignReady true.');
  assert(review.candidateScoreContributionPct === 3, 'Ready review contribution must be 3%.');
  assert(review.maxFutureMainScoreContributionPct === 3, 'Ready review max cap must be 3%.');
  assert(review.confidence === 'low', 'Ready review confidence should remain low.');
  assert(review.historicalBacktestPerformed === false, 'Ready review must not claim historical backtest.');
  assert(review.historicalBacktestReady === false, 'Ready review must not claim historical backtest readiness.');
  assert(review.replayControlPass === true, 'Ready review replayControlPass must be true.');
  for (const controlId of ['news_only', 'single_chokepoint_only', 'stale_portwatch', 'ready_candidate_cap']) {
    const control = review.replayControls.find((item) => item.id === controlId);
    assert(control?.pass === true, `Ready review control must pass: ${controlId}`);
  }
  assert(review.scoreWriteApproved === false, 'Ready review must not approve score write.');
  assert(review.productionWriteApproved === false, 'Ready review must not approve production write.');
  assert(review.scoreIntegrationApproved === false, 'Ready review must not approve score integration.');
  assert(review.mainScoreApproved === false, 'Ready review must not approve main score.');
  assert(review.eligibleForMainScore === false, 'Ready review must not be main-score eligible.');
  assert(review.routeFreightConfirmation === 'not_connected', 'Route freight must remain not_connected.');
  assert(review.marketConfirmation === 'not_connected', 'Market confirmation must remain not_connected.');
  assert(review.productionImpact.affectsScoring === false, 'Ready review must not affect scoring.');
  assert(review.productionImpact.affectsMainJudgment === false, 'Ready review must not affect main judgment.');
  assert(review.boundaries.noNetworkCall === true, 'Ready review must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Ready review must lock noProductionWrite.');
  assert(review.boundaries.noScoreWrite === true, 'Ready review must lock noScoreWrite.');
}

function assertBlockedReviewOutput() {
  const review = JSON.parse(runNode([
    REVIEW_SCRIPT,
    '--candidate',
    CANDIDATE_BLOCKED,
    '--replay',
    REPLAY_READY,
    '--no-output',
    '--json'
  ]));
  assert(review.status === 'score_write_design_review_blocked_no_production_write', 'Blocked fixture should block design review.');
  assert(review.scoreWriteDesignReady === false, 'Blocked review should not be design ready.');
  assert(review.candidateScoreContributionPct === 0, 'Blocked review contribution must be 0.');
  assert(review.blockerCount > 0, 'Blocked review must report blockers.');
  assert(review.blockers.some((item) => item.id === 'candidate_not_ready'), 'Blocked review should include candidate_not_ready.');
  assert(review.scoreWriteApproved === false, 'Blocked review must not approve score write.');
  assert(review.eligibleForMainScore === false, 'Blocked review must not be main-score eligible.');
  assert(review.boundaries.noScoreWrite === true, 'Blocked review must lock noScoreWrite.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains score-write design review marker and may have been wired too early: ${marker}`);
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
    'review:transport-shock-confirmation-factor-free-proxy-score-write-design',
    'transport-shock-confirmation-factor-free-proxy-score-write-design-review-v1',
    'score_write_design_review_ready_no_production_write',
    'runtime_score_integration_design_review'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-free-proxy-score-write-design-review-v1',
    'scoreWriteDesignReady',
    'scoreWriteApproved=false',
    'eligibleForMainScore=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-free-proxy-score-write-design-review-v1'), 'SIGNAL_INTAKE missing score-write design review marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy score-write design review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing score-write design review marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy score-write design review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing score-write design review boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-free-proxy-score-write-design'], 'package.json missing score-write design review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-score-write-design'], 'package.json missing score-write design review checker.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-score-write-design'), 'check-suite missing score-write design review checker.');
}

function main() {
  assertScriptSafety();
  assertFixtures();
  assertReadyReviewOutput();
  assertBlockedReviewOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy score-write design review: PASS');
}

main();
