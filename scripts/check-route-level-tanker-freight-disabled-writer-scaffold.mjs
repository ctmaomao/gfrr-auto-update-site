import { assertAllFalse as allFalse, assertIncludes, readJson, runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAFFOLD_SCRIPT = 'scripts/project-route-level-tanker-freight-disabled-writer.mjs';
const SCAFFOLD_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_DISABLED_WRITER_SCAFFOLD.md';

const RUNTIME_FILES = [
  'index.html',
  'assets/styles.css',
  'scripts/app.js',
  'scripts/modules/renderMacroOverview.js',
  'scripts/modules/renderOilDirectional.js',
  'scripts/run-daily-pipeline.mjs',
  'scripts/run-realtime.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js'
];

const SCRIPT_FORBIDDEN_MARKERS = [
  'process.env',
  'fetch(',
  'https.request',
  'http.request',
  'axios',
  'node:https',
  'node:http',
  'market.worker-preview.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'route-level-tanker-freight-disabled-writer-scaffold-v1',
  'project-route-level-tanker-freight-disabled-writer',
  'disabled_no_production_write',
  'route-level-tanker-freight-confirmation-v1',
  'c1-route-tanker-freight'
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
  assert(fs.existsSync(absolute(SCAFFOLD_DOC)), 'Disabled writer scaffold doc is missing.');
  const doc = readText(SCAFFOLD_DOC);
  for (const marker of [
    'Disabled writer scaffold only',
    'route-level-tanker-freight-disabled-writer-scaffold-v1',
    'macroDrivers.energyTransport.routeFreightConfirmation.status=not_connected',
    'sourceRightsStatus=manual_review_required',
    'productionWriteAttempted=false',
    'productionWriteApproved=false',
    'disabled_scaffold_no_production_write',
    'not production data'
  ]) {
    assertIncludes(doc, marker, SCAFFOLD_DOC);
  }
}

function assertScriptSafety() {
  assert(fs.existsSync(absolute(SCAFFOLD_SCRIPT)), 'Disabled writer scaffold script is missing.');
  const source = readText(SCAFFOLD_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `${SCAFFOLD_SCRIPT} contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'disabled route-level tanker freight production writer scaffold',
    'outputOnlyToManualArtifacts',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
    'notProductionData',
    'productionWriteAttempted',
    'not_connected',
    'manual_review_required'
  ]) {
    assertIncludes(source, marker, SCAFFOLD_SCRIPT);
  }
}

function assertProjectionOutput() {
  const stdout = runNode([
    SCAFFOLD_SCRIPT,
    '--no-output',
    '--json',
    '--strict'
  ]);
  const projection = JSON.parse(stdout);
  assert(projection.schemaVersion === 'route-level-tanker-freight-disabled-writer-scaffold-v1', 'Unexpected schemaVersion.');
  assert(projection.status === 'disabled_no_production_write', 'Scaffold must remain disabled.');
  assert(projection.sourceMode === 'disabled_contract_projection', 'Unexpected sourceMode.');
  assert(projection.writeMode === 'manual_artifact_only', 'Unexpected writeMode.');
  assert(projection.futureProductionField === 'macroDrivers.energyTransport.routeFreightConfirmation', 'Unexpected futureProductionField.');
  assert(projection.productionWriteAttempted === false, 'productionWriteAttempted must be false.');
  assert(projection.productionWriteApproved === false, 'productionWriteApproved must be false.');
  assert(projection.sourceRightsStatus === 'manual_review_required', 'sourceRightsStatus must require manual review.');
  for (const blocker of [
    'source_rights_and_redistribution_not_approved',
    'no_approved_route_level_source',
    'disabled_scaffold_no_production_write'
  ]) {
    assert(projection.blockers.includes(blocker), `Missing blocker: ${blocker}`);
  }
  assert(projection.candidateField.contractVersion === 'route-level-tanker-freight-confirmation-v1', 'Unexpected candidate field contractVersion.');
  assert(projection.candidateField.status === 'not_connected', 'candidate field status must stay not_connected.');
  assert(projection.candidateField.sourceMode === 'production_source_unavailable', 'candidate field sourceMode must stay unavailable.');
  assert(projection.candidateField.displayOnly === true, 'candidate field must be displayOnly.');
  assert(projection.candidateField.auditOnly === true, 'candidate field must be auditOnly.');
  assert(projection.candidateField.eligibleForMainScore === false, 'candidate field must not be main-score eligible.');
  assert(projection.candidateField.sourceRightsStatus === 'manual_review_required', 'candidate source rights must require manual review.');
  assert(projection.currentProductionState.routeFreightConfirmation === 'not_connected', 'current routeFreightConfirmation must stay not_connected.');
  assert(projection.currentProductionState.marketConfirmation === 'not_connected', 'current marketConfirmation must stay not_connected.');
  assert(projection.currentProductionState.eligibleForMainScore === false, 'current field must not be main-score eligible.');
  allFalse(projection.approvals, 'projection.approvals');
  allFalse(projection.productionImpact, 'projection.productionImpact');
  assert(projection.boundaries.noNetworkCall === true, 'noNetworkCall boundary missing.');
  assert(projection.boundaries.noProductionWrite === true, 'noProductionWrite boundary missing.');
  assert(projection.boundaries.notProductionData === true, 'notProductionData boundary missing.');
  assert(!JSON.stringify(projection).includes('"confirmed"'), 'Disabled projection must not contain confirmed status.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains disabled-writer marker and may have been wired: ${marker}`);
    }
  }
}

