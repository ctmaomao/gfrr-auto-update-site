import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REPLAY_SCRIPT = 'scripts/replay-transport-shock-confirmation-factor-free-proxy-score-candidate.mjs';
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-score-candidate-blocked.json';
const FIXTURE_READY = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-score-candidate-ready.json';

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
  'transport-shock-confirmation-factor-free-proxy-score-replay-v1',
  'replay-transport-shock-confirmation-factor-free-proxy-score-candidate',
  'free_proxy_score_replay_scaffold_pass_no_score_write',
  'transportShockFreeProxyScoreReplay'
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
  assert(fs.existsSync(absolute(REPLAY_SCRIPT)), 'Free-proxy score replay script is missing.');
  const source = readText(REPLAY_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Free-proxy score replay script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'artifact-only Transport Shock Confirmation Factor free-proxy score replay scaffold',
    'hard_cap_control_scaffold_only',
    'historicalBacktestPerformed',
    'candidateScoreContributionPct',
    'noNetworkCall',
    'noProductionWrite',
    'noScoreWrite',
    'eligibleForMainScore'
  ]) {
    assert(source.includes(marker), `Free-proxy score replay script missing required boundary marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'Free-proxy score candidate fixture is missing.');
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-candidate-v1', 'Fixture schemaVersion mismatch.');
  assert(fixture.status === 'free_proxy_score_candidate_blocked_no_score_write', 'Fixture must be blocked no-score-write candidate.');
  assert(fixture.candidateScoreContributionPct === 0, 'Fixture candidate contribution must stay 0.');
  assert(fixture.hardCaps.newsOnlyContributionPct === 0, 'Fixture news-only cap must stay 0%.');
  assert(fixture.hardCaps.singleChokepointOnlyContributionPct === 0, 'Fixture single-chokepoint cap must stay 0%.');
  assert(fixture.hardCaps.stalePortWatchContributionPct === 0, 'Fixture stale-PortWatch cap must stay 0%.');
  assert(fixture.scoreWriteApproved === false, 'Fixture must not approve score write.');
  assert(fixture.productionWriteApproved === false, 'Fixture must not approve production write.');
  assert(fixture.eligibleForMainScore === false, 'Fixture eligibleForMainScore must stay false.');
  const readyFixture = JSON.parse(readText(FIXTURE_READY));
  assert(readyFixture.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-candidate-v1', 'Ready fixture schemaVersion mismatch.');
  assert(readyFixture.status === 'free_proxy_score_candidate_ready_no_score_write', 'Ready fixture must be ready no-score-write candidate.');
  assert(readyFixture.candidateScoreContributionPct === 3, 'Ready fixture candidate contribution must be capped at 3.');
  assert(readyFixture.maxFutureMainScoreContributionPct === 3, 'Ready fixture max cap must be 3.');
  assert(readyFixture.scoreWriteApproved === false, 'Ready fixture must not approve score write.');
  assert(readyFixture.productionWriteApproved === false, 'Ready fixture must not approve production write.');
  assert(readyFixture.eligibleForMainScore === false, 'Ready fixture eligibleForMainScore must stay false.');
}

function assertReplayOutput() {
  const stdout = runNode([
    REPLAY_SCRIPT,
    '--input',
    FIXTURE,
    '--no-output',
    '--json'
  ]);
  const replay = JSON.parse(stdout);
  assert(replay.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-replay-v1', 'Unexpected replay schemaVersion.');
  assert(replay.status === 'free_proxy_score_replay_scaffold_pass_no_score_write', 'Expected replay scaffold pass no-score-write status.');
  assert(replay.recommendation === 'ready_for_historical_replay_sample_design_keep_no_score_write', 'Unexpected recommendation.');
  assert(replay.replayControlPass === true, 'Replay controls must pass.');
  assert(replay.historicalBacktestPerformed === false, 'Historical backtest must not be claimed.');
  assert(replay.historicalBacktestReady === false, 'Historical backtest readiness must stay false.');
  assert(replay.replayScope === 'hard_cap_control_scaffold_only', 'Unexpected replay scope.');
  assert(replay.candidateScoreContributionPct === 0, 'Replay candidate contribution must stay 0.');
  assert(replay.scoreWriteApproved === false, 'Replay must not approve score write.');
  assert(replay.productionWriteApproved === false, 'Replay must not approve production write.');
  assert(replay.scoreIntegrationApproved === false, 'Replay must not approve score integration.');
  assert(replay.eligibleForMainScore === false, 'Replay eligibleForMainScore must stay false.');
  assert(replay.routeFreightConfirmation === 'not_connected', 'Replay routeFreightConfirmation must stay not_connected.');
  assert(replay.marketConfirmation === 'not_connected', 'Replay marketConfirmation must stay not_connected.');
  for (const controlId of ['news_only', 'single_chokepoint_only', 'stale_portwatch', 'blocked_candidate']) {
    const control = replay.controls.find((item) => item.id === controlId);
    assert(control?.pass === true, `Replay control must pass: ${controlId}`);
    assert(control.observedContributionPct === 0, `Replay control observed contribution must be 0: ${controlId}`);
  }
  assert(replay.productionImpact.affectsScoring === false, 'Replay must not affect scoring.');
  assert(replay.productionImpact.affectsMainJudgment === false, 'Replay must not affect main judgment.');
  assert(replay.boundaries.noNetworkCall === true, 'Replay must lock noNetworkCall.');
  assert(replay.boundaries.noProductionWrite === true, 'Replay must lock noProductionWrite.');
  assert(replay.boundaries.noScoreWrite === true, 'Replay must lock noScoreWrite.');
  assert(replay.boundaries.noHistoricalBacktestPerformed === true, 'Replay must lock noHistoricalBacktestPerformed.');
}

function assertReadyReplayOutput() {
  const stdout = runNode([
    REPLAY_SCRIPT,
    '--input',
    FIXTURE_READY,
    '--no-output',
    '--json'
  ]);
  const replay = JSON.parse(stdout);
  assert(replay.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-replay-v1', 'Unexpected replay schemaVersion.');
  assert(replay.status === 'free_proxy_score_replay_scaffold_pass_no_score_write', 'Expected ready replay scaffold pass no-score-write status.');
  assert(replay.recommendation === 'ready_for_historical_replay_sample_design_keep_no_score_write', 'Unexpected recommendation.');
  assert(replay.replayControlPass === true, 'Ready replay controls must pass.');
  assert(replay.historicalBacktestPerformed === false, 'Historical backtest must not be claimed.');
  assert(replay.inputStatus === 'free_proxy_score_candidate_ready_no_score_write', 'Replay should preserve ready input status.');
  assert(replay.candidateScoreContributionPct === 3, 'Ready replay candidate contribution should remain 3.');
  assert(replay.maxFutureMainScoreContributionPct === 3, 'Ready replay max cap should remain 3.');
  for (const controlId of ['news_only', 'single_chokepoint_only', 'stale_portwatch', 'ready_candidate_cap']) {
    const control = replay.controls.find((item) => item.id === controlId);
    assert(control?.pass === true, `Ready replay control must pass: ${controlId}`);
  }
  assert(replay.scoreWriteApproved === false, 'Ready replay must not approve score write.');
  assert(replay.productionWriteApproved === false, 'Ready replay must not approve production write.');
  assert(replay.scoreIntegrationApproved === false, 'Ready replay must not approve score integration.');
  assert(replay.eligibleForMainScore === false, 'Ready replay eligibleForMainScore must stay false.');
  assert(replay.productionImpact.affectsScoring === false, 'Ready replay must not affect scoring.');
  assert(replay.productionImpact.affectsMainJudgment === false, 'Ready replay must not affect main judgment.');
  assert(replay.boundaries.noScoreWrite === true, 'Ready replay must lock noScoreWrite.');
  assert(replay.boundaries.noHistoricalBacktestPerformed === true, 'Ready replay must lock noHistoricalBacktestPerformed.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains free-proxy replay marker and may have been wired too early: ${marker}`);
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
    'replay:transport-shock-confirmation-factor-free-proxy-score-candidate',
    'transport-shock-confirmation-factor-free-proxy-score-replay-v1',
    'free_proxy_score_replay_scaffold_pass_no_score_write',
    'historicalBacktestPerformed=false'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-free-proxy-score-replay-v1',
    'free_proxy_score_replay_scaffold_pass_no_score_write',
    'scoreIntegrationApproved=false',
    'eligibleForMainScore=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-free-proxy-score-replay-v1'), 'SIGNAL_INTAKE missing free-proxy replay marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy score replay scaffold'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing free-proxy replay marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy score replay scaffold'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing free-proxy replay boundary.');
  assert(packageJson.scripts['replay:transport-shock-confirmation-factor-free-proxy-score-candidate'], 'package.json missing replay script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-score-replay'], 'package.json missing replay checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-score-replay'), 'check-suite missing free-proxy replay check.');
}

function main() {
  assertScriptSafety();
  assertFixture();
  assertReplayOutput();
  assertReadyReplayOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy score replay scaffold: PASS');
}

main();
