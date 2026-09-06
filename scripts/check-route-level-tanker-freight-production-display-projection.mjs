import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PROJECT_SCRIPT = 'scripts/project-route-level-tanker-freight-production-display.mjs';
const SAMPLE_REVIEW = 'docs/fixtures/route-level-tanker-freight/manual-samples-review-pass.json';
const CONTRACT_FIXTURE = 'docs/fixtures/route-level-tanker-freight-display-contract-v1.json';

const RUNTIME_FILES = [
  'scripts/run-daily-pipeline.mjs',
  'scripts/run-realtime.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'scripts/modules/renderOilDirectional.js',
  'scripts/modules/renderMacroOverview.js'
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
  'realtime/market.json',
  'market.worker-preview.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'route-level-tanker-freight-production-display-projection-v1',
  'project-route-level-tanker-freight-production-display',
  'routeFreightDisplayProjection'
];

const PRODUCTION_DATA_FORBIDDEN_MARKERS = [
  'route-level-tanker-freight-production-display-projection-v1',
  'routeFreightDisplayProjection',
  'manual_review_ready_non_production'
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
  assert(fs.existsSync(absolute(PROJECT_SCRIPT)), 'Projection script is missing.');
  const source = readText(PROJECT_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Projection script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'dry-run-only route-level tanker freight production display projection',
    'outputOnlyToManualArtifacts',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
    'notProductionData',
    'routeFreightConfirmation',
    'not_connected',
    'eligibleForMainScore'
  ]) {
    assert(source.includes(marker), `Projection script missing required boundary marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(SAMPLE_REVIEW)), 'Manual samples review fixture is missing.');
  const fixture = JSON.parse(readText(SAMPLE_REVIEW));
  assert(fixture.schemaVersion === 'route-level-tanker-freight-manual-samples-review-v1', 'Manual samples review fixture schema mismatch.');
  assert(fixture.status === 'pass', 'Manual samples review fixture should be pass.');
  assert(fixture.productionWriteApproved === false, 'Manual samples review fixture must not approve production write.');
  assert(fixture.productionDisplayApproved === false, 'Manual samples review fixture must not approve production display.');
  assert(fixture.routeFreightConfirmation === 'not_connected', 'Manual samples review fixture routeFreightConfirmation must stay not_connected.');
}

function assertProjectionOutput() {
  const stdout = runNode([
    PROJECT_SCRIPT,
    '--input',
    SAMPLE_REVIEW,
    '--contract',
    CONTRACT_FIXTURE,
    '--no-output',
    '--json',
    '--strict'
  ]);
  const projection = JSON.parse(stdout);
  assert(projection.schemaVersion === 'route-level-tanker-freight-production-display-projection-v1', 'Unexpected projection schemaVersion.');
  assert(projection.status === 'dry_run_only', 'Projection must stay dry_run_only.');
  assert(projection.projectionState === 'manual_review_ready_non_production', 'Expected manual_review_ready_non_production projection state.');
  assert(projection.sourceMode === 'manual_samples_review_dry_run', 'Unexpected sourceMode.');
  assert(projection.input.sampleCount === 2, 'Expected two input samples.');
  assert(projection.input.usableSampleCount === 2, 'Expected two usable samples.');
  assert(projection.contract.contractVersion === 'route-level-tanker-freight-display-contract-v1', 'Unexpected contract version.');
  assert(projection.displayCandidate.directDisplayApproved === false, 'Projection must not approve direct display.');
  assert(projection.displayCandidate.rawHeadlineOrSourceTextDisplayed === false, 'Projection must not display raw source text.');
  assert(projection.displayCandidate.routeSummary.repeatedRouteCount === 2, 'Expected two repeated route observations.');
  assert(projection.currentProductionState.routeFreightConfirmation === 'not_connected', 'Projection current routeFreightConfirmation must stay not_connected.');
  assert(projection.currentProductionState.marketConfirmation === 'not_connected', 'Projection current marketConfirmation must stay not_connected.');
  assert(projection.currentProductionState.eligibleForMainScore === false, 'Projection must stay non-scoring.');
  for (const [key, value] of Object.entries(projection.approvals || {})) {
    assert(value === false, `approvals.${key} must be false.`);
  }
  for (const [key, value] of Object.entries(projection.productionImpact || {})) {
    assert(value === false, `productionImpact.${key} must be false.`);
  }
  assert(projection.boundaries.noNetworkCall === true, 'Projection must lock noNetworkCall.');
  assert(projection.boundaries.noProductionWrite === true, 'Projection must lock noProductionWrite.');
  assert(projection.boundaries.notProductionData === true, 'Projection must mark notProductionData.');
  const serialized = JSON.stringify(projection);
  assert(!serialized.includes('operator-provided citation'), 'Projection must not store raw citation text.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains projection marker and may have been wired: ${marker}`);
    }
  }
}

function assertProductionDataRemainsUnwired() {
  const compact = readText('data/radar-data.json').replace(/\s+/g, '');
  for (const marker of PRODUCTION_DATA_FORBIDDEN_MARKERS) {
    assert(!compact.includes(marker), `data/radar-data.json contains projection marker: ${marker}`);
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
    'project:route-level-tanker-freight-production-display',
    'route-level-tanker-freight-production-display-projection-v1',
    'production display projection',
    'dry-run-only'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('route-level-tanker-freight-production-display-projection-v1'), 'SIGNAL_INTAKE missing projection marker.');
  assert(backlog.includes('Route-level tanker freight production display projection'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing projection marker.');
  assert(agents.includes('route-level tanker freight production display projection'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing projection boundary.');
  assert(packageJson.scripts['project:route-level-tanker-freight-production-display'], 'package.json missing projection script.');
  assert(packageJson.scripts['check:route-level-tanker-freight-production-display-projection'], 'package.json missing projection check script.');
  assert(checkSuite.includes('check:route-level-tanker-freight-production-display-projection'), 'check-suite missing projection check.');
}

function main() {
  assertScriptSafety();
  assertFixture();
  assertProjectionOutput();
  assertRuntimeRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight production display projection: PASS');
}

main();
