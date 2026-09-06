import { assertIncludes, readJson } from './lib/check-script-helpers.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GUIDE_SCRIPT = 'scripts/guide-route-level-tanker-freight-source-rights-input.mjs';
const INPUT_PREP_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_INPUT_PREP.md';
const INPUT_FIXTURE = 'docs/fixtures/route-level-tanker-freight/source-rights-input.fixture-complete.json';
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
  'route-level-tanker-freight-source-rights-input-guide-v1',
  'guide-route-level-tanker-freight-source-rights-input',
  'ready_for_artifact_review',
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

function runGuideJson() {
  const result = spawnSync(process.execPath, [
    GUIDE_SCRIPT,
    '--input',
    INPUT_FIXTURE,
    '--template',
    TEMPLATE_FIXTURE,
    '--json'
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`input guide JSON run failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function runGuideSummary() {
  const result = spawnSync(process.execPath, [
    GUIDE_SCRIPT,
    '--input',
    INPUT_FIXTURE,
    '--template',
    TEMPLATE_FIXTURE
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`input guide summary run failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function assertScriptSafety() {
  assert(fs.existsSync(absolute(GUIDE_SCRIPT)), 'Source-rights input guide script is missing.');
  const source = readText(GUIDE_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `${GUIDE_SCRIPT} contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'route-level-tanker-freight-source-rights-input-guide-v1',
    'read-only route-level tanker freight source-rights input guide',
    'missingEvidenceKeys',
    'approvalClaimsComplete',
    'operatorReviewComplete',
    'not_connected'
  ]) {
    assertIncludes(source, marker, GUIDE_SCRIPT);
  }
}

function assertGuideOutput() {
  const guide = runGuideJson();
  const summary = runGuideSummary();
  assert(guide.schemaVersion === 'route-level-tanker-freight-source-rights-input-guide-v1', 'Unexpected guide schemaVersion.');
  assert(guide.status === 'input_incomplete_keep_gate_blocked', 'Fixture-only input guide must not be ready for real artifact review.');
  assert(guide.input.exists === true, 'Fixture input should exist.');
  assert(guide.input.schemaOk === true, 'Fixture schema should be ok.');
  assert(guide.input.futureFieldOk === true, 'Fixture future production field should be ok.');
  assert(guide.input.fixtureOnly === true, 'Fixture guide should detect fixtureOnly.');
  assert(guide.requiredEvidence.totalCount === 10, 'Expected 10 required evidence fields.');
  assert(guide.requiredEvidence.presentCount === 10, 'Fixture should have all evidence fields present.');
  assert(guide.requiredEvidence.missingCount === 0, 'Fixture should have no missing evidence fields.');
  assert(guide.approvalClaims.complete === true, 'Fixture approval claims should be complete.');
  assert(guide.operatorReview.complete === true, 'Fixture operator review should be complete.');
  assert(guide.currentProductionState.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(guide.currentProductionState.eligibleForMainScore === false, 'Guide must not be main-score eligible.');
  assertAllFalse(guide.productionImpact, 'guide.productionImpact');
  assertAllTrue(guide.boundaries, 'guide.boundaries');
  assertIncludes(summary, 'requiredEvidence: 10 present / 0 missing', 'guide summary');
  assertIncludes(summary, 'missingEvidenceKeys: none', 'guide summary');
  assertIncludes(summary, 'approvalClaimsComplete: true', 'guide summary');
  assertIncludes(summary, 'routeFreightConfirmation: not_connected', 'guide summary');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains source-rights input guide marker and may have been wired: ${marker}`);
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
  const inputPrepDoc = readText(INPUT_PREP_DOC);
  const dataSources = readText('docs/DATA_SOURCES.md');
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
  const packageJson = readJson('package.json');
  const checkSuite = readText('scripts/check-suite.mjs');

  for (const marker of [
    'guide:route-level-tanker-freight-source-rights-input',
    'route-level-tanker-freight-source-rights-input-guide-v1',
    'read-only'
  ]) {
    assertIncludes(inputPrepDoc, marker, INPUT_PREP_DOC);
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
  }
  assertIncludes(backlog, 'Route-level tanker freight source-rights input guide', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  assertIncludes(agents, 'route-level tanker freight source-rights input guide', 'docs/AGENT_DOMAIN_BOUNDARIES.md');
  assert(packageJson.scripts['guide:route-level-tanker-freight-source-rights-input'], 'package.json missing input guide script.');
  assert(packageJson.scripts['check:route-level-tanker-freight-source-rights-input-guide'], 'package.json missing input guide check script.');
  assertIncludes(checkSuite, 'check:route-level-tanker-freight-source-rights-input-guide', 'scripts/check-suite.mjs');
}

function main() {
  assertScriptSafety();
  assertGuideOutput();
  assertRuntimeRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight source-rights input guide: PASS');
}

main();
