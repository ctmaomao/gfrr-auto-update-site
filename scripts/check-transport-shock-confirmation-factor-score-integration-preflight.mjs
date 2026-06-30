import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-score-integration-preflight.mjs';
const FIXTURE_FREE_PROXY_GATE = 'docs/fixtures/transport-shock-confirmation-factor/score-integration-preflight-free-proxy-gate-passed.json';
const FIXTURE_CROSS_CONFIRMATION = 'docs/fixtures/transport-shock-confirmation-factor/score-integration-preflight-cross-confirmation-blocked.json';

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
    'scoreIntegrationPreflightOnly',
    'eligibleForMainScore',
    'noScoreWrite'
  ]) {
    assert(source.includes(marker), `Score-integration preflight script missing required marker: ${marker}`);
  }
}

function assertFixtures() {
  for (const fixture of [FIXTURE_FREE_PROXY_GATE, FIXTURE_CROSS_CONFIRMATION]) {
    assert(fs.existsSync(absolute(fixture)), `Fixture missing: ${fixture}`);
  }
  const gate = JSON.parse(readText(FIXTURE_FREE_PROXY_GATE));
  const cross = JSON.parse(readText(FIXTURE_CROSS_CONFIRMATION));
  assert(gate.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-score-readiness-gate-v1', 'Free-proxy gate fixture schema mismatch.');
  assert(gate.gatePassed === true, 'Free-proxy gate fixture must pass.');
  assert(cross.schemaVersion === 'transport-shock-confirmation-factor-cross-confirmation-v1', 'Cross-confirmation fixture schema mismatch.');
  assert(cross.crossConfirmationReady === false, 'Cross-confirmation fixture must remain blocked.');
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
  const backlog = readText('docs/PROJECT_BACKLOG.md');
  const agents = readText('AGENTS.md');
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
  assert(backlog.includes('Transport Shock Confirmation Factor score-integration preflight'), 'PROJECT_BACKLOG missing score-integration preflight marker.');
  assert(agents.includes('Transport Shock Confirmation Factor score-integration preflight'), 'AGENTS.md missing score-integration preflight boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-score-integration-preflight'], 'package.json missing review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-score-integration-preflight'], 'package.json missing checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-score-integration-preflight'), 'check-suite missing score-integration preflight check.');
}

function main() {
  assertScriptSafety();
  assertFixtures();
  assertPreflightOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor score-integration preflight: PASS');
}

main();
