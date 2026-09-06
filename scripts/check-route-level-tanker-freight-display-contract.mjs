import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CONTRACT_FIXTURE = 'docs/fixtures/route-level-tanker-freight-display-contract-v1.json';

const RUNTIME_FILES = [
  'scripts/run-daily-pipeline.mjs',
  'scripts/run-realtime.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'scripts/modules/renderOilDirectional.js',
  'scripts/modules/renderMacroOverview.js'
];

const RUNTIME_FORBIDDEN_MARKERS = [
  'route-level-tanker-freight-display-contract-v1',
  'route_level_tanker_freight_display_only_candidate_contract',
  'manual_review_ready_non_production'
];

const PRODUCTION_DATA_FORBIDDEN_MARKERS = [
  'route-level-tanker-freight-display-contract-v1',
  'route_level_tanker_freight_display_only_candidate_contract',
  '"futureProductionFieldCandidate":"macroDrivers.energyTransport.routeFreightConfirmation"',
  '"routeFreightConfirmationDisplay"'
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

function assertContractFixture() {
  assert(fs.existsSync(absolute(CONTRACT_FIXTURE)), 'Display contract fixture is missing.');
  const contract = JSON.parse(readText(CONTRACT_FIXTURE));
  assert(contract.contractVersion === 'route-level-tanker-freight-display-contract-v1', 'Unexpected contractVersion.');
  assert(contract.kind === 'route_level_tanker_freight_display_only_candidate_contract', 'Unexpected contract kind.');
  assert(contract.status === 'contract_only_no_production_write', 'Display contract must stay contract-only.');
  assert(contract.inputReviewSchema === 'route-level-tanker-freight-manual-samples-review-v1', 'Unexpected inputReviewSchema.');
  assert(
    contract.currentProductionField === 'macroDrivers.energyTransport.transportShockCandidate.routeFreightConfirmation',
    'Unexpected currentProductionField.'
  );
  assert(
    contract.futureProductionFieldCandidate === 'macroDrivers.energyTransport.routeFreightConfirmation',
    'Unexpected futureProductionFieldCandidate.'
  );
  assert(contract.currentProductionState?.routeFreightConfirmation === 'not_connected', 'current routeFreightConfirmation must stay not_connected.');
  assert(contract.currentProductionState?.marketConfirmation === 'not_connected', 'current marketConfirmation must stay not_connected.');
  assert(contract.currentProductionState?.eligibleForMainScore === false, 'current eligibleForMainScore must stay false.');
  for (const status of [
    'unavailable',
    'insufficient_samples',
    'source_rights_unproven',
    'manual_review_ready_non_production',
    'watch',
    'contradicted'
  ]) {
    assert(contract.candidateDisplayStatuses.includes(status), `Missing candidate display status: ${status}`);
  }
  assert(!contract.candidateDisplayStatuses.includes('confirmed'), 'Confirmed status is intentionally excluded until a separate production/scoring review.');
  for (const [key, value] of Object.entries(contract.approvalState || {})) {
    assert(value === false, `approvalState.${key} must be false.`);
  }
  for (const [key, value] of Object.entries(contract.boundaries || {})) {
    assert(value === true, `boundaries.${key} must be true.`);
  }
  assert(contract.minimumExitCriteriaBeforeAnyProductionWrite.length >= 6, 'Exit criteria list is too thin.');
  assert(contract.displayRules?.doNotConfirmBlockadeOrSupplyCut === true, 'Display rule must block blockade/supply-cut confirmation claims.');
  assert(contract.displayRules?.doNotClaimOilPriceForecast === true, 'Display rule must block oil-price forecast claims.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains display-contract marker and may have been wired: ${marker}`);
    }
  }
}

function assertProductionDataRemainsUnwired() {
  const radarData = readText('data/radar-data.json');
  const compact = radarData.replace(/\s+/g, '');
  for (const marker of PRODUCTION_DATA_FORBIDDEN_MARKERS) {
    assert(!compact.includes(marker), `data/radar-data.json contains display-contract marker: ${marker}`);
  }
  const data = JSON.parse(radarData);
  const candidate = data?.macroDrivers?.energyTransport?.transportShockCandidate;
  if (candidate) {
    assert(candidate.routeFreightConfirmation === 'not_connected', 'Production transportShockCandidate.routeFreightConfirmation must stay not_connected.');
    assert(candidate.marketConfirmation === 'not_connected', 'Production transportShockCandidate.marketConfirmation must stay not_connected.');
  }
  assert(!data?.macroDrivers?.energyTransport?.routeFreightConfirmation, 'Production macroDrivers.energyTransport.routeFreightConfirmation is not approved yet.');
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
    'route-level-tanker-freight-display-contract-v1',
    'display-only candidate contract',
    'contract_only_no_production_write',
    'routeFreightConfirmation'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('route-level-tanker-freight-display-contract-v1'), 'SIGNAL_INTAKE missing display contract marker.');
  assert(backlog.includes('Route-level tanker freight display-only candidate contract'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing display contract marker.');
  assert(agents.includes('route-level tanker freight display-only candidate contract'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing display contract boundary.');
  assert(packageJson.scripts['check:route-level-tanker-freight-display-contract'], 'package.json missing display contract check script.');
  assert(checkSuite.includes('check:route-level-tanker-freight-display-contract'), 'check-suite missing display contract check.');
}

function main() {
  assertContractFixture();
  assertRuntimeRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight display contract: PASS');
}

main();
