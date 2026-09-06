import { assertIncludes } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOC = 'docs/TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_SCORE_DESIGN.md';
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor-free-proxy-score-design-v1.json';

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

const REQUIRED_FAMILIES = new Set([
  'portwatch_chokepoint_physical_proxy',
  'stockq_aggregate_tanker_freight_context',
  'oil_news_market_reaction_claims',
  'oil_thermal_facility_confirmation',
  'odp_eia_physical_anchor',
  'odp_market_confirmation_proxy'
]);

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-confirmation-factor-free-proxy-score-design-v1',
  'transport_shock_free_proxy_low_weight_score_design',
  'freeProxyScoreGenerated',
  'free_proxy_only_low_weight_candidate'
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
  assert(fs.existsSync(absolute(DOC)), 'Transport shock free-proxy score design doc is missing.');
  const doc = readText(DOC);
  for (const marker of [
    'Transport Shock Confirmation Factor Free-Proxy Score Design',
    'transport-shock-confirmation-factor-free-proxy-score-design-v1',
    'design_only_no_score_write',
    'Free-Proxy-Only Principle',
    'Maximum future main-score contribution: `3%`',
    'News-only contribution: `0%`',
    'Stale PortWatch contribution: `0%`',
    'no scoring write',
    'does not approve scoring',
    'ODP `finalBias`',
    'Global Risk Heatmap',
    'cross-validation'
  ]) {
    assertIncludes(doc, marker, DOC);
  }
  for (const forbidden of [
    'score write approved',
    'main-score is now connected',
    'ODP finalBias now includes',
    'scraping approved'
  ]) {
    assert(!doc.includes(forbidden), `${DOC} contains forbidden approval claim: ${forbidden}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'Transport shock free-proxy score design fixture is missing.');
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.contractVersion === 'transport-shock-confirmation-factor-free-proxy-score-design-v1', 'Unexpected contractVersion.');
  assert(fixture.kind === 'transport_shock_free_proxy_low_weight_score_design', 'Unexpected kind.');
  assert(fixture.status === 'design_only_no_score_write', 'Fixture must stay design-only.');
  assert(fixture.futureMode === 'free_proxy_only_low_weight_candidate', 'Unexpected future mode.');

  const production = fixture.currentProductionState || {};
  for (const field of [
    'freeProxyScoreGenerated',
    'productionScoreWritten',
    'mainScoreAffected',
    'odpFinalBiasAffected',
    'eligibleForMainScore'
  ]) {
    assert(production[field] === false, `currentProductionState.${field} must be false.`);
  }
  assert(production.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(production.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');

  const cap = fixture.scoreCap || {};
  assert(cap.maxFutureMainScoreContributionPct <= 3, 'Free-proxy main score cap must be <= 3%.');
  assert(cap.newsOnlyContributionPct === 0, 'News-only contribution must be 0%.');
  assert(cap.singleChokepointOnlyContributionPct === 0, 'Single chokepoint-only contribution must be 0%.');
  assert(cap.stalePortWatchContributionPct === 0, 'Stale PortWatch contribution must be 0%.');

  assert(Array.isArray(fixture.eligibleFreeProxyFamilies), 'eligibleFreeProxyFamilies must be an array.');
  const families = new Set(fixture.eligibleFreeProxyFamilies.map((family) => family.familyKey));
  for (const familyKey of REQUIRED_FAMILIES) {
    assert(families.has(familyKey), `Missing free-proxy family: ${familyKey}`);
  }
  for (const family of fixture.eligibleFreeProxyFamilies) {
    assert(family.canScoreAlone === false, `${family.familyKey}.canScoreAlone must be false.`);
    assert(family.productionScoringApprovedByThisContract === false, `${family.familyKey}.productionScoringApprovedByThisContract must be false.`);
  }

  assert(Array.isArray(fixture.excludedUntilSeparateApproval), 'excludedUntilSeparateApproval must be an array.');
  assert(fixture.excludedUntilSeparateApproval.some((item) => item.familyKey === 'baltic_td_tc_route_assessment_values'), 'Baltic route values exclusion missing.');
  for (const item of fixture.excludedUntilSeparateApproval) {
    assert(item.liveFetchApprovedByThisContract === false, `${item.familyKey}.liveFetchApprovedByThisContract must be false.`);
    assert(item.productionScoringApprovedByThisContract === false, `${item.familyKey}.productionScoringApprovedByThisContract must be false.`);
  }

  const conditions = fixture.minimumConditionsBeforeSeparateScorePr || {};
  assert(conditions.requiresPortWatchMaxAgeDays <= 7, 'requiresPortWatchMaxAgeDays must be <= 7.');
  for (const [key, value] of Object.entries(conditions)) {
    if (key === 'requiresPortWatchMaxAgeDays') continue;
    assert(value === true, `minimumConditionsBeforeSeparateScorePr.${key} must be true.`);
  }

  assert(Array.isArray(fixture.nextAllowedSteps), 'nextAllowedSteps must be an array.');
  assert(fixture.nextAllowedSteps[0] === 'P-score-20 artifact-only free-proxy score candidate projection', 'Next step must be artifact-only projection.');
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
      assert(!source.includes(marker), `${relativePath} contains free-proxy score design marker: ${marker}`);
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
    'TRANSPORT_SHOCK_CONFIRMATION_FACTOR_FREE_PROXY_SCORE_DESIGN.md',
    'transport-shock-confirmation-factor-free-proxy-score-design-v1'
  ]) {
    assertIncludes(index, marker, 'docs/INDEX.md');
  }
  for (const marker of [
    'Transport Shock Confirmation Factor free-proxy score design',
    'transport-shock-confirmation-factor-free-proxy-score-design-v1',
    'design_only_no_score_write',
    'maxFutureMainScoreContributionPct=3',
    'no score write'
  ]) {
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
  }
  for (const marker of [
    'transport-shock-confirmation-factor-free-proxy-score-design-v1',
    'free_proxy_only_low_weight_candidate',
    'eligibleForMainScore=false',
    'scoreWriteApproved=false'
  ]) {
    assertIncludes(dataContract, marker, 'docs/DATA_CONTRACT.md');
  }
  assertIncludes(signalIntake, 'P-score-19 free-proxy score design', 'docs/SIGNAL_INTAKE.md');
  assertIncludes(backlog, 'Transport Shock Confirmation Factor free-proxy score design', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  assertIncludes(agents, 'Transport Shock Confirmation Factor free-proxy score design', 'docs/AGENT_DOMAIN_BOUNDARIES.md');
  assert(packageJson.scripts['check:transport-shock-confirmation-factor-free-proxy-score-design'], 'package.json missing free-proxy score design check.');
  assertIncludes(checkSuite, 'check:transport-shock-confirmation-factor-free-proxy-score-design', 'scripts/check-suite.mjs');
}

function main() {
  assertDoc();
  assertFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock Confirmation Factor free-proxy score design: PASS');
}

main();
