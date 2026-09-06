import { assertIncludes } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DESIGN_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITER_CONTRACT_DESIGN.md';
const DESIGN_FIXTURE = 'docs/fixtures/route-level-tanker-freight-production-writer-contract-design-v1.json';

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

const RUNTIME_FORBIDDEN_MARKERS = [
  'route-level-tanker-freight-production-writer-contract-design-v1',
  'route_level_tanker_freight_production_writer_contract_design',
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

function assertDesignDoc() {
  assert(fs.existsSync(absolute(DESIGN_DOC)), 'Production writer contract design doc is missing.');
  const doc = readText(DESIGN_DOC);
  for (const marker of [
    'Production writer contract design only',
    'route-level-tanker-freight-production-writer-contract-design-v1',
    'macroDrivers.energyTransport.routeFreightConfirmation',
    'contract_design_only_no_writer',
    'confirmed is intentionally excluded',
    'productionWriteApproved=false',
    'sourceRightsStatus=manual_review_required',
    'no production data write',
    'no frontend implementation'
  ]) {
    assertIncludes(doc, marker, DESIGN_DOC);
  }
}

function assertDesignFixture() {
  assert(fs.existsSync(absolute(DESIGN_FIXTURE)), 'Production writer contract design fixture is missing.');
  const fixture = JSON.parse(readText(DESIGN_FIXTURE));
  assert(fixture.contractVersion === 'route-level-tanker-freight-production-writer-contract-design-v1', 'Unexpected contractVersion.');
  assert(fixture.kind === 'route_level_tanker_freight_production_writer_contract_design', 'Unexpected kind.');
  assert(fixture.status === 'contract_design_only_no_writer', 'Design fixture must stay contract-design-only.');
  assert(fixture.futureProductionField === 'macroDrivers.energyTransport.routeFreightConfirmation', 'Unexpected futureProductionField.');

  assert(fixture.currentProductionState?.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(fixture.currentProductionState?.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(fixture.currentProductionState?.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(fixture.currentProductionState?.productionWriteApproved === false, 'productionWriteApproved must stay false.');
  assert(fixture.currentProductionState?.sourceRightsStatus === 'manual_review_required', 'sourceRightsStatus must remain manual_review_required.');

  for (const marker of [
    'route-level-tanker-freight-production-write-readiness-v1',
    'route-level-tanker-freight-display-contract-v1',
    'route-level-tanker-freight-thematic-card-brief-v1',
    'route-level-tanker-freight-source-rights-approval-v1'
  ]) {
    assert(fixture.requiredPreWriteInputs?.includes(marker), `Missing required pre-write input: ${marker}`);
  }

  const shape = fixture.futureFieldShape || {};
  assert(shape.contractVersion === 'route-level-tanker-freight-confirmation-v1', 'Unexpected future field contractVersion.');
  assert(Array.isArray(shape.allowedStatuses), 'futureFieldShape.allowedStatuses must be an array.');
  for (const status of ['not_connected', 'watch', 'contradicted', 'stale', 'unavailable']) {
    assert(shape.allowedStatuses.includes(status), `Missing allowed status: ${status}`);
  }
  assert(!shape.allowedStatuses.includes('confirmed'), 'confirmed must remain excluded from allowed statuses.');
  assert(shape.defaultStatus === 'not_connected', 'Default status must be not_connected.');
  assert(shape.sourceMode === 'manual_review_projection', 'Initial sourceMode must be manual_review_projection.');
  assert(shape.displayOnly === true, 'future field must remain displayOnly.');
  assert(shape.auditOnly === true, 'future field must remain auditOnly.');
  assert(shape.eligibleForMainScore === false, 'future field must not be main-score eligible.');
  assert(shape.sourceRightsStatus === 'manual_review_required', 'future field source-rights status must require manual review.');
  assert(shape.staleAfterHours === 72, 'staleAfterHours must stay 72 for the initial contract.');
  assert(String(shape.limitationZh || '').includes('不确认封锁'), 'limitationZh must include no-confirmation boundary copy.');

  for (const [key, value] of Object.entries(fixture.approvalState || {})) {
    assert(value === false, `approvalState.${key} must be false.`);
  }
  for (const [key, value] of Object.entries(fixture.boundaries || {})) {
    assert(value === true, `boundaries.${key} must be true.`);
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains production writer contract marker and may have been wired: ${marker}`);
    }
  }
}

function assertProductionDataRemainsUnwired() {
  const radar = JSON.parse(readText('data/radar-data.json'));
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
  const packageJson = JSON.parse(readText('package.json'));
  const checkSuite = readText('scripts/check-suite.mjs');

  assertIncludes(index, 'ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITER_CONTRACT_DESIGN.md', 'docs/INDEX.md');
  for (const marker of [
    'route-level-tanker-freight-production-writer-contract-design-v1',
    'Route-level tanker freight production writer contract design',
    'contract_design_only_no_writer',
    'no production data write'
  ]) {
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
    assertIncludes(dataContract, marker, 'docs/DATA_CONTRACT.md');
  }
  assertIncludes(signalIntake, 'route-level-tanker-freight-production-writer-contract-design-v1', 'docs/SIGNAL_INTAKE.md');
  assertIncludes(backlog, 'Route-level tanker freight production writer contract design', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  assertIncludes(agents, 'route-level tanker freight production writer contract design', 'docs/AGENT_DOMAIN_BOUNDARIES.md');
  assert(packageJson.scripts['check:route-level-tanker-freight-production-writer-contract-design'], 'package.json missing production writer contract design check script.');
  assertIncludes(checkSuite, 'check:route-level-tanker-freight-production-writer-contract-design', 'scripts/check-suite.mjs');
}

function main() {
  assertDesignDoc();
  assertDesignFixture();
  assertRuntimeRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight production writer contract design: PASS');
}

main();
