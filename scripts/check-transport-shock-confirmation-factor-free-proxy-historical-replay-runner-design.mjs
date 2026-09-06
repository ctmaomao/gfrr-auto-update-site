import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOC = 'docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_HISTORICAL_REPLAY_RUNNER_DESIGN.md';
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-runner-design-v1.json';

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
  'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-design-v1',
  'free-proxy-historical-replay-runner-design',
  'transportShockFreeProxyHistoricalReplayRunnerDesign'
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
  assert(fs.existsSync(absolute(DOC)), 'Historical replay runner design doc is missing.');
  const doc = readText(DOC);
  for (const marker of [
    'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-design-v1',
    'runner_design_only_no_replay_execution',
    'false-positive rate',
    'known-disruption directional hit rate',
    'does not implement a replay runner',
    'does not change',
    'P-score-26'
  ]) {
    assert(doc.includes(marker), `Historical replay runner design doc missing marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'Historical replay runner design fixture is missing.');
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.contractVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-design-v1', 'Unexpected contractVersion.');
  assert(fixture.status === 'runner_design_only_no_replay_execution', 'Fixture must stay design-only no replay execution.');
  assert(fixture.currentState.historicalReplayRunnerImplemented === false, 'Replay runner must not be implemented.');
  assert(fixture.currentState.historicalReplayExecuted === false, 'Replay execution must not be claimed.');
  assert(fixture.currentState.historicalBacktestPerformed === false, 'Historical backtest must not be claimed.');
  assert(fixture.currentState.scoreIntegrationApproved === false, 'Score integration must not be approved.');
  assert(fixture.currentState.scoreWriteApproved === false, 'Score write must not be approved.');
  assert(fixture.currentState.productionWriteApproved === false, 'Production write must not be approved.');
  assert(fixture.currentState.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(fixture.currentState.candidateScoreContributionPct === 0, 'Candidate contribution must stay 0.');
  assert(fixture.futureRunner.noLiveFetch === true, 'Future runner must lock noLiveFetch.');
  assert(fixture.futureRunner.noEnvironmentRead === true, 'Future runner must lock noEnvironmentRead.');
  assert(fixture.futureRunner.noProductionDataRead === true, 'Future runner must lock noProductionDataRead.');
  assert(fixture.futureRunner.noProductionDataWrite === true, 'Future runner must lock noProductionDataWrite.');
  assert(fixture.futureRunner.outputPathCandidate.startsWith('manual-artifacts/transport-shock-confirmation-factor/'), 'Future runner output must stay under manual artifacts.');
  assert(fixture.futureRunner.allowedInputRoots.includes('manual-artifacts/transport-shock-confirmation-factor/'), 'Manual artifact input root missing.');
  assert(fixture.futureRunner.allowedInputRoots.includes('docs/fixtures/transport-shock-confirmation-factor/'), 'Fixture input root missing.');
  assert(fixture.futureRunner.disallowedInputRoots.includes('data/'), 'Production data root must be disallowed.');
  assert(fixture.futureRunner.disallowedInputRoots.includes('manual-artifacts/bubble-watch-backtest/'), 'Bubble Watch artifact root must be disallowed.');
  assert(fixture.requiredReplayMetrics.falsePositiveRate === true, 'falsePositiveRate metric is required.');
  assert(fixture.requiredReplayMetrics.knownDisruptionDirectionalHitRate === true, 'knownDisruptionDirectionalHitRate metric is required.');
  assert(fixture.requiredReplayMetrics.zeroControlContributionPct === true, 'zeroControlContributionPct metric is required.');
  assert(fixture.passFailRules.newsOnlyContributionPct === 0, 'News-only contribution must stay 0.');
  assert(fixture.passFailRules.headlineOnlyFalsePositiveContributionPct === 0, 'Headline-only contribution must stay 0.');
  assert(fixture.passFailRules.singleChokepointOnlyContributionPct === 0, 'Single-chokepoint contribution must stay 0.');
  assert(fixture.passFailRules.stalePortWatchContributionPct === 0, 'Stale PortWatch contribution must stay 0.');
  assert(fixture.passFailRules.maximumFalsePositiveRate <= 0.2, 'False-positive threshold must stay conservative.');
  assert(fixture.passFailRules.minimumKnownDisruptionDirectionalHitRate >= 0.6, 'Known-disruption threshold must stay meaningful.');
  assert(fixture.passFailRules.maximumCandidateContributionPct === 3, 'Candidate contribution cap must stay 3%.');
  assert(fixture.passFailRules.requiresSeparateReviewedScorePr === true, 'Score integration must require separate reviewed PR.');
  assert(fixture.approvalState.historicalReplayRunnerImplemented === false, 'Approval state must not claim runner implementation.');
  assert(fixture.approvalState.scoreWriteApproved === false, 'Approval state must not approve score write.');
  assert(fixture.approvalState.productionWriteApproved === false, 'Approval state must not approve production write.');
  assert(fixture.boundaries.noReplayExecution === true, 'Boundary must lock noReplayExecution.');
  assert(fixture.boundaries.noProductionDataWrite === true, 'Boundary must lock noProductionDataWrite.');
  assert(fixture.boundaries.noScoreWrite === true, 'Boundary must lock noScoreWrite.');
  assert(fixture.boundaries.noBubbleWatchChange === true, 'Boundary must lock noBubbleWatchChange.');
  for (const hardFail of [
    'score_write_approved',
    'production_write_approved',
    'odp_final_bias_changed',
    'cross_validation_connected',
    'raw_citation_stored'
  ]) {
    assert(fixture.hardFailClaims.includes(hardFail), `Missing hard-fail claim: ${hardFail}`);
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains historical replay runner design marker and may have been wired too early: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
  const packageJson = JSON.parse(readText('package.json'));
  const checkSuite = readText('scripts/check-suite.mjs');

  for (const marker of [
    'transport-shock-confirmation-factor-free-proxy-historical-replay-runner-design-v1',
    'runner_design_only_no_replay_execution',
    'historicalBacktestPerformed=false'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy historical replay runner design'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing runner design marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy historical replay runner design'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing runner design boundary.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-historical-replay-runner-design'], 'package.json missing runner design checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-historical-replay-runner-design'), 'check-suite missing runner design check.');
}

function main() {
  assertDoc();
  assertFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy historical replay runner design: PASS');
}

main();
