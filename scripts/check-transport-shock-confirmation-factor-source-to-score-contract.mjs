import { assertIncludes } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOC = 'docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_TO_SCORE_CONTRACT.md';
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor-source-to-score-contract-v1.json';

const RUNTIME_FILES = [
  'index.html',
  'scripts/app.js',
  'scripts/modules/renderOilDirectional.js',
  'scripts/modules/renderMacroOverview.js',
  'scripts/run-daily-pipeline.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js'
];

const REQUIRED_BASKETS = new Set([
  'portwatch_chokepoint_physical_proxy',
  'stockq_aggregate_tanker_freight_proxy',
  'free_route_linked_wet_freight_proxy',
  'baltic_weekly_tanker_report_route_text',
  'oil_news_event_watch',
  'odp_market_confirmation',
  'oil_thermal_facility_confirmation'
]);

const REQUIRED_WORKSTREAMS = new Set([
  'free_route_linked_tanker_transport_pressure_proxy',
  'baltic_weekly_tanker_report_public_route_signal'
]);

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-confirmation-factor-source-to-score-contract-v1',
  'transport_shock_confirmation_factor_source_to_score_contract',
  'transportShockConfirmationFactor',
  'free_route_linked_tanker_transport_pressure_proxy',
  'baltic_weekly_tanker_report_public_route_signal'
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
  assert(fs.existsSync(absolute(DOC)), 'Transport shock confirmation factor contract doc is missing.');
  const doc = readText(DOC);
  for (const marker of [
    'Transport Shock Confirmation Factor',
    'transport-shock-confirmation-factor-source-to-score-contract-v1',
    'Contract only',
    'Free Route-Linked Tanker Transport Pressure Proxy',
    'Baltic Weekly Tanker Report Public Route Signal',
    'IMF PortWatch',
    'StockQ BDTI',
    'Solactive wet freight futures index',
    'CME / ICE TD3C',
    'Baltic Weekly Tanker Report',
    'P-score-3 shadow score builder',
    'P-score-8 low-weight ODP integration review',
    'It must not reuse ODP `finalBias` as an input',
    'no ODP `finalBias` change',
    '5%-8% maximum contribution'
  ]) {
    assertIncludes(doc, marker, DOC);
  }
  for (const forbidden of [
    'shadow score is approved',
    'production scoring approved',
    'route assessment scraping approved',
    'ODP finalBias now includes'
  ]) {
    assert(!doc.includes(forbidden), `${DOC} contains forbidden approval claim: ${forbidden}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'Transport shock confirmation factor fixture is missing.');
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.contractVersion === 'transport-shock-confirmation-factor-source-to-score-contract-v1', 'Unexpected contractVersion.');
  assert(fixture.kind === 'transport_shock_confirmation_factor_source_to_score_contract', 'Unexpected kind.');
  assert(fixture.status === 'contract_only_no_shadow_score', 'Fixture must remain contract-only.');
  assert(fixture.futureFactorKey === 'transportShockConfirmationFactor', 'Unexpected futureFactorKey.');

  const production = fixture.currentProductionState || {};
  for (const field of [
    'factorConnected',
    'shadowScoreGenerated',
    'frontendCardImplemented',
    'odpCandidateOverlayConnected',
    'odpFinalBiasAffected',
    'eligibleForMainScore'
  ]) {
    assert(production[field] === false, `currentProductionState.${field} must be false.`);
  }
  assert(production.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');

  const subsequentAuthorization = fixture.subsequentRuntimeScoringAuthorization || {};
  assert(subsequentAuthorization.runtimeScoringAuthorized === true, 'subsequentRuntimeScoringAuthorization.runtimeScoringAuthorized must be true.');
  assert(
    subsequentAuthorization.authorizationSchemaVersion === 'transport-shock-confirmation-factor-runtime-scoring-migration-authorization-v1',
    'subsequentRuntimeScoringAuthorization.authorizationSchemaVersion mismatch.'
  );
  assert(subsequentAuthorization.approvedRuntimeSourcePath === 'macroDrivers.energyTransport.transportShockCandidate', 'subsequent runtime source path mismatch.');
  assert(subsequentAuthorization.maxContributionPct === 3, 'subsequent runtime maxContributionPct must be 3.');
  assert(subsequentAuthorization.routeFreightConfirmationStillNotConnected === true, 'route freight must remain disconnected under subsequent authorization.');
  assert(subsequentAuthorization.odpFinalBiasStillUnaffected === true, 'ODP finalBias must remain unaffected under subsequent authorization.');

  assert(Array.isArray(fixture.candidateInputBaskets), 'candidateInputBaskets must be an array.');
  const baskets = new Set(fixture.candidateInputBaskets.map((basket) => basket.basketKey));
  for (const basketKey of REQUIRED_BASKETS) {
    assert(baskets.has(basketKey), `Missing candidate input basket: ${basketKey}`);
  }
  const weightTotal = fixture.candidateInputBaskets.reduce((sum, basket) => sum + Number(basket.targetWeightPct), 0);
  assert(weightTotal === 100, `targetWeightPct total must equal 100, got ${weightTotal}.`);
  for (const basket of fixture.candidateInputBaskets) {
    assert(basket.newLiveFetchApprovedByThisContract === false, `${basket.basketKey}.newLiveFetchApprovedByThisContract must be false.`);
    assert(basket.productionScoringApprovedByThisContract === false, `${basket.basketKey}.productionScoringApprovedByThisContract must be false.`);
  }

  assert(Array.isArray(fixture.newDataWorkstreams), 'newDataWorkstreams must be an array.');
  const workstreams = new Set(fixture.newDataWorkstreams.map((workstream) => workstream.workstreamKey));
  for (const workstreamKey of REQUIRED_WORKSTREAMS) {
    assert(workstreams.has(workstreamKey), `Missing new data workstream: ${workstreamKey}`);
  }
  for (const workstream of fixture.newDataWorkstreams) {
    assert(workstream.status === 'source_review_pending', `${workstream.workstreamKey}.status must be source_review_pending.`);
    assert(workstream.liveFetchApprovedByThisContract === false, `${workstream.workstreamKey}.liveFetchApprovedByThisContract must be false.`);
    assert(workstream.productionWriteApprovedByThisContract === false, `${workstream.workstreamKey}.productionWriteApprovedByThisContract must be false.`);
  }

  assert(Array.isArray(fixture.promotionPath), 'promotionPath must be an array.');
  assert(fixture.promotionPath[0] === 'P-score-1 source-to-score contract', 'promotionPath must start with P-score-1.');
  assert(fixture.promotionPath.includes('P-score-8 low-weight ODP integration review'), 'promotionPath must include P-score-8.');

  const guardrails = fixture.minimumGuardrailsBeforeOdpImpact || {};
  for (const [key, value] of Object.entries(guardrails)) {
    if (key === 'maxInitialOdpContributionPct') {
      assert(value <= 8, 'maxInitialOdpContributionPct must be <= 8.');
    } else {
      assert(value === true, `minimumGuardrailsBeforeOdpImpact.${key} must be true.`);
    }
  }

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
      assert(!source.includes(marker), `${relativePath} contains contract marker and may have been wired too early: ${marker}`);
    }
  }
}

function assertProductionDataRemainsUnwired() {
  const radar = JSON.parse(readText('data/radar-data.json'));
  const odp = JSON.parse(readText('data/oil-directional-pressure.json'));
  assert(!('transportShockConfirmationFactor' in radar), 'radar-data.json must not contain transportShockConfirmationFactor yet.');
  assert(!('transportShockConfirmationFactor' in odp), 'oil-directional-pressure.json must not contain transportShockConfirmationFactor yet.');
  const candidate = radar?.macroDrivers?.energyTransport?.transportShockCandidate;
  if (candidate) {
    assert(typeof candidate.eligibleForMainScore === 'boolean', 'transportShockCandidate.eligibleForMainScore must be boolean.');
    assert(candidate.routeFreightConfirmation === 'not_connected', 'transportShockCandidate.routeFreightConfirmation must remain not_connected.');
    if (candidate.eligibleForMainScore === true) {
      const impact = radar?.transportShockScoringImpact;
      assert(impact?.contractVersion === 'transport-shock-scoring-impact-v1', 'eligible transportShockCandidate requires transportShockScoringImpact contract.');
      assert(impact.runtimeScoringAuthorized === true, 'eligible transportShockCandidate requires runtimeScoringAuthorized=true.');
      assert(impact.maxContributionPct === 3, 'eligible transportShockCandidate must stay capped by +3 runtime scoring impact.');
      assert(impact.guards?.routeFreightConfirmationConnected === false, 'route freight confirmation must remain disconnected even when candidate is eligible.');
      assert(impact.guards?.marketConfirmationConnected === false, 'market confirmation must remain disconnected even when candidate is eligible.');
    }
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

  for (const marker of [
    'TRANSPORT_SHOCK_CONFIRMATION_FACTOR_SOURCE_TO_SCORE_CONTRACT.md',
    'transport-shock-confirmation-factor-source-to-score-contract-v1'
  ]) {
    assertIncludes(index, marker, 'docs/INDEX.md');
  }
  for (const marker of [
    'Transport Shock Confirmation Factor',
    'transportShockConfirmationFactor',
    'Free Route-Linked Tanker Transport Pressure Proxy',
    'Baltic Weekly Tanker Report public route-signal',
    'contract_only_no_shadow_score',
    'no ODP `finalBias`'
  ]) {
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
    assertIncludes(dataContract, marker, 'docs/DATA_CONTRACT.md');
  }
  assertIncludes(signalIntake, 'Transport Shock Confirmation Factor', 'docs/SIGNAL_INTAKE.md');
  assertIncludes(backlog, 'Transport Shock Confirmation Factor source-to-score contract', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  assertIncludes(agents, 'Transport Shock Confirmation Factor source-to-score contract', 'docs/AGENT_DOMAIN_BOUNDARIES.md');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-source-to-score-contract'], 'package.json missing transport shock contract check script.');
  assertIncludes(checkSuite, 'check:transport-shock-confirmation-factor-source-to-score-contract', 'scripts/check-suite.mjs');
}

function main() {
  assertDoc();
  assertFixture();
  assertRuntimeRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor source-to-score contract: PASS');
}

main();
