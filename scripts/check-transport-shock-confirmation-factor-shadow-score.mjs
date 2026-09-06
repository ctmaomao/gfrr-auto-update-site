import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PROJECT_SCRIPT = 'scripts/project-transport-shock-confirmation-factor-shadow-score.mjs';
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/manual-samples-review-pass.json';

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
  'transport-shock-confirmation-factor-shadow-score-v1',
  'project-transport-shock-confirmation-factor-shadow-score',
  'shadow_score_projected_non_production',
  'transportShockConfirmationFactorShadowScore'
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
  assert(fs.existsSync(absolute(PROJECT_SCRIPT)), 'Transport shock shadow-score projection script is missing.');
  const source = readText(PROJECT_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Shadow-score script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'artifact-only Transport Shock Confirmation Factor manual route-signal shadow-score projection',
    'manual_route_signal_slice_only',
    'completeFactorScoreGenerated',
    'productionShadowScoreGenerated',
    'noNetworkCall',
    'noProductionWrite',
    'routeFreightConfirmation',
    'not_connected',
    'eligibleForMainScore'
  ]) {
    assert(source.includes(marker), `Shadow-score script missing required boundary marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'Manual samples review fixture is missing.');
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.schemaVersion === 'transport-shock-confirmation-factor-manual-samples-review-v1', 'Fixture schemaVersion mismatch.');
  assert(fixture.status === 'pass', 'Fixture must be a passing manual samples review.');
  assert(fixture.productionWriteApproved === false, 'Fixture must not approve production write.');
  assert(fixture.shadowScoreApproved === false, 'Fixture must not approve shadow score.');
  assert(fixture.routeFreightConfirmation === 'not_connected', 'Fixture routeFreightConfirmation must stay not_connected.');
  assert(fixture.marketConfirmation === 'not_connected', 'Fixture marketConfirmation must stay not_connected.');
  assert(fixture.eligibleForMainScore === false, 'Fixture eligibleForMainScore must stay false.');
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
  assert(projection.schemaVersion === 'transport-shock-confirmation-factor-shadow-score-v1', 'Unexpected projection schemaVersion.');
  assert(projection.status === 'shadow_score_projected_non_production', 'Expected non-production shadow score projection.');
  assert(projection.recommendation === 'shadow_score_projection_ready_for_manual_review_keep_non_production', 'Unexpected recommendation.');
  assert(projection.candidateShadowScore === 70, 'Expected capped candidateShadowScore of 70.');
  assert(projection.scoreCap === 70, 'Expected manual slice score cap of 70.');
  assert(projection.scoreScope === 'manual_route_signal_slice_only', 'Unexpected scoreScope.');
  assert(projection.completeFactorScoreGenerated === false, 'Projection must not claim complete factor score.');
  assert(projection.productionShadowScoreGenerated === false, 'Projection must not claim production shadow score.');
  assert(projection.promotionEligible === false, 'Projection must not be promotion eligible.');
  assert(projection.productionWriteApproved === false, 'Projection must not approve production write.');
  assert(projection.productionDisplayApproved === false, 'Projection must not approve production display.');
  assert(projection.shadowScoreApproved === false, 'Projection must not approve shadow score.');
  assert(projection.frontendDisplayApproved === false, 'Projection must not approve frontend display.');
  assert(projection.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(projection.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(projection.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(projection.candidateDirection === 'tightening_watch', 'Expected tightening_watch candidateDirection.');
  assert(projection.evidenceSummary.coveredBucketCount === 2, 'Expected both manual buckets covered.');
  assert(projection.evidenceSummary.sourceCount === 4, 'Expected four source keys covered.');
  assert(projection.productionImpact.affectsScoring === false, 'Projection must not affect scoring.');
  assert(projection.productionImpact.affectsMainJudgment === false, 'Projection must not affect main judgment.');
  assert(projection.boundaries.noNetworkCall === true, 'Projection must lock noNetworkCall.');
  assert(projection.boundaries.noProductionWrite === true, 'Projection must lock noProductionWrite.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains shadow-score marker and may have been wired too early: ${marker}`);
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
    'project:transport-shock-confirmation-factor-shadow-score',
    'transport-shock-confirmation-factor-shadow-score-v1',
    'manual_route_signal_slice_only',
    'not production data'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-confirmation-factor-shadow-score-v1',
    'shadow_score_projected_non_production',
    'productionShadowScoreGenerated=false',
    'eligibleForMainScore=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-confirmation-factor-shadow-score-v1'), 'SIGNAL_INTAKE missing shadow-score marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor shadow-score projection'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing shadow-score marker.');
  assert(agents.includes('Transport Shock Confirmation Factor shadow-score projection'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing shadow-score boundary.');
  assert(packageJson.scripts['project:transport-shock-confirmation-factor-shadow-score'], 'package.json missing projection script.');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-shadow-score'], 'package.json missing checker script.');
  assert(checkSuite.includes('check:transport-shock-confirmation-factor-shadow-score'), 'check-suite missing shadow-score check.');
}

function main() {
  assertScriptSafety();
  assertFixture();
  assertProjectionOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor shadow-score projection: PASS');
}

main();
