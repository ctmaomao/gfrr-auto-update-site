import { assertIncludes, readJson } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TEMPLATE_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_TEMPLATE.md';
const TEMPLATE_FIXTURE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-template-v1.json';
const GATE_FIXTURE = 'docs/fixtures/route-level-tanker-freight-source-rights-approval-gate-v1.json';
const DISABLED_WRITER_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_DISABLED_WRITER_SCAFFOLD.md';
const DISABLED_WRITER_SCRIPT = 'scripts/project-route-level-tanker-freight-disabled-writer.mjs';

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
  'route-level-tanker-freight-source-rights-approval-template-v1',
  'route_level_tanker_freight_source_rights_approval_template',
  'template_only_no_approval',
  'template_only_no_source_rights_approved',
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

function assertTemplateDoc() {
  assert(fs.existsSync(absolute(TEMPLATE_DOC)), 'Source-rights approval template doc is missing.');
  const doc = readText(TEMPLATE_DOC);
  for (const marker of [
    'Manual source-rights approval template only',
    'route-level-tanker-freight-source-rights-approval-template-v1',
    'template_only_no_approval',
    'macroDrivers.energyTransport.routeFreightConfirmation',
    'template_only_no_source_rights_approved',
    'approvalGrantedByThisTemplate=false',
    'productionWriteBlocked=true',
    'sourceRightsStatus=manual_review_required'
  ]) {
    assertIncludes(doc, marker, TEMPLATE_DOC);
  }
}

