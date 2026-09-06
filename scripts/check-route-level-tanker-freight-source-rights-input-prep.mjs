import { assertIncludes, readJson } from './lib/check-script-helpers.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PREP_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_INPUT_PREP.md';
const PREP_SCRIPT = 'scripts/prepare-route-level-tanker-freight-source-rights-input.mjs';
const TEMPLATE_FIXTURE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-template-v1.json';

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
  'route-level-tanker-freight-source-rights-input-v1',
  'prepare-route-level-tanker-freight-source-rights-input',
  'draft_manual_input_no_approval',
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

function assertAllFalse(record, label) {
  for (const [key, value] of Object.entries(record || {})) {
    assert(value === false, `${label}.${key} must be false.`);
  }
}

function assertAllTrue(record, label) {
  for (const [key, value] of Object.entries(record || {})) {
    assert(value === true, `${label}.${key} must be true.`);
  }
}

function runPrepFixture() {
  const result = spawnSync(process.execPath, [
    PREP_SCRIPT,
    '--template',
    TEMPLATE_FIXTURE,
    '--source-key',
    'fixture_candidate_source',
    '--no-output',
    '--json'
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`source-rights input prep fixture run failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function assertDoc() {
  assert(fs.existsSync(absolute(PREP_DOC)), 'Source-rights input prep doc is missing.');
  const doc = readText(PREP_DOC);
  for (const marker of [
    'Manual input prep only',
    'route-level-tanker-freight-source-rights-input-v1',
    'prepare:route-level-tanker-freight-source-rights-input',
    'manual-artifacts/route-level-tanker-freight/source-rights-input.json',
    'sourceApproved=false',
    'productionWriteApproved=false',
    'sourceRightsStatus=manual_review_required'
  ]) {
    assertIncludes(doc, marker, PREP_DOC);
  }
}

function assertScriptSafety() {
  assert(fs.existsSync(absolute(PREP_SCRIPT)), 'Source-rights input prep script is missing.');
  const source = readText(PREP_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `${PREP_SCRIPT} contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'route-level-tanker-freight-source-rights-input-v1',
    'manual/local route-level tanker freight source-rights input prep only',
    'draft_manual_input_no_approval',
    'manual-artifacts/route-level-tanker-freight/source-rights-input.json',
    'productionWriteApproved',
    'not_connected'
  ]) {
    assertIncludes(source, marker, PREP_SCRIPT);
  }
}

function assertPreparedDraft() {
  const draft = runPrepFixture();
  assert(draft.schemaVersion === 'route-level-tanker-freight-source-rights-input-v1', 'Unexpected draft schemaVersion.');
  assert(draft.status === 'draft_manual_input_no_approval', 'Draft must stay no-approval.');
  assert(draft.fixtureOnly === false, 'Prepared draft must not be fixtureOnly.');
  assert(draft.sourceKey === 'fixture_candidate_source', 'Prepared sourceKey mismatch.');
  assert(draft.futureProductionField === 'macroDrivers.energyTransport.routeFreightConfirmation', 'Future production field mismatch.');
  assert(draft.approvalClaims.sourceApproved === false, 'Draft must not approve source.');
  assert(draft.approvalClaims.liveFetchApproved === false, 'Draft must not approve live fetch.');
  assert(draft.approvalClaims.productionWriteApproved === false, 'Draft must not approve production write.');
  assert(draft.approvalClaims.routeValueRedistributionApproved === false, 'Draft must not approve redistribution.');
  assert(draft.approvalClaims.sourceRightsStatus === 'manual_review_required', 'Draft sourceRightsStatus must stay manual_review_required.');
  assert(draft.currentProductionState.routeFreightConfirmation === 'not_connected', 'Draft routeFreightConfirmation must stay not_connected.');
  assert(draft.currentProductionState.eligibleForMainScore === false, 'Draft must not be main-score eligible.');
  assertAllFalse(draft.productionImpact, 'draft.productionImpact');
  assertAllTrue(draft.boundaries, 'draft.boundaries');

  const requiredKeys = Object.keys(readJson(TEMPLATE_FIXTURE).requiredApprovalEvidence || {});
  for (const key of requiredKeys) {
    assert(draft.requiredApprovalEvidence[key] === 'manual_required', `Draft requiredApprovalEvidence.${key} must be manual_required.`);
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains source-rights input prep marker and may have been wired: ${marker}`);
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

  assertIncludes(index, 'ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_INPUT_PREP.md', 'docs/INDEX.md');
  for (const marker of [
    'route-level-tanker-freight-source-rights-input-v1',
    'Route-level tanker freight source-rights input prep',
    'prepare:route-level-tanker-freight-source-rights-input',
    'draft_manual_input_no_approval'
  ]) {
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
    assertIncludes(dataContract, marker, 'docs/DATA_CONTRACT.md');
  }
  assertIncludes(signalIntake, 'route-level-tanker-freight-source-rights-input-v1', 'docs/SIGNAL_INTAKE.md');
  assertIncludes(backlog, 'Route-level tanker freight source-rights input prep', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  assertIncludes(agents, 'route-level tanker freight source-rights input prep', 'docs/AGENT_DOMAIN_BOUNDARIES.md');
  assert(packageJson.scripts['prepare:route-level-tanker-freight-source-rights-input'], 'package.json missing source-rights input prep script.');
  assert(packageJson.scripts['check:route-level-tanker-freight-source-rights-input-prep'], 'package.json missing source-rights input prep check script.');
  assertIncludes(checkSuite, 'check:route-level-tanker-freight-source-rights-input-prep', 'scripts/check-suite.mjs');
}

function main() {
  assertDoc();
  assertScriptSafety();
  assertPreparedDraft();
  assertRuntimeRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight source-rights input prep: PASS');
}

main();
