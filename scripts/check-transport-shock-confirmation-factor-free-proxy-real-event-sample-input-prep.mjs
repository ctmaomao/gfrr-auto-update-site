import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PREP_SCRIPT = 'scripts/prepare-transport-shock-confirmation-factor-free-proxy-real-event-sample-inputs.mjs';
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/free-proxy-score-readiness-gate-monitor-sample-targets-incomplete.json';

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
  'transport-shock-confirmation-factor-free-proxy-real-event-sample-input-prep-v1',
  'prepare:transport-shock-confirmation-factor-free-proxy-real-event-sample-inputs',
  'sample_input_prep_ready_operator_required'
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

function assertPrepScriptSafety() {
  assert(fs.existsSync(absolute(PREP_SCRIPT)), 'Real-event sample input prep script is missing.');
  const source = readText(PREP_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Real-event sample input prep script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local Transport Shock free-proxy real-event sample input prep only',
    'sample_input_prep_ready_operator_required',
    'draft_operator_input_required',
    'operatorInputRequired',
    'scoreWriteApproved: false',
    'productionDataWriteApproved: false',
    'scoreIntegrationApproved: false',
    'eligibleForMainScore: false'
  ]) {
    assert(source.includes(marker), `Real-event sample input prep script missing marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'Gate monitor fixture is missing.');
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.monitorVersion === 'transport-shock-free-proxy-score-readiness-gate-monitor-p32', 'Fixture monitorVersion mismatch.');
  assert(fixture.status === 'sample_targets_incomplete_collect_more', 'Fixture should be sample-target incomplete.');
  assert(fixture.targetGaps.realEventSamples.remaining === 5, 'Fixture should need five total real-event samples.');
  assert(fixture.targetGaps.knownDisruptionSamples.remaining === 2, 'Fixture should need two known-disruption samples.');
  assert(fixture.targetGaps.zeroControlSamples.remaining === 3, 'Fixture should need three zero-control samples.');
  assert(fixture.scoreWriteApproved === false, 'Fixture must not approve score write.');
  assert(fixture.productionDataWriteApproved === false, 'Fixture must not approve production write.');
}

function assertPrepOutput() {
  const prep = JSON.parse(runNode([
    PREP_SCRIPT,
    '--input',
    FIXTURE,
    '--dry-run',
    '--no-output',
    '--json'
  ]));
  assert(prep.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-real-event-sample-input-prep-v1', 'Unexpected prep schemaVersion.');
  assert(prep.status === 'sample_input_prep_ready_operator_required', 'Fixture should produce operator-required prep.');
  assert(prep.recommendation === 'fill_operator_templates_then_run_real_event_sample_intake', 'Unexpected prep recommendation.');
  assert(prep.templateCount === 5, 'Expected five draft templates.');
  assert(prep.templateFamilyCounts.known_disruption_tightening === 2, 'Expected two known-disruption templates.');
  assert(prep.templateFamilyCounts.headline_only_false_positive === 1, 'Expected one headline-only zero-control template.');
  assert(prep.templateFamilyCounts.single_chokepoint_noise === 1, 'Expected one single-chokepoint zero-control template.');
  assert(prep.templateFamilyCounts.stale_physical_proxy === 1, 'Expected one stale-physical zero-control template.');
  assert(prep.draftOnly === true, 'Prep must remain draft-only.');
  assert(prep.operatorInputRequired === true, 'Prep must require operator input.');
  assert(prep.scoreWriteApproved === false, 'Prep must not approve score write.');
  assert(prep.productionDataWriteApproved === false, 'Prep must not approve production write.');
  assert(prep.scoreIntegrationApproved === false, 'Prep must not approve score integration.');
  assert(prep.eligibleForMainScore === false, 'Prep must not be main-score eligible.');
  assert(prep.productionImpact.affectsScoring === false, 'Prep must not affect scoring.');
  assert(prep.productionImpact.affectsMainJudgment === false, 'Prep must not affect main judgment.');
  for (const item of prep.templates) {
    assert(item.template.schemaVersion === 'transport-shock-confirmation-factor-free-proxy-historical-replay-sample-input-v1', 'Template schema mismatch.');
    assert(item.template.sampleStatus === 'draft_operator_input_required', 'Template must remain draft/operator-required.');
    assert(item.template.operatorAttestation.realEventCandidate === false, 'Draft template must not claim real event candidate.');
    assert(item.template.operatorAttestation.sourceRightsReviewed === false, 'Draft template must not claim source rights review.');
    assert(item.template.sourceRights.liveFetchApproved === false, 'Draft template must not approve live fetch.');
    assert(item.template.sourceRights.productionWriteApproved === false, 'Draft template must not approve production write.');
    assert(item.template.sourceRights.scoreApproved === false, 'Draft template must not approve score use.');
    assert(item.template.evidence.every((row) => row.rawCitationStored === false), 'Template must not store raw citations.');
  }
  assert(!JSON.stringify(prep).includes('https://'), 'Prep output must not include raw URLs.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains real-event sample input prep marker and may have been wired too early: ${marker}`);
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
    'transport-shock-confirmation-factor-free-proxy-real-event-sample-input-prep-v1',
    'sample_input_prep_ready_operator_required',
    'scoreWriteApproved=false',
    'productionDataWriteApproved=false'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing marker: ${marker}`);
  }
  assert(backlog.includes('Transport Shock Confirmation Factor free-proxy real-event sample input prep'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing sample input prep marker.');
  assert(agents.includes('Transport Shock Confirmation Factor free-proxy real-event sample input prep'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing sample input prep boundary.');
  assert(packageJson.scripts['prepare:transport-shock-confirmation-factor-free-proxy-real-event-sample-inputs'], 'package.json missing prep script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-real-event-sample-input-prep'], 'package.json missing prep checker.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-free-proxy-real-event-sample-input-prep'), 'check-suite missing prep checker.');
}

function main() {
  assertPrepScriptSafety();
  assertFixture();
  assertPrepOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy real-event sample input prep: PASS');
}

main();