function assertTemplateFixture() {
  assert(fs.existsSync(absolute(TEMPLATE_FIXTURE)), 'Source-rights approval template fixture is missing.');
  const fixture = readJson(TEMPLATE_FIXTURE);
  assert(fixture.contractVersion === 'route-level-tanker-freight-source-rights-approval-template-v1', 'Unexpected template contractVersion.');
  assert(fixture.kind === 'route_level_tanker_freight_source_rights_approval_template', 'Unexpected template kind.');
  assert(fixture.status === 'template_only_no_approval', 'Template must not grant approval.');
  assert(fixture.futureProductionField === 'macroDrivers.energyTransport.routeFreightConfirmation', 'Unexpected future production field.');
  assert(fixture.currentGateStatus === 'manual_review_required_no_source_rights_approved', 'Template must point to the still-blocked gate.');

  assert(fixture.currentProductionState?.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(fixture.currentProductionState?.marketConfirmation === 'not_connected', 'marketConfirmation must stay not_connected.');
  assert(fixture.currentProductionState?.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');
  assert(fixture.currentProductionState?.productionWriteApproved === false, 'productionWriteApproved must stay false.');
  assert(fixture.currentProductionState?.sourceRightsStatus === 'manual_review_required', 'sourceRightsStatus must stay manual_review_required.');

  for (const [key, value] of Object.entries(fixture.requiredApprovalEvidence || {})) {
    assert(value === 'manual_required', `requiredApprovalEvidence.${key} must be manual_required.`);
  }

  assert(fixture.minimumApprovalFieldsBeforeProductionWrite?.sourceApproved === true, 'Minimum approval must require sourceApproved=true.');
  assert(fixture.minimumApprovalFieldsBeforeProductionWrite?.liveFetchApproved === true, 'Minimum approval must require liveFetchApproved=true.');
  assert(fixture.minimumApprovalFieldsBeforeProductionWrite?.productionWriteApproved === true, 'Minimum approval must require productionWriteApproved=true.');
  assert(fixture.minimumApprovalFieldsBeforeProductionWrite?.routeValueRedistributionApproved === true, 'Minimum approval must require routeValueRedistributionApproved=true.');
  assert(fixture.minimumApprovalFieldsBeforeProductionWrite?.sourceRightsStatus === 'approved', 'Minimum approval must require sourceRightsStatus=approved.');

  assert(fixture.templateDecision?.approvalGrantedByThisTemplate === false, 'Template must not grant approval.');
  assert(fixture.templateDecision?.productionWriteBlocked === true, 'Template must keep production write blocked.');
  assert(fixture.templateDecision?.blockReason === 'template_only_no_source_rights_approved', 'Unexpected template block reason.');
  assert(fixture.templateDecision?.nextAllowedStep === 'operator_supplied_source_rights_review_artifact_then_separate_approval_gate_update', 'Unexpected next allowed step.');

  assertAllFalse(fixture.approvalState, 'template.approvalState');
  assertAllTrue(fixture.boundaries, 'template.boundaries');
}

function assertExistingGateStillBlocked() {
  const gate = readJson(GATE_FIXTURE);
  assert(gate.contractVersion === 'route-level-tanker-freight-source-rights-approval-gate-v1', 'Unexpected gate contractVersion.');
  assert(gate.status === 'manual_review_required_no_source_rights_approved', 'Gate must remain manual-review-required.');
  assert(Array.isArray(gate.approvedSources) && gate.approvedSources.length === 0, 'Gate approvedSources must stay empty.');
  assert(gate.gateDecision?.productionWriteBlocked === true, 'Gate production write must stay blocked.');
  assert(gate.gateDecision?.blockReason === 'source_rights_and_redistribution_not_approved', 'Gate block reason drifted.');
  assert(gate.currentProductionState?.routeFreightConfirmation === 'not_connected', 'Gate routeFreightConfirmation must stay not_connected.');
  assert(gate.currentProductionState?.sourceRightsStatus === 'manual_review_required', 'Gate sourceRightsStatus must stay manual_review_required.');
  assertAllFalse(gate.approvalState, 'gate.approvalState');
  assertAllTrue(gate.boundaries, 'gate.boundaries');
}

function assertDisabledWriterStillDisabled() {
  const doc = readText(DISABLED_WRITER_DOC);
  const script = readText(DISABLED_WRITER_SCRIPT);
  for (const marker of [
    'route-level-tanker-freight-disabled-writer-scaffold-v1',
    'disabled_scaffold_no_production_write',
    'productionWriteAttempted=false',
    'sourceRightsStatus=manual_review_required'
  ]) {
    assertIncludes(doc, marker, DISABLED_WRITER_DOC);
  }
  for (const marker of [
    'disabled route-level tanker freight production writer scaffold',
    'disabled_no_production_write',
    'productionWriteAttempted',
    'manual_review_required',
    'not_connected'
  ]) {
    assertIncludes(script, marker, DISABLED_WRITER_SCRIPT);
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains template marker and may have been wired: ${marker}`);
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

  assertIncludes(index, 'ROUTE_LEVEL_TANKER_FREIGHT_SOURCE_RIGHTS_APPROVAL_TEMPLATE.md', 'docs/INDEX.md');
  for (const marker of [
    'route-level-tanker-freight-source-rights-approval-template-v1',
    'Route-level tanker freight source-rights approval template',
    'template_only_no_approval',
    'template_only_no_source_rights_approved'
  ]) {
    assertIncludes(dataSources, marker, 'docs/DATA_SOURCES.md');
    assertIncludes(dataContract, marker, 'docs/DATA_CONTRACT.md');
  }
  assertIncludes(signalIntake, 'route-level-tanker-freight-source-rights-approval-template-v1', 'docs/SIGNAL_INTAKE.md');
  assertIncludes(backlog, 'Route-level tanker freight source-rights approval template', 'docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  assertIncludes(agents, 'route-level tanker freight source-rights approval template', 'docs/AGENT_DOMAIN_BOUNDARIES.md');
  assert(packageJson.scripts['check:route-level-tanker-freight-source-rights-approval-template'], 'package.json missing source-rights approval template check script.');
  assertIncludes(checkSuite, 'check:route-level-tanker-freight-source-rights-approval-template', 'scripts/check-suite.mjs');
}

function main() {
  assertTemplateDoc();
  assertTemplateFixture();
  assertExistingGateStillBlocked();
  assertDisabledWriterStillDisabled();
  assertRuntimeRemainsUnwired();
  assertProductionDataRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight source-rights approval template: PASS');
}

main();
