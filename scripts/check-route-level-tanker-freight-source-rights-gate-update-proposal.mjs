import { assertIncludes, readJson } from './lib/check-script-helpers.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PROPOSAL_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_GATE_UPDATE_PROPOSAL.md';
const PROPOSAL_SCRIPT = 'scripts/project-route-level-tanker-freight-source-rights-gate-update.mjs';
const REVIEW_FIXTURE = 'docs/fixtures/route-level-tanker-freight/source-rights-artifact-review.fixture-complete.json';
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
  'route-level-tanker-freight-source-rights-gate-update-proposal-v1',
  'project-route-level-tanker-freight-source-rights-gate-update',
  'ready_for_human_gate_update_review',
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

function runProposalFixture() {
  const result = spawnSync(process.execPath, [
    PROPOSAL_SCRIPT,
    '--source-rights-review',
    REVIEW_FIXTURE,
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
  if (result.status !== 0) throw new Error(`gate update proposal fixture run failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}

function assertDoc() {
  assert(fs.existsSync(absolute(PROPOSAL_DOC)), 'Gate update proposal doc is missing.');
  const doc = readText(PROPOSAL_DOC);
  for (const marker of [
    'Dry-run gate update proposal only',
    'route-level-tanker-freight-source-rights-gate-update-proposal-v1',
    'project:route-level-tanker-freight-source-rights-gate-update',
    'proposalReadyForHumanGateReview=true',
    'gateUpdateApproved=false',
    'writesGateFixture=false',
    'productionWriteApproved=false',
    'fixture_only_proposal_keep_gate_blocked'
  ]) {
    assertIncludes(doc, marker, PROPOSAL_DOC);
  }
}

function assertScriptSafety() {
  assert(fs.existsSync(absolute(PROPOSAL_SCRIPT)), 'Gate update proposal script is missing.');
  const source = readText(PROPOSAL_SCRIPT);
  for (const marker of SCRIPT_FORBIDDEN_MARKERS) {
    assert(!source.includes(marker), `${PROPOSAL_SCRIPT} contains forbidden marker: ${marker}`);
  }
  for (const marker of [
    'route-level-tanker-freight-source-rights-gate-update-proposal-v1',
    'dry-run-only route-level tanker freight source-rights gate update proposal',
    'proposalReadyForHumanGateReview',
    'gateUpdateApproved',
    'writesGateFixture',
    'not_connected'
  ]) {
    assertIncludes(source, marker, PROPOSAL_SCRIPT);
  }
}

function assertProposalFixture() {
  const proposal = runProposalFixture();
  assert(proposal.schemaVersion === 'route-level-tanker-freight-source-rights-gate-update-proposal-v1', 'Unexpected proposal schemaVersion.');
  assert(proposal.status === 'fixture_only_proposal_keep_gate_blocked', 'Fixture proposal must stay fixture-only blocked.');
  assert(proposal.recommendation === 'fixture_only_validates_proposal_shape_keep_gate_blocked', 'Unexpected fixture recommendation.');
  assert(proposal.sourceRightsReview.fixtureOnly === true, 'Source-rights review fixtureOnly must be true.');
  assert(proposal.sourceRightsReview.claimsReadyForSeparateGateReview === true, 'Fixture should prove proposal readiness branch.');
  assert(proposal.proposalDecision.proposalReadyForHumanGateReview === false, 'Fixture proposal must not be ready for real gate review.');
  assert(proposal.proposalDecision.gateUpdateApproved === false, 'Proposal helper must not approve gate update.');
  assert(proposal.proposalDecision.writesGateFixture === false, 'Proposal helper must not write gate fixture.');
  assert(proposal.proposalDecision.productionWriteApproved === false, 'Proposal helper must not approve production write.');
  assert(proposal.proposalDecision.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(proposal.proposalDecision.sourceRightsStatus === 'manual_review_required', 'sourceRightsStatus must stay manual_review_required.');
  assert(proposal.proposedGatePatch === null, 'Fixture-only proposal must not emit a proposed gate patch.');
  assert(proposal.proposalDecision.blockers.includes('fixture_only_not_usable_for_gate_update'), 'Fixture blocker missing.');
  assertAllFalse(proposal.productionImpact, 'proposal.productionImpact');
  assertAllTrue(proposal.boundaries, 'proposal.boundaries');
}

function assertGateStillBlocked() {
  const gate = readJson(GATE_FIXTURE);
  assert(gate.status === 'manual_review_required_no_source_rights_approved', 'Gate status must stay manual-review-required.');
  assert(gate.gateDecision?.productionWriteBlocked === true, 'Gate production write must stay blocked.');
  assert(gate.gateDecision?.blockReason === 'source_rights_and_redistribution_not_approved', 'Gate block reason drifted.');
  assert(Array.isArray(gate.approvedSources) && gate.approvedSources.length === 0, 'Gate approvedSources must stay empty.');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains gate-update proposal marker and may have been wired: ${marker}`);
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

  assertIncludes(index, 'ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_GATE_UPDATE_PROPOSAL.md', 'docs/INDEX.md');
  for (const marker of [
    'route-level-tanker-freight-source-rights-gate-update-proposal-v1',
    'Route-level tanker freight source-rights gate update proposal',
    'project:route-level-tanker-freight-source-rights-gate-update',
    'fixture_only_proposal_keep_gate_blocked'
  ]) {
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
    assertIncludes(dataContract, marker, 'docs/DATA_CONTRACT.md');
  }
  assertIncludes(signalIntake, 'route-level-tanker-freight-source-rights-gate-update-proposal-v1', 'docs/SIGNAL_INTAKE.md');
  assertIncludes(backlog, 'Route-level tanker freight source-rights gate update proposal', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  assertIncludes(agents, 'route-level tanker freight source-rights gate update proposal', 'docs/AGENT_DOMAIN_BOUNDARIES.md');
  assert(packageJson.scripts['project:route-level-tanker-freight-source-rights-gate-update'], 'package.json missing gate update proposal project script.');
  assert(packageJson.scripts['check:route-level-tanker-freight-source-rights-gate-update-proposal'], 'package.json missing gate update proposal check script.');
  assertIncludes(checkSuite, 'check:route-level-tanker-freight-source-rights-gate-update-proposal', 'scripts/check-suite.mjs');
}

function main() {
  assertDoc();
  assertScriptSafety();
  assertProposalFixture();
  assertGateStillBlocked();
  assertRuntimeRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight source-rights gate update proposal: PASS');
}

main();
