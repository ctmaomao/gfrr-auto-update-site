import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MANIFEST_PATH } from './lib/free-proxy-evidence-manifest.mjs';

const ROOT = process.cwd();
const REVIEW_SCRIPT = 'scripts/review-transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples.mjs';
const INTAKE_FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-real-event-sample-intake-known-disruption-pass.json';

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
  'market.worker-preview.json',
  'bubble-watch'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples-review-v1',
  'review-transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples',
  'real_event_sample_set_review_ready_keep_no_score_write'
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

function assertReviewScriptSafety() {
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Real-event samples review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Real-event samples review script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local Transport Shock free-proxy historical replay real-event sample-set aggregation/readiness review only',
    'real_event_sample_set_review_ready_keep_no_score_write',
    'scoreReadinessApproved',
    'productionHistoricalReplayPerformed',
    'historicalBacktestPerformed',
    'scoreWriteApproved',
    'eligibleForMainScore',
    'rawCitationStored'
  ]) {
    assert(source.includes(marker), `Real-event samples review script missing required marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(INTAKE_FIXTURE)), 'Real-event intake fixture is missing.');
  const fixture = JSON.parse(readText(INTAKE_FIXTURE));
  assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake-v1', 'Intake fixture schemaVersion mismatch.');
  assert(fixture.status === 'real_event_sample_intake_ready_keep_no_score_write', 'Intake fixture must be ready/no-score-write.');
  assert(fixture.sampleReview.status === 'sample_review_ready_keep_no_score_write', 'Intake fixture sampleReview status mismatch.');
  assert(fixture.sampleReview.realEventCandidate === true, 'Intake fixture sampleReview must be real-event candidate.');
  assert(fixture.sampleReview.scoreWriteApproved === false, 'Intake fixture must not approve score write.');
  assert(fixture.sampleReview.productionWriteApproved === false, 'Intake fixture must not approve production write.');
  assert(fixture.sampleReview.eligibleForMainScore === false, 'Intake fixture must not be eligible for main score.');
  assert(fixture.sampleReview.review.rawCitationStored === false, 'Intake fixture must not store raw citation.');
  assert(fixture.sampleReview.review.compactEvidence.every((row) => row.rawCitationStored === false), 'Compact evidence must not store raw citation.');
  assert(!JSON.stringify(fixture.sampleReview).includes('https://'), 'Sample review fixture must not include raw URLs.');
}

function assertReviewOutput() {
  const review = JSON.parse(runNode([
    REVIEW_SCRIPT,
    '--input',
    INTAKE_FIXTURE,
    '--min-samples',
    '1',
    '--min-known-disruption-samples',
    '1',
    '--min-zero-control-samples',
    '0',
    '--no-output',
    '--json'
  ]));
  assert(review.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples-review-v1', 'Unexpected review schemaVersion.');
  assert(review.contractVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-set-review-v1', 'Unexpected review contractVersion.');
  assert(review.status === 'real_event_sample_set_review_ready_keep_no_score_write', 'Expected real-event sample-set review ready.');
  assert(review.recommendation === 'continue_collecting_real_event_samples_before_score_readiness_keep_no_score_write', 'Unexpected recommendation.');
  assert(review.sampleCount === 1, 'Expected one sample.');
  assert(review.usableSampleCount === 1, 'Expected one usable sample.');
  assert(review.realEventCandidateCount === 1, 'Expected one real-event candidate.');
  assert(review.knownDisruptionSampleCount === 1, 'Expected one known-disruption sample.');
  assert(review.zeroControlSampleCount === 0, 'Expected zero zero-control real-event samples in starter fixture.');
  assert(review.knownDisruptionDirectionalHitRate === 1, 'Known-disruption directional hit rate should be 1.');
  assert(review.falsePositiveRate === null, 'False-positive rate should be null without zero controls.');
  assert(review.familyCoverage.known_disruption_tightening === 1, 'Known-disruption family coverage missing.');
  assert(review.scoreReadinessApproved === false, 'Review must not approve score readiness.');
  assert(review.scoreWriteApproved === false, 'Review must not approve score write.');
  assert(review.productionWriteApproved === false, 'Review must not approve production write.');
  assert(review.eligibleForMainScore === false, 'Review must not be eligible for main score.');
  assert(review.productionHistoricalReplayPerformed === false, 'Review must not claim production historical replay.');
  assert(review.historicalBacktestPerformed === false, 'Review must not claim historical backtest.');
  assert(review.productionImpact.affectsScoring === false, 'Review must not affect scoring.');
  assert(review.productionImpact.affectsMainJudgment === false, 'Review must not affect main judgment.');
  assert(review.boundaries.noNetworkCall === true, 'Review must lock noNetworkCall.');
  assert(review.boundaries.noProductionWrite === true, 'Review must lock noProductionWrite.');
  assert(review.boundaries.noScoreWrite === true, 'Review must lock noScoreWrite.');
  assert(review.boundaries.noProductionReplayExecution === true, 'Review must lock noProductionReplayExecution.');
  assert(!JSON.stringify(review).includes('https://'), 'Review output must not include raw URLs.');
}

function assertEmptyReviewIsNonFatalWhenAllowed() {
  const review = JSON.parse(runNode([
    REVIEW_SCRIPT,
    '--input-dir',
    'manual-artifacts/transport-shock-confirmation-factor/nonexistent-real-event-samples',
    '--allow-empty',
    '--no-output',
    '--json'
  ]));
  assert(review.status === 'empty', 'Empty allowed review should return empty.');
  assert(review.scoreWriteApproved === false, 'Empty review must not approve score write.');
  assert(review.productionWriteApproved === false, 'Empty review must not approve production write.');
  assert(review.scoreIntegrationApproved === false, 'Empty review must explicitly deny score integration.');
  assert(review.routeFreightConfirmation === 'not_connected', 'Empty review must explicitly keep route disconnected.');
  assert(review.marketConfirmation === 'not_connected', 'Empty review must explicitly keep market disconnected.');
  assert(review.falsePositiveRate === null && review.knownDisruptionDirectionalHitRate === null, 'Empty review rates must be unavailable, not zero or perfect.');
  assert(Array.isArray(review.samples) && review.samples.length === 0, 'Empty review must include an empty samples array.');
  return review;
}

function assertManifestHandoffAndGateBoundaries(emptyReview) {
  const root = absolute('manual-artifacts/transport-shock-confirmation-factor');
  fs.mkdirSync(root, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(root, 'check-manifest-handoff-'));
  const reviewPath = path.join(tempDir, 'review.json');
  const gateScript = 'scripts/review-transport-shock-confirmation-factor-free-proxy-score-readiness-gate.mjs';
  const gateFor = (review) => {
    fs.writeFileSync(reviewPath, JSON.stringify(review));
    return JSON.parse(runNode([gateScript, '--input', reviewPath, '--no-output', '--json']));
  };
  try {
    const emptyGate = gateFor(emptyReview);
    const ids = emptyGate.blockers.map((row) => row.id);
    assert(!emptyGate.gatePassed, 'Empty input must not pass the gate.');
    assert(ids.includes('real_event_sample_count_below_threshold'), 'Empty input must identify the real missing-sample blocker.');
    for (const id of ['input_score_integration_approved_claimed', 'route_freight_confirmation_connected', 'market_confirmation_connected']) {
      assert(!ids.includes(id), `Empty input must not invent a forbidden claim: ${id}`);
    }
    for (const [key, value, id] of [
      ['scoreIntegrationApproved', true, 'input_score_integration_approved_claimed'],
      ['routeFreightConfirmation', 'connected', 'route_freight_confirmation_connected'],
      ['marketConfirmation', 'connected', 'market_confirmation_connected']
    ]) {
      const gate = gateFor({ ...emptyReview, [key]: value });
      assert(!gate.gatePassed && gate.blockers.some((row) => row.id === id), `Actual forbidden ${key} must still block.`);
    }
    const review = JSON.parse(runNode([REVIEW_SCRIPT, '--manifest', DEFAULT_MANIFEST_PATH,
      '--min-samples', '6', '--min-known-disruption-samples', '3', '--min-zero-control-samples', '3', '--strict', '--no-output', '--json']));
    assert(review.evidenceInputMode === 'reviewed_manifest_metadata_only', 'Manifest must be explicit and isolated from ignored archives.');
    assert(review.contributionBasis === 'manual_review_not_model_backtest', 'Manifest statistics must not claim model backtest evidence.');
    const gate = gateFor(review);
    assert(gate.gatePassed && gate.observed.usableSampleCount >= 6, 'Reviewed manifest must survive a checkout without local archives.');
    assert(gate.scoreReadinessApproved === false && gate.scoreIntegrationApproved === false && gate.historicalBacktestPerformed === false, 'Passing metadata gate must not confer approval or backtest claims.');
    for (const args of [['--input', INTAKE_FIXTURE], ['--input-dir', 'manual-artifacts/transport-shock-confirmation-factor'], ['--allow-empty']]) {
      let refused = false;
      try { runNode([REVIEW_SCRIPT, '--manifest', DEFAULT_MANIFEST_PATH, ...args, '--no-output']); } catch { refused = true; }
      assert(refused, 'Manifest mode must reject mixed inputs and allow-empty.');
    }
  } finally {
    // Only the freshly created, bounded test directory is removed.
    assert(path.dirname(tempDir) === root, 'Temporary cleanup path escaped the test root.');
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains real-event samples review marker and may have been wired too early: ${marker}`);
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
    'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples-review-v1',
    'real_event_sample_set_review_ready_keep_no_score_write',
    'historicalBacktestPerformed=false'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy historical replay real-event sample-set review'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing real-event sample-set review marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy historical replay real-event sample-set review'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing real-event sample-set review boundary.');
  assert(packageJson.scripts['review:transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples'], 'package.json missing real-event samples review script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples-review'], 'package.json missing real-event samples review checker.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples-review'), 'check-suite missing real-event samples review checker.');
}

function main() {
  assertReviewScriptSafety();
  assertFixture();
  assertReviewOutput();
  assertManifestHandoffAndGateBoundaries(assertEmptyReviewIsNonFatalWhenAllowed());
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy historical replay real-event samples review: PASS');
}

main();
