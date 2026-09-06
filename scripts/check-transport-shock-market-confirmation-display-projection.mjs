import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PROJECT_SCRIPT = 'scripts/project-transport-shock-market-confirmation-display-projection.mjs';
const REVIEW_FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/market-confirmation-manual-sample-review-pass.json';

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
  'realtime/market.json',
  'market.worker-preview.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-market-confirmation-display-projection-v1',
  'project-transport-shock-market-confirmation-display-projection',
  'marketConfirmationDisplayProjection'
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
  assert(fs.existsSync(absolute(PROJECT_SCRIPT)), 'Transport shock market-confirmation display projection script is missing.');
  const source = readText(PROJECT_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Projection script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'dry-run-only Transport Shock market-confirmation display projection',
    'displayProjectionOnly',
    'notProductionData',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
    'noMarketConfirmationWrite',
    'noScoreWrite',
    'marketConfirmation',
    'not_connected',
    'eligibleForMainScore'
  ]) {
    assert(source.includes(marker), `Projection script missing required marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(REVIEW_FIXTURE)), 'Market-confirmation review fixture is missing.');
  const fixture = JSON.parse(readText(REVIEW_FIXTURE));
  assert(fixture.schemaVersion === 'transport-shock-market-confirmation-manual-sample-review-v1', 'Review fixture schemaVersion mismatch.');
  assert(fixture.status === 'dry_run_only', 'Review fixture status mismatch.');
  assert(fixture.productionWriteApproved === false, 'Review fixture must not approve production write.');
  assert(fixture.marketConfirmationWriteApproved === false, 'Review fixture must not approve marketConfirmation write.');
  assert(fixture.scoreWriteApproved === false, 'Review fixture must not approve score write.');
  assert(fixture.frontendDisplayApproved === false, 'Review fixture must not approve frontend display.');
  assert(fixture.routeFreightConfirmation === 'not_connected', 'Review fixture routeFreightConfirmation must stay not_connected.');
  assert(fixture.marketConfirmation === 'not_connected', 'Review fixture marketConfirmation must stay not_connected.');
  assert(fixture.eligibleForMainScore === false, 'Review fixture eligibleForMainScore must stay false.');
}

function assertProjectionOutput() {
  const stdout = runNode([
    PROJECT_SCRIPT,
    '--input',
    REVIEW_FIXTURE,
    '--no-output',
    '--json',
    '--strict'
  ]);
  const projection = JSON.parse(stdout);
  assert(projection.schemaVersion === 'transport-shock-market-confirmation-display-projection-v1', 'Unexpected projection schemaVersion.');
  assert(projection.status === 'dry_run_only', 'Projection must stay dry_run_only.');
  assert(
    projection.projectionState === 'manual_market_confirmation_review_ready_non_production',
    'Unexpected projection state.'
  );
  assert(projection.recommendation === 'ready_for_human_display_design_review_keep_non_production', 'Unexpected recommendation.');
  assert(projection.sourceMode === 'market_confirmation_manual_sample_review_dry_run', 'Unexpected sourceMode.');
  assert(projection.displayCandidate.futureThematicBlock === 'C1 通胀与能源', 'Unexpected future thematic block.');
  assert(projection.displayCandidate.directDisplayApproved === false, 'Projection must not approve direct display.');
  assert(projection.displayCandidate.frontendImplementationApproved === false, 'Projection must not approve frontend implementation.');
  assert(projection.displayCandidate.rawSourceTextDisplayed === false, 'Projection must not display raw source text.');
  assert(projection.displayCandidate.acceptedObservationCount === 4, 'Expected four accepted observations.');
  assert(projection.displayCandidate.bucketCoverage.brent_price_structure_confirmation === 2, 'Expected Brent price-structure coverage.');
  assert(projection.displayCandidate.bucketCoverage.oil_news_market_reaction_confirmation === 1, 'Expected Oil News market-reaction coverage.');
  assert(projection.displayCandidate.bucketCoverage.odp_market_stress_context === 1, 'Expected ODP market-stress coverage.');
  assert(projection.currentProductionState.transportShockConfirmationFactor === 'not_connected', 'Factor must remain not_connected.');
  assert(projection.currentProductionState.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must remain not_connected.');
  assert(projection.currentProductionState.marketConfirmation === 'not_connected', 'marketConfirmation must remain not_connected.');
  assert(projection.currentProductionState.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  for (const [key, value] of Object.entries(projection.approvals || {})) {
    assert(value === false, `approvals.${key} must be false.`);
  }
  for (const [key, value] of Object.entries(projection.productionImpact || {})) {
    assert(value === false, `productionImpact.${key} must be false.`);
  }
  assert(projection.boundaries.noNetworkCall === true, 'Projection must lock noNetworkCall.');
  assert(projection.boundaries.noProductionWrite === true, 'Projection must lock noProductionWrite.');
  assert(projection.boundaries.noMarketConfirmationWrite === true, 'Projection must lock noMarketConfirmationWrite.');
  assert(projection.boundaries.noScoreWrite === true, 'Projection must lock noScoreWrite.');
  assert(projection.boundaries.noFrontendChange === true, 'Projection must lock noFrontendChange.');
  assert(projection.boundaries.notProductionData === true, 'Projection must mark notProductionData.');
  const serialized = JSON.stringify(projection);
  assert(!serialized.includes('sourceCitationHash'), 'Projection must not carry observation-level citation hashes.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains market-confirmation display projection marker: ${marker}`);
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
    'project:transport-shock-market-confirmation-display-projection',
    'transport-shock-market-confirmation-display-projection-v1',
    'manual_market_confirmation_review_ready_non_production',
    'no marketConfirmation write',
    'no score write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'transport-shock-market-confirmation-display-projection-v1',
    'manual_market_confirmation_review_ready_non_production',
    'marketConfirmationWriteApproved=false',
    'eligibleForMainScore=false'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-market-confirmation-display-projection-v1'), 'SIGNAL_INTAKE missing market display projection marker.');
  assert(backlog.includes('Transport Shock Confirmation Factor market-confirmation display projection'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing market display projection marker.');
  assert(agents.includes('Transport Shock Confirmation Factor market-confirmation display projection'), 'AGENTS missing market display projection boundary.');
  assert(packageJson.scripts['project:transport-shock-market-confirmation-display-projection'], 'package.json missing projection script.');
  assert(packageJson.scripts['check:transport-shock-market-confirmation-display-projection'], 'package.json missing projection check.');
  assert(checkSuite.includes('check:transport-shock-market-confirmation-display-projection'), 'check-suite missing market projection check.');
}

function main() {
  assertScriptSafety();
  assertFixture();
  assertProjectionOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock market-confirmation display projection: PASS');
}

main();
