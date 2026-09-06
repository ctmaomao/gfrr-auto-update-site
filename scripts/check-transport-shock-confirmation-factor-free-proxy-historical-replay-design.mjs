import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOC = 'docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_HISTORICAL_REPLAY_DESIGN.md';
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-design-v1.json';

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
  'transport-shock-confirmation-factor-free-proxy-historical-replay-design-v1',
  'free-proxy-historical-replay-design',
  'transportShockFreeProxyHistoricalReplayDesign'
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
  assert(fs.existsSync(absolute(DOC)), 'Historical replay design doc is missing.');
  const doc = readText(DOC);
  for (const marker of [
    'transport-shock-confirmation-factor-free-proxy-historical-replay-design-v1',
    'design_only_no_replay_execution',
    'known_disruption_tightening',
    'headline_only_false_positive',
    'single_chokepoint_noise',
    'stale_physical_proxy',
    'historical backtest',
    'does not change'
  ]) {
    assert(doc.includes(marker), `Historical replay design doc missing marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'Historical replay design fixture is missing.');
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.contractVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-design-v1', 'Unexpected contractVersion.');
  assert(fixture.status === 'design_only_no_replay_execution', 'Fixture must stay design-only no replay execution.');
  assert(fixture.currentState.historicalReplayRunnerImplemented === false, 'Historical replay runner must not be implemented.');
  assert(fixture.currentState.historicalBacktestPerformed === false, 'Historical backtest must not be claimed.');
  assert(fixture.currentState.scoreIntegrationApproved === false, 'Score integration must not be approved.');
  assert(fixture.currentState.scoreWriteApproved === false, 'Score write must not be approved.');
  assert(fixture.currentState.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(fixture.currentState.candidateScoreContributionPct === 0, 'Candidate contribution must stay 0.');
  assert(fixture.minimumReplayDataset.minimumProductionHistorySamples >= 24, 'Minimum production history samples must be at least 24.');
  assert(fixture.minimumReplayDataset.minimumFalsePositiveControlSamples >= 6, 'Minimum false-positive controls must be at least 6.');
  assert(fixture.minimumReplayDataset.minimumKnownDisruptionSamples >= 3, 'Minimum known-disruption samples must be at least 3.');
  assert(fixture.passFailRules.newsOnlyContributionPct === 0, 'News-only contribution must stay 0.');
  assert(fixture.passFailRules.singleChokepointOnlyContributionPct === 0, 'Single-chokepoint contribution must stay 0.');
  assert(fixture.passFailRules.stalePortWatchContributionPct === 0, 'Stale PortWatch contribution must stay 0.');
  assert(fixture.passFailRules.maximumFalsePositiveRate <= 0.2, 'False-positive threshold must stay conservative.');
  assert(fixture.passFailRules.minimumKnownDisruptionDirectionalHitRate >= 0.6, 'Known disruption hit-rate threshold must stay meaningful.');
  assert(fixture.passFailRules.maximumMainScoreContributionPct === 3, 'Maximum main-score contribution must stay capped at 3%.');
  assert(fixture.approvalState.scoreWriteApproved === false, 'Approval state must not approve score write.');
  assert(fixture.approvalState.productionWriteApproved === false, 'Approval state must not approve production write.');
  assert(fixture.boundaries.noReplayExecution === true, 'Boundary must lock noReplayExecution.');
  assert(fixture.boundaries.noProductionDataWrite === true, 'Boundary must lock noProductionDataWrite.');
  assert(fixture.boundaries.noScoreWrite === true, 'Boundary must lock noScoreWrite.');
  const familyKeys = new Set(fixture.requiredSampleFamilies.map((family) => family.familyKey));
  for (const familyKey of [
    'known_disruption_tightening',
    'headline_only_false_positive',
    'single_chokepoint_noise',
    'stale_physical_proxy',
    'market_confirmation_divergence',
    'benign_baseline'
  ]) {
    assert(familyKeys.has(familyKey), `Missing required sample family: ${familyKey}`);
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains historical replay design marker and may have been wired too early: ${marker}`);
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
    'transport-shock-confirmation-factor-free-proxy-historical-replay-design-v1',
    'design_only_no_replay_execution',
    'historicalBacktestPerformed=false'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy historical replay design'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing historical replay design marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy historical replay design'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing historical replay design boundary.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-historical-replay-design'], 'package.json missing historical replay design checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-historical-replay-design'), 'check-suite missing historical replay design check.');
}

function main() {
  assertDoc();
  assertFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy historical replay design: PASS');
}

main();