function assertProductionDataRemainsUnwired() {
  const radar = readJson('data/radar-data.json');
  assert(!radar?.macroDrivers?.energyTransport?.routeFreightConfirmation, 'Production routeFreightConfirmation field is not approved yet.');
  const candidate = radar?.macroDrivers?.energyTransport?.transportShockCandidate;
  if (candidate) {
    assert(candidate.routeFreightConfirmation === 'not_connected', 'Production transportShockCandidate.routeFreightConfirmation must stay not_connected.');
    assert(candidate.marketConfirmation === 'not_connected', 'Production transportShockCandidate.marketConfirmation must stay not_connected.');
  }
}

function assertAuthorityDocs() {
  const index = readText('docs/INDEX.md');
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
  const packageJson = readJson('package.json');
  const checkSuite = readText('scripts/check-suite.mjs');

  assertIncludes(index, 'ROUTE_LEVEL_TANKER_FREIGHT_DISABLED_WRITER_SCAFFOLD.md', 'docs/INDEX.md');
  for (const marker of [
    'route-level-tanker-freight-disabled-writer-scaffold-v1',
    'Route-level tanker freight disabled writer scaffold',
    'project:route-level-tanker-freight-disabled-writer',
    'disabled_no_production_write'
  ]) {
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
    assertIncludes(dataContract, marker, 'docs/DATA_CONTRACT.md');
  }
  assertIncludes(signalIntake, 'route-level-tanker-freight-disabled-writer-scaffold-v1', 'docs/SIGNAL_INTAKE.md');
  assertIncludes(backlog, 'Route-level tanker freight disabled writer scaffold', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  assertIncludes(agents, 'route-level tanker freight disabled writer scaffold', 'docs/AGENT_DOMAIN_BOUNDARIES.md');
  assert(packageJson.scripts['project:route-level-tanker-freight-disabled-writer'], 'package.json missing disabled writer project script.');
  assert(packageJson.scripts['check:route-level-tanker-freight-disabled-writer-scaffold'], 'package.json missing disabled writer scaffold check script.');
  assertIncludes(checkSuite, 'check:route-level-tanker-freight-disabled-writer-scaffold', 'scripts/check-suite.mjs');
}

function main() {
  assertDoc();
  assertScriptSafety();
  assertProjectionOutput();
  assertRuntimeRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight disabled writer scaffold: PASS');
}

main();
