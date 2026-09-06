import { assertAllFalse as allFalse, assertAllTrue as allTrue, assertIncludes, readJson } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GATE_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_GATE.md';
const GATE_FIXTURE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-gate-v1.json';
const SOURCE_REVIEW_FIXTURE = 'docs/fixtures/route-level-tanker-freight-source-review-v1.json';
const WRITER_CONTRACT_FIXTURE = 'docs/fixtures/route-level-tanker-freight-production-writer-contract-design-v1.json';

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
  'route-level-tanker-freight-source-rights-approval-gate-v1',
  'route_level_tanker_freight_source_rights_approval_gate',
  'manual_review_required_no_source_rights_approved',
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

function assertGateDoc() {
  assert(fs.existsSync(absolute(GATE_DOC)), 'Source-rights gate doc is missing.');
  const doc = readText(GATE_DOC);
  for (const marker of [
    'Manual source-rights gate only',
    'route-level-tanker-freight-source-rights-approval-gate-v1',
    'manual_review_required_no_source_rights_approved',
    'macroDrivers.energyTransport.routeFreightConfirmation',
    'sourceRightsStatus=manual_review_required',
    'productionWriteBlocked=true',
    'routeFreightConfirmation=not_connected',
    'no production data write',
    'no frontend implementation'
  ]) {
    assertIncludes(doc, marker, GATE_DOC);
  }
}

function assertSourceReviewStillUnapproved() {
  const sourceReview = readJson(SOURCE_REVIEW_FIXTURE);
  assert(sourceReview.contractVersion === 'route-level-tanker-freight-source-review-v1', 'Unexpected source review contractVersion.');
  assert(sourceReview.status === 'review_only_no_source_approved', 'Source review must remain no-source-approved.');
  assert(sourceReview.productionDataWriteApproved === false, 'Source review must not approve production write.');
  assert(sourceReview.liveFetchApproved === false, 'Source review must not approve live fetch.');
  assert(sourceReview.routeValueRedistributionApproved === false, 'Source review must not approve route-value redistribution.');
  for (const source of sourceReview.candidateSources || []) {
    assert(source.sourceApproved === false, `candidate source ${source.sourceKey} must not be approved.`);
    assert(source.liveFetchApproved === false, `candidate source ${source.sourceKey} must not approve live fetch.`);
    assert(source.productionWriteApproved === false, `candidate source ${source.sourceKey} must not approve production write.`);
  }
}

function assertWriterContractStillBlocked() {
  const writerContract = readJson(WRITER_CONTRACT_FIXTURE);
  assert(writerContract.contractVersion === 'route-level-tanker-freight-production-writer-contract-design-v1', 'Unexpected writer contractVersion.');
  assert(writerContract.status === 'contract_design_only_no_writer', 'Writer contract must stay design-only.');
  assert(writerContract.currentProductionState?.sourceRightsStatus === 'manual_review_required', 'Writer contract source rights must stay manual_review_required.');
  assert(writerContract.currentProductionState?.productionWriteApproved === false, 'Writer contract must not approve production write.');
  assert(writerContract.futureFieldShape?.sourceRightsStatus === 'manual_review_required', 'Future field source-rights status must require manual review.');
  allFalse(writerContract.approvalState, 'writerContract.approvalState');
}

function assertGateFixture() {
  assert(fs.existsSync(absolute(GATE_FIXTURE)), 'Source-rights gate fixture is missing.');
  const gate = readJson(GATE_FIXTURE);
  assert(gate.contractVersion === 'route-level-tanker-freight-source-rights-approval-gate-v1', 'Unexpected gate contractVersion.');
  assert(gate.kind === 'route_level_tanker_freight_source_rights_approval_gate', 'Unexpected gate kind.');
  assert(gate.status === 'manual_review_required_no_source_rights_approved', 'Gate must remain manual-review-required.');
  assert(gate.futureProductionField === 'macroDrivers.energyTransport.routeFreightConfirmation', 'Unexpected future production field.');
  assert(gate.currentProductionState?.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(gate.currentProductionState?.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(gate.currentProductionState?.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(gate.currentProductionState?.productionWriteApproved === false, 'productionWriteApproved must stay false.');
  assert(gate.currentProductionState?.sourceRightsStatus === 'manual_review_required', 'sourceRightsStatus must stay manual_review_required.');
  assert(Array.isArray(gate.approvedSources) && gate.approvedSources.length === 0, 'approvedSources must stay empty.');
  assert(gate.gateDecision?.sourceRightsStatus === 'manual_review_required', 'gate sourceRightsStatus must require manual review.');
  assert(gate.gateDecision?.productionWriteBlocked === true, 'production write must stay blocked.');
  assert(gate.gateDecision?.blockReason === 'source_rights_and_redistribution_not_approved', 'Unexpected block reason.');
  assert(gate.minimumApprovalFieldsBeforeProductionWrite?.sourceApproved === true, 'Minimum approval must require sourceApproved=true.');
  assert(gate.minimumApprovalFieldsBeforeProductionWrite?.liveFetchApproved === true, 'Minimum approval must require liveFetchApproved=true.');
  assert(gate.minimumApprovalFieldsBeforeProductionWrite?.productionWriteApproved === true, 'Minimum approval must require productionWriteApproved=true.');
  assert(gate.minimumApprovalFieldsBeforeProductionWrite?.routeValueRedistributionApproved === true, 'Minimum approval must require routeValueRedistributionApproved=true.');
  assert(gate.minimumApprovalFieldsBeforeProductionWrite?.sourceRightsStatus === 'approved', 'Minimum approval must require sourceRightsStatus=approved.');
  for (const source of gate.candidateSourceFamilies || []) {
    assert(source.sourceApproved === false, `gate source ${source.sourceKey} must not be approved.`);
    assert(source.liveFetchApproved === false, `gate source ${source.sourceKey} must not approve live fetch.`);
    assert(source.productionWriteApproved === false, `gate source ${source.sourceKey} must not approve production write.`);
  }
  allFalse(gate.approvalState, 'gate.approvalState');
  allTrue(gate.boundaries, 'gate.boundaries');
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains source-rights gate marker and may have been wired: ${marker}`);
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

  assertIncludes(index, 'ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_GATE.md', 'docs/INDEX.md');
  for (const marker of [
    'route-level-tanker-freight-source-rights-approval-gate-v1',
    'Route-level tanker freight source-rights approval gate',
    'manual_review_required_no_source_rights_approved',
    'source_rights_and_redistribution_not_approved'
  ]) {
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
    assertIncludes(dataContract, marker, 'docs/DATA_CONTRACT.md');
  }
  assertIncludes(signalIntake, 'route-level-tanker-freight-source-rights-approval-gate-v1', 'docs/SIGNAL_INTAKE.md');
  assertIncludes(backlog, 'Route-level tanker freight source-rights approval gate', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  assertIncludes(agents, 'route-level tanker freight source-rights approval gate', 'docs/AGENT_DOMAIN_BOUNDARIES.md');
  assert(packageJson.scripts['check:route-level-tanker-freight-source-rights-approval-gate'], 'package.json missing source-rights gate check script.');
  assertIncludes(checkSuite, 'check:route-level-tanker-freight-source-rights-approval-gate', 'scripts/check-suite.mjs');
}

function main() {
  assertGateDoc();
  assertSourceReviewStillUnapproved();
  assertWriterContractStillBlocked();
  assertGateFixture();
  assertRuntimeRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight source-rights approval gate: PASS');
}

main();
