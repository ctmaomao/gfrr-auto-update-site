import { assertIncludes } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BRIEF_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_FRONTEND_DISPLAY_BRIEF.md';
const BRIEF_FIXTURE = 'docs/fixtures/route-level-tanker-freight-frontend-display-brief-v1.json';

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

const RUNTIME_FORBIDDEN_MARKERS = [
  'route-level-tanker-freight-frontend-display-brief-v1',
  'route_level_tanker_freight_frontend_display_brief',
  'odp-route-freight-watch',
  'odp-route-freight-status',
  'odp-route-freight-state',
  'odp-route-freight-samples',
  'odp-route-freight-routes',
  'odp-route-freight-boundary'
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
  assert(fs.existsSync(absolute(BRIEF_DOC)), 'Frontend display brief doc is missing.');
  const doc = readText(BRIEF_DOC);
  for (const marker of [
    'Docs-only frontend display brief',
    'No frontend implementation is approved',
    '#oil-directional-pressure',
    'folded detail',
    'routeFreightConfirmation=not_connected',
    'marketConfirmation=not_connected',
    'eligibleForMainScore=false',
    'DESIGN.md',
    'no new jump-nav item',
    'no ODP visible reason row',
    'odp-route-freight-watch',
    'check:oil-directional-zh-copy',
    'no scoring/decision/worker/runtime change'
  ]) {
    assertIncludes(doc, marker, BRIEF_DOC);
  }
}

function assertBriefFixture() {
  assert(fs.existsSync(absolute(BRIEF_FIXTURE)), 'Frontend display brief fixture is missing.');
  const fixture = JSON.parse(readText(BRIEF_FIXTURE));
  assert(fixture.contractVersion === 'route-level-tanker-freight-frontend-display-brief-v1', 'Unexpected contractVersion.');
  assert(fixture.kind === 'route_level_tanker_freight_frontend_display_brief', 'Unexpected kind.');
  assert(fixture.status === 'docs_only_no_frontend_implementation', 'Brief fixture must stay docs-only.');
  assert(fixture.targetSurface === '#oil-directional-pressure', 'Unexpected targetSurface.');
  assert(fixture.placement === 'folded_detail_only', 'Unexpected placement.');
  assert(fixture.manualArtifactsAreBrowserInputs === false, 'Manual artifacts must not be browser inputs.');
  assert(fixture.currentProductionState?.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(fixture.currentProductionState?.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(fixture.currentProductionState?.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  for (const input of [
    'radarData.macroDrivers.energyTransport.transportShockCandidate',
    'radarData.macroDrivers.energyTransport.routeFreightConfirmation',
    'data/oil-directional-pressure.json'
  ]) {
    assert(fixture.allowedFutureInputs.includes(input), `Missing allowed future input: ${input}`);
  }
  for (const id of [
    'odp-route-freight-watch',
    'odp-route-freight-status',
    'odp-route-freight-state',
    'odp-route-freight-samples',
    'odp-route-freight-routes',
    'odp-route-freight-boundary'
  ]) {
    assert(fixture.proposedDomIds.includes(id), `Missing proposed DOM id: ${id}`);
  }
  for (const [key, value] of Object.entries(fixture.approvalState || {})) {
    assert(value === false, `approvalState.${key} must be false.`);
  }
  for (const [key, value] of Object.entries(fixture.boundaries || {})) {
    assert(value === true, `boundaries.${key} must be true.`);
  }
  for (const [key, value] of Object.entries(fixture.copyRules || {})) {
    assert(value === true, `copyRules.${key} must be true.`);
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains frontend-display-brief marker and may have been wired: ${marker}`);
    }
  }
}

function assertProductionDataRemainsUnwired() {
  const radarText = readText('data/radar-data.json');
  for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
    assert(!radarText.includes(marker), `data/radar-data.json contains frontend-display-brief marker: ${marker}`);
  }
  assert(!radarText.includes('"routeFreightConfirmationDisplay"'), 'data/radar-data.json contains unapproved routeFreightConfirmationDisplay field.');
  const radar = JSON.parse(radarText);
  const candidate = radar?.macroDrivers?.energyTransport?.transportShockCandidate;
  if (candidate) {
    assert(candidate.routeFreightConfirmation === 'not_connected', 'Production transportShockCandidate.routeFreightConfirmation must stay not_connected.');
    assert(candidate.marketConfirmation === 'not_connected', 'Production transportShockCandidate.marketConfirmation must stay not_connected.');
  }
  assert(!radar?.macroDrivers?.energyTransport?.routeFreightConfirmation, 'Production macroDrivers.energyTransport.routeFreightConfirmation is not approved yet.');
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

  assertIncludes(index, 'ROUTE_LEVEL_TANKER_FREIGHT_FRONTEND_DISPLAY_BRIEF.md', 'docs/INDEX.md');
  for (const marker of [
    'route-level-tanker-freight-frontend-display-brief-v1',
    'Route-level tanker freight frontend display brief',
    'docs-only',
    'no frontend'
  ]) {
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
    assertIncludes(dataContract, marker, 'docs/DATA_CONTRACT.md');
  }
  assertIncludes(signalIntake, 'route-level-tanker-freight-frontend-display-brief-v1', 'docs/SIGNAL_INTAKE.md');
  assertIncludes(backlog, 'Route-level tanker freight frontend display brief', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  assertIncludes(agents, 'route-level tanker freight frontend display brief', 'docs/AGENT_DOMAIN_BOUNDARIES.md');
  assert(packageJson.scripts['check:route-level-tanker-freight-frontend-display-brief'], 'package.json missing frontend display brief check script.');
  assertIncludes(checkSuite, 'check:route-level-tanker-freight-frontend-display-brief', 'scripts/check-suite.mjs');
}

function main() {
  assertBriefDoc();
  assertBriefFixture();
  assertRuntimeRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight frontend display brief: PASS');
}

main();
