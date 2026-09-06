import { assertIncludes, readJson } from './lib/check-script-helpers.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REVIEW_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_ARTIFACT_REVIEW.md';
const REVIEW_SCRIPT = 'scripts/review-route-level-tanker-freight-source-rights-artifact.mjs';
const INPUT_FIXTURE = 'docs/fixtures/route-level-tanker-freight/source-rights-input.fixture-complete.json';
const TEMPLATE_FIXTURE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-template-v1.json';
const GATE_FIXTURE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-gate-v1.json';

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
  'route-level-tanker-freight-source-rights-artifact-review-v1',
  'route-level-tanker-freight-source-rights-input-v1',
  'review-route-level-tanker-freight-source-rights-artifact',
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

function runReviewFixture() {
  const result = spawnSync(process.execPath, [
    REVIEW_SCRIPT,
    '--input',
    INPUT_FIXTURE,
    '--template',
    TEMPLATE_FIXTURE,
    '--gate',
    GATE_FIXTURE,
    '--no-output',
    '--json',
    '--strict'
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`review helper fixture run failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function runReviewFixtureSummary() {
  const result = spawnSync(process.execPath, [
    REVIEW_SCRIPT,
    '--input',
    INPUT_FIXTURE,
    '--template',
    TEMPLATE_FIXTURE,
    '--gate',
    GATE_FIXTURE,
    '--no-output',
    '--strict'
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`review helper fixture summary failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function assertDoc() {
  assert(fs.existsSync(absolute(REVIEW_DOC)), 'Source-rights artifact review doc is missing.');
  const doc = readText(REVIEW_DOC);
  for (const marker of [
    'Manual source-rights artifact review helper only',
    'route-level-tanker-freight-source-rights-artifact-review-v1',
    'review:route-level-tanker-freight-source-rights-artifact',
    'claimsReadyForSeparateGateReview=true',
    'gateUpdateApproved=false',
    'productionWriteApproved=false',
    'routeFreightConfirmation=not_connected',
    'sourceRightsStatus=manual_review_required'
  ]) {
    assertIncludes(doc, marker, REVIEW_DOC);
  }
}

function assertScriptSafety() {
  assert(fs.existsSync(absolute(REVIEW_SCRIPT)), 'Source-rights artifact review script is missing.');
  const source = readText(REVIEW_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `${REVIEW_SCRIPT} contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'route-level-tanker-freight-source-rights-artifact-review-v1',
    'manual/local route-level tanker freight source-rights artifact review only',
    'claimsReadyForSeparateGateReview',
    'missingEvidenceKeys',
    'nextAllowedStep',
    'gateUpdateApproved',
    'productionWriteApproved',
    'not_connected'
  ]) {
    assertIncludes(source, marker, REVIEW_SCRIPT);
  }
}

function assertFixtureReview() {
  const review = runReviewFixture();
  const summary = runReviewFixtureSummary();
  assert(review.schemaVersion === 'route-level-tanker-freight-source-rights-artifact-review-v1', 'Unexpected review schemaVersion.');
  assert(review.status === 'fixture_only_reviewable_keep_blocked', 'Fixture review must remain fixture-only blocked.');
  assert(review.recommendation === 'fixture_only_validates_review_shape_keep_gate_blocked', 'Unexpected fixture recommendation.');
  assert(review.inputSummary.fixtureOnly === true, 'Fixture input must be fixtureOnly.');
  assert(review.requiredEvidence.complete === true, 'Fixture should prove evidence completeness logic.');
  assert(review.reviewDecision.evidenceComplete === true, 'Evidence should be complete in fixture review.');
  assert(review.reviewDecision.approvalClaimsComplete === true, 'Approval claims should be complete in fixture review.');
  assert(review.reviewDecision.claimsReadyForSeparateGateReview === true, 'Fixture should be ready only for separate gate review.');
  assert(review.reviewDecision.gateUpdateApproved === false, 'Review helper must not approve gate update.');
  assert(review.reviewDecision.gateUpdateEligibleFromThisArtifact === false, 'Review artifact must not be gate-update eligible by itself.');
  assert(review.reviewDecision.productionWriteApproved === false, 'Review helper must not approve production write.');
  assert(review.reviewDecision.blockers.includes('fixture_only_not_usable_for_gate_update'), 'Fixture blocker missing.');
  assert(review.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(review.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(review.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(review.sourceRightsStatus === 'manual_review_required', 'sourceRightsStatus must stay manual_review_required.');
  assertAllFalse(review.productionImpact, 'review.productionImpact');
  assertAllTrue(review.boundaries, 'review.boundaries');
  assertIncludes(summary, 'requiredEvidence: 10 present / 0 missing', 'review fixture summary');
  assertIncludes(summary, 'missingEvidenceKeys: none', 'review fixture summary');
  assertIncludes(summary, 'nextAllowedStep: separate_source_rights_gate_update_review_required', 'review fixture summary');
}

function assertGateStillBlocked() {
  const gate = readJson(GATE_FIXTURE);
  assert(gate.status === 'manual_review_required_no_source_rights_approved', 'Gate status must stay manual-review-required.');
  assert(gate.gateDecision?.productionWriteBlocked === true, 'Gate production write must stay blocked.');
  assert(gate.gateDecision?.blockReason === 'source_rights_and_redistribution_not_approved', 'Gate block reason drifted.');
  assert(Array.isArray(gate.approvedSources) && gate.approvedSources.length === 0, 'Gate approvedSources must stay empty.');
  assertAllFalse(gate.approvalState, 'gate.approvalState');
  assertAllTrue(gate.boundaries, 'gate.boundaries');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains source-rights artifact review marker and may have been wired: ${marker}`);
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

  assertIncludes(index, 'ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_ARTIFACT_REVIEW.md', 'docs/INDEX.md');
  for (const marker of [
    'route-level-tanker-freight-source-rights-artifact-review-v1',
    'Route-level tanker freight source-rights artifact review',
    'review:route-level-tanker-freight-source-rights-artifact',
    'fixture_only_reviewable_keep_blocked'
  ]) {
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
    assertIncludes(dataContract, marker, 'docs/DATA_CONTRACT.md');
  }
  assertIncludes(signalIntake, 'route-level-tanker-freight-source-rights-artifact-review-v1', 'docs/SIGNAL_INTAKE.md');
  assertIncludes(backlog, 'Route-level tanker freight source-rights artifact review', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  assertIncludes(agents, 'route-level tanker freight source-rights artifact review', 'docs/AGENT_DOMAIN_BOUNDARIES.md');
  assert(packageJson.scripts['review:route-level-tanker-freight-source-rights-artifact'], 'package.json missing source-rights artifact review script.');
  assert(packageJson.scripts['check:route-level-tanker-freight-source-rights-artifact-review'], 'package.json missing source-rights artifact review check script.');
  assertIncludes(checkSuite, 'check:route-level-tanker-freight-source-rights-artifact-review', 'scripts/check-suite.mjs');
}

function main() {
  assertDoc();
  assertScriptSafety();
  assertFixtureReview();
  assertGateStillBlocked();
  assertRuntimeRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight source-rights artifact review: PASS');
}

main();
