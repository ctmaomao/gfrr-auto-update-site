import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INTAKE_SCRIPT = 'scripts/intake-transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample.mjs';
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-historical-replay-real-event-sample-intake-known-disruption.json';

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
  'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake-v1',
  'intake-transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample',
  'real_event_sample_intake_ready_keep_no_score_write'
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
  assert(fs.existsSync(absolute(INTAKE_SCRIPT)), 'Real-event sample intake script is missing.');
  const source = readText(INTAKE_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Real-event intake script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local Transport Shock free-proxy historical replay real-event sample intake/archive helper only',
    'real_event_sample_intake_ready_keep_no_score_write',
    'raw_citations_sanitized_to_hash_domain_hint',
    'productionHistoricalReplayPerformed',
    'historicalBacktestPerformed',
    'scoreWriteApproved',
    'eligibleForMainScore',
    'noProductionReplayExecution',
    'noScoreWrite'
  ]) {
    assert(source.includes(marker), `Real-event intake script missing required marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'Real-event sample intake fixture is missing.');
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-input-v1', 'Fixture schemaVersion mismatch.');
  assert(fixture.operatorAttestation.realEventCandidate === true, 'Fixture must mark realEventCandidate true.');
  assert(fixture.operatorAttestation.sourceRightsReviewed === true, 'Fixture must mark sourceRightsReviewed true.');
  assert(fixture.operatorAttestation.rawCitationStorageApproved === false, 'Fixture must not approve raw citation storage.');
  assert(fixture.operatorAttestation.productionUseApproved === false, 'Fixture must not approve production use.');
  assert(fixture.operatorAttestation.scoreUseApproved === false, 'Fixture must not approve score use.');
  assert(fixture.sourceRights.liveFetchApproved === false, 'Fixture must not approve live fetch.');
  assert(fixture.sourceRights.productionWriteApproved === false, 'Fixture must not approve production write.');
  assert(fixture.sourceRights.scoreApproved === false, 'Fixture must not approve score.');
  assert(fixture.sourceRights.redistributionApproved === false, 'Fixture must not approve redistribution.');
  assert(fixture.evidence.every((row) => row.rawCitationStored === false), 'Fixture evidence must declare rawCitationStored false.');
}

function assertIntakeOutput() {
  const stdout = runNode([
    INTAKE_SCRIPT,
    '--input',
    FIXTURE,
    '--dry-run',
    '--no-output',
    '--json'
  ]);
  const intake = JSON.parse(stdout);
  assert(intake.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake-v1', 'Unexpected intake schemaVersion.');
  assert(intake.contractVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake-manual-archive-v1', 'Unexpected intake contractVersion.');
  assert(intake.status === 'real_event_sample_intake_ready_keep_no_score_write', 'Expected real-event intake pass.');
  assert(intake.recommendation === 'archive_sanitized_review_under_manual_artifacts_keep_no_score_write', 'Unexpected intake recommendation.');
  assert(intake.output.writeAttempted === false, 'Dry-run/no-output must not attempt write.');
  assert(intake.sampleReview.status === 'sample_review_ready_keep_no_score_write', 'Sample review must be ready/no-score-write.');
  assert(intake.sampleReview.acceptedForFutureReplayDataset === true, 'Sample review must be accepted for future dataset only.');
  assert(intake.sampleReview.realEventCandidate === true, 'Sample review must retain realEventCandidate flag.');
  assert(intake.sampleReview.productionHistoricalReplayPerformed === false, 'Sample review must not claim production historical replay.');
  assert(intake.sampleReview.historicalBacktestPerformed === false, 'Sample review must not claim historical backtest.');
  assert(intake.sampleReview.scoreWriteApproved === false, 'Sample review must not approve score write.');
  assert(intake.sampleReview.productionWriteApproved === false, 'Sample review must not approve production write.');
  assert(intake.sampleReview.eligibleForMainScore === false, 'Sample review must not be eligible for main score.');
  assert(intake.sampleReview.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(intake.sampleReview.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(intake.sampleReview.review.rawCitationStored === false, 'Sample review must not store raw citation.');
  assert(intake.sampleReview.review.compactEvidence.every((row) => row.rawCitationStored === false), 'Compact evidence must not store raw citation.');
  assert(intake.productionHistoricalReplayPerformed === false, 'Intake must not claim production historical replay.');
  assert(intake.historicalBacktestPerformed === false, 'Intake must not claim historical backtest.');
  assert(intake.scoreWriteApproved === false, 'Intake must not approve score write.');
  assert(intake.productionWriteApproved === false, 'Intake must not approve production write.');
  assert(intake.eligibleForMainScore === false, 'Intake must not be eligible for main score.');
  assert(intake.productionImpact.affectsScoring === false, 'Intake must not affect scoring.');
  assert(intake.productionImpact.affectsMainJudgment === false, 'Intake must not affect main judgment.');
  assert(intake.boundaries.noNetworkCall === true, 'Intake must lock noNetworkCall.');
  assert(intake.boundaries.noProductionWrite === true, 'Intake must lock noProductionWrite.');
  assert(intake.boundaries.noScoreWrite === true, 'Intake must lock noScoreWrite.');
  assert(intake.boundaries.noProductionReplayExecution === true, 'Intake must lock noProductionReplayExecution.');
  const serializedReview = JSON.stringify({ sampleReview: intake.sampleReview, sidecar: intake.sidecar });
  assert(!serializedReview.includes('https://'), 'Archived review/sidecar output must not store raw URLs.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains real-event intake marker and may have been wired too early: ${marker}`);
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
    'transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake-v1',
    'real_event_sample_intake_ready_keep_no_score_write',
    'historicalBacktestPerformed=false'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy historical replay real-event sample intake'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing real-event intake marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy historical replay real-event sample intake'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing real-event intake boundary.');
  assert(packageJson.scripts['intake:transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample'], 'package.json missing real-event intake script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake'], 'package.json missing real-event intake checker.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake'), 'check-suite missing real-event intake checker.');
}

function main() {
  assertScriptSafety();
  assertFixture();
  assertIntakeOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy historical replay real-event sample intake: PASS');
}

main();
