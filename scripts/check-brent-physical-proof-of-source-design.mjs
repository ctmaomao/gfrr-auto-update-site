import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DESIGN_DOC = 'docs/BRENT_PHYSICAL_PROOF_OF_SOURCE_DESIGN.md';
const DESIGN_FIXTURE = 'docs/fixtures/brent-physical-proof-of-source-design-v28.0M-74.json';

const PROTECTED_FILES = [
  'data/radar-data.json',
  'realtime/market.json'
];

const RUNTIME_FILES = [
  'scripts/run-daily-pipeline.mjs',
  'scripts/run-realtime.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'scripts/modules/renderMacroOverview.js',
  'scripts/modules/render.js'
];

const REQUIRED_DOC_PHRASES = [
  'Design only',
  'No live fetch',
  'No source approval',
  'No production data write',
  'No Worker runtime change',
  'No Brent promotion change',
  'Platts Dated Brent / formal Dated Brent',
  'Brent futures term structure',
  'Shipping / freight stress',
  'licensedAccessRequired=true',
  'publicProxyAllowed=false',
  'ICE Brent futures curve shape',
  'Baltic Exchange freight benchmarks',
  'Freightos Baltic Index',
  'container freight is a shipping proxy only',
  'formalPlattsDatedBrentConnected=false',
  'brent physical proof-of-source artifact-only manual capture scaffold'
];

const REQUIRED_TARGET_GAPS = new Set([
  'formal_platts_dated_brent',
  'brent_term_structure',
  'shipping_freight_stress'
]);

const REQUIRED_PROOF_TARGETS = new Set([
  'sp_global_platts_dated_brent',
  'ice_brent_futures_curve',
  'baltic_exchange_freight_benchmarks',
  'freightos_baltic_index'
]);

const RUNTIME_FORBIDDEN_MARKERS = [
  'BRENT_PHYSICAL_PROOF_OF_SOURCE',
  'brent_physical_term_freight_proof_of_source_design',
  'sp_global_platts_dated_brent',
  'ice_brent_futures_curve',
  'baltic_exchange_freight_benchmarks',
  'freightos_baltic_index',
  'formalPlattsDatedBrentConnected'
];

const FORBIDDEN_APPROVAL_PATTERNS = [
  /sourceApproved\s*[:=]\s*true/i,
  /liveFetchApproved\s*[:=]\s*true/i,
  /productionDataWriteApproved\s*[:=]\s*true/i,
  /productionWriteApproved\s*[:=]\s*true/i,
  /workflowAutomationApproved\s*[:=]\s*true/i,
  /frontendDisplayApproved\s*[:=]\s*true/i,
  /workerRuntimeApproved\s*[:=]\s*true/i,
  /brentPromotionApproved\s*[:=]\s*true/i,
  /valuesBrentChangeApproved\s*[:=]\s*true/i,
  /formalPlattsDatedBrentConnected\s*[:=]\s*true/i,
  /officialDatedBrentConnected\s*[:=]\s*true/i,
  /brentTermStructureConnected\s*[:=]\s*true/i,
  /shippingFreightConnected\s*[:=]\s*true/i
];

