import { runNode } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const READINESS_SCRIPT = 'scripts/review-route-level-tanker-freight-production-write-readiness.mjs';
const PROJECTION_REVIEW_FIXTURE = 'docs/fixtures/route-level-tanker-freight/production-display-projection-review-pass.json';
const DISPLAY_CONTRACT_FIXTURE = 'docs/fixtures/route-level-tanker-freight-display-contract-v1.json';
const FRONTEND_BRIEF_FIXTURE = 'docs/fixtures/route-level-tanker-freight-frontend-display-brief-v1.json';

const RUNTIME_FILES = [
  'index.html',
  'assets/styles.css',
  'scripts/app.js',
  'scripts/modules/renderOilDirectional.js',
  'scripts/modules/renderMacroOverview.js',
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
  'data/radar-data.json',
  'realtime/market.json',
  'market.worker-preview.json'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'route-level-tanker-freight-production-write-readiness-v1',
  'review-route-level-tanker-freight-production-write-readiness',
  'ready_for_separate_production_write_design_keep_non_production'
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
  assert(fs.existsSync(absolute(READINESS_SCRIPT)), 'Production write readiness script is missing.');
  const source = readText(READINESS_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `Production write readiness script contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'manual/local route-level tanker freight production write readiness gate only',
    'outputOnlyToManualArtifacts',
    'noNetworkCall',
    'noEnvironmentRead',
    'noProductionWrite',
    'notProductionData',
    'sourceRightsReadiness',
    'manual_review_required',
    'productionWriteApproved',
    'routeFreightConfirmation',
    'not_connected',
    'nextAllowedStep'
  ]) {
    assert(source.includes(marker), `Production write readiness script missing boundary marker: ${marker}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(PROJECTION_REVIEW_FIXTURE)), 'Projection review fixture is missing.');
  const fixture = JSON.parse(readText(PROJECTION_REVIEW_FIXTURE));
  assert(fixture.schemaVersion === 'route-level-tanker-freight-production-display-projection-review-v1', 'Projection review fixture schema mismatch.');
  assert(fixture.status === 'pass', 'Projection review fixture must pass.');
  assert(fixture.productionWriteApproved === false, 'Projection review fixture must not approve production write.');
  assert(fixture.productionDisplayApproved === false, 'Projection review fixture must not approve production display.');
  assert(fixture.routeFreightConfirmation === 'not_connected', 'Projection review fixture routeFreightConfirmation must stay not_connected.');
  assert(fixture.eligibleForMainScore === false, 'Projection review fixture must not be main-score eligible.');
  assert(fixture.routeCoverage.some((route) => route.bucketKey === 'hormuz_meg_crude'), 'Projection review fixture missing Hormuz crude bucket.');
  assert(fixture.routeCoverage.some((route) => route.bucketKey === 'meg_clean_products'), 'Projection review fixture missing MEG clean products bucket.');
}

function assertReadinessOutput() {
  const stdout = runNode([
    READINESS_SCRIPT,
    '--projection-review',
    PROJECTION_REVIEW_FIXTURE,
    '--display-contract',
    DISPLAY_CONTRACT_FIXTURE,
    '--frontend-brief',
    FRONTEND_BRIEF_FIXTURE,
    '--no-output',
    '--json',
    '--strict'
  ]);
  const readiness = JSON.parse(stdout);
  assert(readiness.schemaVersion === 'route-level-tanker-freight-production-write-readiness-v1', 'Unexpected readiness schemaVersion.');
  assert(readiness.status === 'pass', 'Expected readiness gate to pass for separate design readiness.');
  assert(readiness.recommendation === 'ready_for_separate_production_write_design_keep_non_production', 'Unexpected recommendation.');
  assert(readiness.readiness.projectionReview === 'pass', 'Projection review readiness must pass.');
  assert(readiness.readiness.sampleReadiness === 'pass', 'Sample readiness must pass.');
  assert(readiness.readiness.sourceRightsReadiness === 'manual_review_required', 'Source-rights readiness must remain manual_review_required.');
  assert(readiness.readiness.frontendBriefReadiness === 'pass', 'Frontend brief readiness must pass.');
  assert(readiness.readiness.productionWriterContractReadiness === 'not_started', 'Production writer contract must remain not_started.');
  assert(readiness.readiness.immediateProductionWriteReadiness === 'blocked', 'Immediate production write must stay blocked.');
  assert(readiness.nextAllowedStep === 'separate_production_writer_contract_design', 'Unexpected nextAllowedStep.');
  assert(readiness.currentProductionState.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(readiness.currentProductionState.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(readiness.currentProductionState.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  for (const [key, value] of Object.entries(readiness.approvals || {})) {
    assert(value === false, `approvals.${key} must be false.`);
  }
  for (const [key, value] of Object.entries(readiness.productionImpact || {})) {
    assert(value === false, `productionImpact.${key} must be false.`);
  }
  for (const [key, value] of Object.entries(readiness.boundaries || {})) {
    assert(value === true, `boundaries.${key} must be true.`);
  }
  for (const blocker of [
    'source_rights_and_redistribution_not_approved',
    'production_writer_contract_not_reviewed',
    'production_write_workflow_not_approved'
  ]) {
    assert(readiness.blockersForImmediateProductionWrite.includes(blocker), `Missing production-write blocker: ${blocker}`);
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains production-write-readiness marker and may have been wired: ${marker}`);
    }
  }
  const radarData = readText('data/radar-data.json');
  for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
    assert(!radarData.includes(marker), `data/radar-data.json contains production-write-readiness marker: ${marker}`);
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

  assert(index.includes('ROUTE_LEVEL_TANKER_FREIGHT_PRODUCTION_WRITE_READINESS.md'), 'docs/INDEX missing production write readiness doc.');
  for (const marker of [
    'route-level-tanker-freight-production-write-readiness-v1',
    'Route-level tanker freight production write readiness',
    'source-rights',
    'no production write'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('route-level-tanker-freight-production-write-readiness-v1'), 'SIGNAL_INTAKE missing production write readiness marker.');
  assert(backlog.includes('Route-level tanker freight production write readiness'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing production write readiness marker.');
  assert(agents.includes('route-level tanker freight production write readiness'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing production write readiness boundary.');
  assert(packageJson.scripts['review:route-level-tanker-freight-production-write-readiness'], 'package.json missing production write readiness review script.');
  assert(packageJson.scripts['check:route-level-tanker-freight-production-write-readiness'], 'package.json missing production write readiness check script.');
  assert(checkSuite.includes('check:route-level-tanker-freight-production-write-readiness'), 'check-suite missing production write readiness check.');
}

function main() {
  assertScriptSafety();
  assertFixture();
  assertReadinessOutput();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight production write readiness: PASS');
}

main();
