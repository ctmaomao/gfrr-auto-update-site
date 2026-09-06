import { assertIncludes } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BRIEF_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_THEMATIC_CARD_BRIEF.md';
const BRIEF_FIXTURE = 'docs/fixtures/route-level-tanker-freight-thematic-card-brief-v1.json';

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
  'route-level-tanker-freight-thematic-card-brief-v1',
  'route_level_tanker_freight_thematic_card_brief',
  'c1-route-tanker-freight',
  'Route Tanker Freight'
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

function assertBriefDoc() {
  assert(fs.existsSync(absolute(BRIEF_DOC)), 'Thematic card brief doc is missing.');
  const doc = readText(BRIEF_DOC);
  for (const marker of [
    'Docs-only thematic-card brief',
    'C1 通胀与能源 / INFLATION & ENERGY',
    '#macro-thematic-cards',
    'c1-route-tanker-freight',
    'currentExpectedThematicCardCount',
    'check:thematic-card-ia',
    'frontend asset version',
    'productionWriteApproved=false',
    'frontendImplementationApproved=false',
    'does not authorize a thematic card'
  ]) {
    assertIncludes(doc, marker, BRIEF_DOC);
  }
}

function assertBriefFixture() {
  assert(fs.existsSync(absolute(BRIEF_FIXTURE)), 'Thematic card brief fixture is missing.');
  const fixture = JSON.parse(readText(BRIEF_FIXTURE));
  assert(fixture.contractVersion === 'route-level-tanker-freight-thematic-card-brief-v1', 'Unexpected contractVersion.');
  assert(fixture.kind === 'route_level_tanker_freight_thematic_card_brief', 'Unexpected kind.');
  assert(fixture.status === 'docs_only_no_frontend_implementation', 'Brief must stay docs-only.');
  assert(fixture.targetSection === '#macro-thematic-cards', 'Unexpected targetSection.');
  assert(fixture.targetThemeBlock === 'C1 通胀与能源 / INFLATION & ENERGY', 'Unexpected targetThemeBlock.');
  assert(fixture.proposedCardId === 'c1-route-tanker-freight', 'Unexpected proposedCardId.');
  assert(fixture.currentExpectedThematicCardCount === 52, 'Current thematic card count must remain 52 in this brief.');
  assert(fixture.futureExpectedThematicCardCount === 53, 'Future thematic card count must be 53 after route-level tanker freight implementation.');
  assert(fixture.futureCardCountDelta === 1, 'Future card count delta must be 1.');
  assert(fixture.currentProductionState?.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(fixture.currentProductionState?.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(fixture.currentProductionState?.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(fixture.currentProductionState?.productionWriteApproved === false, 'productionWriteApproved must stay false.');
  assert(fixture.currentProductionState?.frontendImplementationApproved === false, 'frontendImplementationApproved must stay false.');
  assert(fixture.requiredFutureProductionField === 'radarData.macroDrivers.energyTransport.routeFreightConfirmation', 'Unexpected required future field.');
  for (const [key, value] of Object.entries(fixture.approvalState || {})) {
    assert(value === false, `approvalState.${key} must be false.`);
  }
  for (const [key, value] of Object.entries(fixture.boundaries || {})) {
    assert(value === true, `boundaries.${key} must be true.`);
  }
  for (const marker of [
    'production_writer_contract_design',
    'source_rights_manual_approval',
    'production_display_field',
    'thematic_card_dom_update',
    'render_macro_overview_update',
    'thematic_card_ia_count_update',
    'frontend_asset_version_bump'
  ]) {
    assert(fixture.futureImplementationRequires.includes(marker), `Missing future implementation requirement: ${marker}`);
  }
}

function assertFrontendRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains thematic-card-brief marker and may have been wired: ${marker}`);
    }
  }
  const thematicChecker = readText('scripts/check-thematic-card-ia.mjs');
  assert(thematicChecker.includes('expectedCardCount = 52'), 'Thematic card count must stay 52 until route-level tanker freight frontend implementation.');
}

function assertProductionDataRemainsUnwired() {
  const radarText = readText('data/radar-data.json');
  for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
    assert(!radarText.includes(marker), `data/radar-data.json contains thematic-card-brief marker: ${marker}`);
  }
  const radar = JSON.parse(radarText);
  const candidate = radar?.macroDrivers?.energyTransport?.transportShockCandidate;
  if (candidate) {
    assert(candidate.routeFreightConfirmation === 'not_connected', 'Production transportShockCandidate.routeFreightConfirmation must stay not_connected.');
    assert(candidate.marketConfirmation === 'not_connected', 'Production transportShockCandidate.marketConfirmation must stay not_connected.');
  }
  assert(!radar?.macroDrivers?.energyTransport?.routeFreightConfirmation, 'Production routeFreightConfirmation field is not approved yet.');
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

  assertIncludes(index, 'ROUTE_LEVEL_TANKER_FREIGHT_THEMATIC_CARD_BRIEF.md', 'docs/INDEX.md');
  for (const marker of [
    'route-level-tanker-freight-thematic-card-brief-v1',
    'Route-level tanker freight thematic card brief',
    'C1 通胀与能源',
    'no frontend implementation'
  ]) {
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
    assertIncludes(dataContract, marker, 'docs/DATA_CONTRACT.md');
  }
  assertIncludes(signalIntake, 'route-level-tanker-freight-thematic-card-brief-v1', 'docs/SIGNAL_INTAKE.md');
  assertIncludes(backlog, 'Route-level tanker freight thematic card brief', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  assertIncludes(agents, 'route-level tanker freight thematic card brief', 'docs/AGENT_DOMAIN_BOUNDARIES.md');
  assert(packageJson.scripts['check:route-level-tanker-freight-thematic-card-brief'], 'package.json missing thematic card brief check script.');
  assertIncludes(checkSuite, 'check:route-level-tanker-freight-thematic-card-brief', 'scripts/check-suite.mjs');
}

function main() {
  assertBriefDoc();
  assertBriefFixture();
  assertFrontendRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight thematic card brief: PASS');
}

main();