const FORBIDDEN_CONNECTED_CLAIMS = [
  'Platts Dated Brent 已接入',
  '真实 Dated Brent 已接入',
  '正式 Dated Brent 已接入',
  'Brent 期限结构已接入',
  'shipping / freight stress 已接入'
];

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function readText(relativePath) {
  return fs.readFileSync(absolute(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function snapshotProtectedFiles() {
  return new Map(PROTECTED_FILES.map((relativePath) => [relativePath, readText(relativePath)]));
}

function assertProtectedFilesUnchanged(snapshot) {
  for (const [relativePath, before] of snapshot.entries()) {
    assert(readText(relativePath) === before, `${relativePath} changed during check.`);
  }
}

function assertNoForbiddenApprovals(text, label) {
  for (const pattern of FORBIDDEN_APPROVAL_PATTERNS) {
    assert(!pattern.test(text), `${label} contains forbidden approval pattern: ${pattern}`);
  }
}

function assertNoForbiddenConnectedClaims(text, label) {
  for (const claim of FORBIDDEN_CONNECTED_CLAIMS) {
    assert(!text.includes(claim), `${label} contains forbidden connected claim: ${claim}`);
  }
}

function assertDesignDoc() {
  assert(fs.existsSync(absolute(DESIGN_DOC)), 'Brent physical proof-of-source design doc is missing.');
  const doc = readText(DESIGN_DOC);
  const docLower = doc.toLowerCase();
  for (const phrase of REQUIRED_DOC_PHRASES) {
    assert(
      docLower.includes(phrase.toLowerCase()),
      `Design doc missing required phrase: ${phrase}`
    );
  }
  assertNoForbiddenApprovals(doc, DESIGN_DOC);
  assertNoForbiddenConnectedClaims(doc, DESIGN_DOC);
}

function assertBooleanFalse(fixture, field) {
  assert(fixture[field] === false, `${field} must be false.`);
}

function assertProofTarget(target) {
  for (const field of ['sourceApproved', 'liveFetchApproved', 'productionWriteApproved']) {
    assert(target[field] === false, `${target.sourceKey}.${field} must be false.`);
  }
  assert(target.officialDatedBrent === false || target.formalDatedBrentCandidate === true, `${target.sourceKey} must not claim official Dated Brent.`);

  if (target.sourceKey === 'sp_global_platts_dated_brent') {
    assert(target.licensedAccessRequired === true, 'Platts target must require licensed access.');
    assert(target.publicFetchCandidate === false, 'Platts target must not be a public fetch candidate.');
    assert(target.publicProxyAllowed === false, 'Platts target must not allow public proxy substitution.');
    assert(target.formalDatedBrentConnected === false, 'Platts target must remain unconnected.');
  }

  if (target.sourceKey === 'ice_brent_futures_curve') {
    assert(target.brentTermStructureConnected === false, 'ICE term structure must remain unconnected.');
    assert(target.minimumFirstProofContracts >= 6, 'ICE first proof must require at least 6 contracts.');
    assert(target.expectedFields.includes('contractMonth'), 'ICE target must require contractMonth.');
    assert(target.expectedFields.includes('priceType'), 'ICE target must require priceType.');
  }

  if (target.sourceKey === 'baltic_exchange_freight_benchmarks') {
    assert(target.licensedAccessRequired === true, 'Baltic target must require licensed access.');
    assert(target.shippingFreightConnected === false, 'Baltic freight must remain unconnected.');
    assert(target.preferredRouteFamilyForCrudeReview === 'tanker', 'Baltic crude review should prefer tanker routes.');
  }

  if (target.sourceKey === 'freightos_baltic_index') {
    assert(target.containerFreightProxyOnly === true, 'Freightos target must stay container proxy only.');
    assert(target.crudeTankerFreightCandidate === false, 'Freightos target must not claim crude tanker freight.');
    assert(target.shippingFreightConnected === false, 'Freightos freight must remain unconnected.');
  }
}

function assertDesignFixture() {
  assert(fs.existsSync(absolute(DESIGN_FIXTURE)), 'Brent physical proof-of-source fixture is missing.');
  const fixtureText = readText(DESIGN_FIXTURE);
  const fixture = JSON.parse(fixtureText);

  assert(
    fixture.contractVersion === 'v28.0M-74-brent-physical-proof-of-source-design-1',
    'Unexpected fixture contractVersion.'
  );
  assert(
    fixture.kind === 'brent_physical_term_freight_proof_of_source_design',
    'Unexpected fixture kind.'
  );
  assert(
    fixture.status === 'design_only_no_live_fetch_no_production_write',
    'Unexpected fixture status.'
  );

  for (const field of [
    'sourceSelectionFinalized',
    'sourceApproved',
    'liveFetchApproved',
    'productionDataWriteApproved',
    'realtimeWriteApproved',
    'workflowAutomationApproved',
    'frontendDisplayApproved',
    'workerRuntimeApproved',
    'brentPromotionApproved',
    'valuesBrentChangeApproved',
    'formalPlattsDatedBrentConnected',
    'officialDatedBrentConnected',
    'brentTermStructureConnected',
    'shippingFreightConnected'
  ]) {
    assertBooleanFalse(fixture, field);
  }

  assert(Array.isArray(fixture.targetGaps), 'targetGaps must be an array.');
  const targetGaps = new Set(fixture.targetGaps);
  for (const gap of REQUIRED_TARGET_GAPS) {
    assert(targetGaps.has(gap), `Missing target gap: ${gap}`);
  }

  assert(Array.isArray(fixture.proofTargets), 'proofTargets must be an array.');
  const proofTargets = new Set(fixture.proofTargets.map((target) => target.sourceKey));
  for (const sourceKey of REQUIRED_PROOF_TARGETS) {
    assert(proofTargets.has(sourceKey), `Missing proof target: ${sourceKey}`);
  }
  for (const target of fixture.proofTargets) {
    assertProofTarget(target);
  }

  const artifactContract = fixture.expectedArtifactContract || {};
  assert(artifactContract.artifactOnly === true, 'expectedArtifactContract.artifactOnly must be true.');
  assert(
    artifactContract.recordsAllowedInThisPr === false,
    'expectedArtifactContract.recordsAllowedInThisPr must be false.'
  );
  assert(
    Array.isArray(artifactContract.sampleRecords) && artifactContract.sampleRecords.length === 0,
    'expectedArtifactContract.sampleRecords must be empty.'
  );
  for (const field of ['rejectsSecrets', 'rejectsRequestHeaders', 'rejectsCookies', 'rejectsHtmlErrorPages', 'rejectsTradingAdvice']) {
    assert(artifactContract[field] === true, `expectedArtifactContract.${field} must be true.`);
  }

  const boundaries = fixture.boundaries || {};
  for (const field of [
    'designOnly',
    'noLiveFetch',
    'noProductionWrite',
    'noRealtimeWrite',
    'noWorkflowChange',
    'noFrontendChange',
    'noWorkerRuntimeChange'
  ]) {
    assert(boundaries[field] === true, `boundaries.${field} must be true.`);
  }
  for (const field of [
    'affectsValuesBrent',
    'affectsBrentPromotion',
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance',
    'affectsActionQueue',
    'affectsTriggerMonitor',
    'affectsInvalidationRules'
  ]) {
    assert(boundaries[field] === false, `boundaries.${field} must be false.`);
  }

  assert(
    fixture.nextAllowedStep === 'brent_physical_proof_of_source_artifact_only_manual_capture_scaffold_no_network_by_default',
    'Unexpected nextAllowedStep.'
  );
  assertNoForbiddenApprovals(fixtureText, DESIGN_FIXTURE);
  assertNoForbiddenConnectedClaims(fixtureText, DESIGN_FIXTURE);
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains M-74 runtime marker: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/PROJECT_BACKLOG.md');
  const index = readText('docs/INDEX.md');

  for (const marker of [
    'M-74 proof-of-source design',
    'sp_global_platts_dated_brent',
    'ice_brent_futures_curve',
    'baltic_exchange_freight_benchmarks',
    'freightos_baltic_index'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing M-74 marker: ${marker}`);
  }

  for (const marker of [
    'M-74 proof-of-source design',
    'Brent term structure',
    'Shipping / freight stress'
  ]) {
    assert(signalIntake.includes(marker), `SIGNAL_INTAKE missing M-74 marker: ${marker}`);
  }

  assert(backlog.includes('M-74 Brent physical proof-of-source design'), 'PROJECT_BACKLOG missing M-74 marker.');
  assert(index.includes('docs/BRENT_PHYSICAL_PROOF_OF_SOURCE_DESIGN.md'), 'INDEX missing M-74 doc marker.');
}

function main() {
  const snapshot = snapshotProtectedFiles();
  assertDesignDoc();
  assertDesignFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  assertProtectedFilesUnchanged(snapshot);
  console.log('Brent physical proof-of-source design: PASS');
}

main();
