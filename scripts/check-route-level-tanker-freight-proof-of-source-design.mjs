import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DESIGN_DOC = 'docs/ROUTE_LEVEL_TANKER_FREIGHT_PROOF_OF_SOURCE_DESIGN.md';
const DESIGN_FIXTURE = 'docs/fixtures/route-level-tanker-freight-proof-of-source-design-v1.json';

const RUNTIME_FILES = [
  'scripts/run-daily-pipeline.mjs',
  'scripts/run-realtime.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js'
];

const REQUIRED_DOC_PHRASES = [
  'Design only',
  'No live fetch',
  'No production source approval',
  'No production data write',
  'No workflow change',
  'No frontend change',
  'No Worker runtime change',
  'Route Mapping Contract',
  'Manual Artifact Candidate Shape',
  'Future Production Contract',
  'Main-Score Eligibility Gate',
  'route_level_tanker_freight_manual_artifact_scaffold_dry_run_only',
  'eligibleForMainScore=false',
  'routeFreightConfirmation=not_connected',
  'marketConfirmation=not_connected'
];

const REQUIRED_ROUTE_BUCKETS = new Set([
  'hormuz_meg_crude',
  'meg_clean_products',
  'red_sea_suez_cape_rerouting',
  'aggregate_context_only'
]);

const REQUIRED_ACCEPTANCE_GATES = new Set([
  'route_identity',
  'source_ownership',
  'usage_rights',
  'freshness',
  'unit_semantics',
  'sanitization',
  'fallback',
  'non_scoring_boundary'
]);

const RUNTIME_FORBIDDEN_MARKERS = [
  'route_level_tanker_freight_proof_of_source_design',
  'ROUTE_LEVEL_TANKER_FREIGHT_PROOF_OF_SOURCE_DESIGN',
  'route-level-tanker-freight-manual-input-v1',
  'route-level-tanker-freight-proof-review-v1',
  'TD3C',
  'TC20',
  'TD25'
];

const FORBIDDEN_APPROVAL_PATTERNS = [
  /liveFetchApproved\s*[:=]\s*true/i,
  /productionDataWriteApproved\s*[:=]\s*true/i,
  /workflowAutomationApproved\s*[:=]\s*true/i,
  /frontendDisplayApproved\s*[:=]\s*true/i,
  /odpFinalBiasApproved\s*[:=]\s*true/i,
  /brentPromotionApproved\s*[:=]\s*true/i,
  /mainScoreApproved\s*[:=]\s*true/i,
  /manualArtifactScaffoldNetworkApproved\s*[:=]\s*true/i,
  /manualArtifactScaffoldProductionWriteApproved\s*[:=]\s*true/i
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

function assertDesignDoc() {
  assert(fs.existsSync(absolute(DESIGN_DOC)), 'Route-level tanker freight proof-of-source design doc is missing.');
  const doc = readText(DESIGN_DOC);
  const docLower = doc.toLowerCase();
  for (const phrase of REQUIRED_DOC_PHRASES) {
    assert(docLower.includes(phrase.toLowerCase()), `Design doc missing required phrase: ${phrase}`);
  }
  for (const pattern of FORBIDDEN_APPROVAL_PATTERNS) {
    assert(!pattern.test(doc), `Design doc contains forbidden approval pattern: ${pattern}`);
  }
}

function assertDesignFixture() {
  assert(fs.existsSync(absolute(DESIGN_FIXTURE)), 'Route-level tanker freight proof-of-source fixture is missing.');
  const fixtureText = readText(DESIGN_FIXTURE);
  const fixture = JSON.parse(fixtureText);

  assert(fixture.contractVersion === 'route-level-tanker-freight-proof-of-source-design-v1', 'Unexpected fixture contractVersion.');
  assert(fixture.kind === 'route_level_tanker_freight_proof_of_source_design', 'Unexpected fixture kind.');
  assert(fixture.status === 'design_only_no_live_fetch', 'Unexpected fixture status.');
  assert(fixture.nextAllowedStep === 'route_level_tanker_freight_manual_artifact_scaffold_dry_run_only', 'Unexpected nextAllowedStep.');

  for (const field of [
    'liveFetchApproved',
    'productionDataWriteApproved',
    'realtimeWriteApproved',
    'workflowAutomationApproved',
    'frontendDisplayApproved',
    'odpFinalBiasApproved',
    'brentPromotionApproved',
    'mainScoreApproved',
    'manualArtifactScaffoldNetworkApproved',
    'manualArtifactScaffoldProductionWriteApproved'
  ]) {
    assert(fixture[field] === false, `${field} must be false.`);
  }
  assert(fixture.manualArtifactScaffoldApproved === true, 'manualArtifactScaffoldApproved should be true for the next dry-run-only slice.');
  assert(fixture.currentProductionState?.routeFreightConfirmation === 'not_connected', 'current routeFreightConfirmation must remain not_connected.');
  assert(fixture.currentProductionState?.marketConfirmation === 'not_connected', 'current marketConfirmation must remain not_connected.');
  assert(fixture.currentProductionState?.eligibleForMainScore === false, 'current eligibleForMainScore must be false.');

  const gates = new Set(fixture.sourceAcceptanceGates || []);
  for (const gate of REQUIRED_ACCEPTANCE_GATES) {
    assert(gates.has(gate), `Missing source acceptance gate: ${gate}`);
  }

  const routeBuckets = new Set((fixture.routeBuckets || []).map((bucket) => bucket.bucketKey));
  for (const bucket of REQUIRED_ROUTE_BUCKETS) {
    assert(routeBuckets.has(bucket), `Missing route bucket: ${bucket}`);
  }
  for (const bucket of fixture.routeBuckets || []) {
    assert(bucket.approvedForProduction === false, `${bucket.bucketKey}.approvedForProduction must be false.`);
  }

  assert(fixture.manualArtifactCandidate?.writesProductionData === false, 'manual artifact must not write production data.');
  assert(fixture.manualArtifactCandidate?.usesNetwork === false, 'manual artifact must not use network.');
  assert(fixture.manualArtifactCandidate?.storesRawProviderResponse === false, 'manual artifact must not store raw provider response.');
  assert(fixture.futureProductionContractCandidate?.eligibleForMainScore === false, 'future production candidate must remain non-scoring.');

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
    'affectsValues',
    'affectsDisplayInputsBaseline',
    'affectsEffectiveDisplayInputs',
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance',
    'affectsBrentPromotion',
    'affectsOdpFinalBias',
    'affectsWorldOrderWeights',
    'affectsGlobalRiskHeatmap',
    'affectsCrossValidation'
  ]) {
    assert(boundaries[field] === false, `boundaries.${field} must be false.`);
  }

  for (const pattern of FORBIDDEN_APPROVAL_PATTERNS) {
    assert(!pattern.test(fixtureText), `Fixture contains forbidden approval pattern: ${pattern}`);
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains proof-of-source marker and may have wired route-level tanker freight: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const index = readText('docs/INDEX.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');

  for (const marker of [
    'Route-Level Tanker Freight Proof-of-Source Design',
    'proof-of-source design',
    'route_level_tanker_freight_manual_artifact_scaffold_dry_run_only',
    'routeFreightConfirmation',
    'not_connected'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
  }
  for (const marker of [
    'Route-level tanker freight proof-of-source',
    'manual artifact scaffold',
    'not_connected'
  ]) {
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.toLowerCase().includes('proof-of-source design'), 'SIGNAL_INTAKE missing proof-of-source marker.');
  assert(backlog.includes('Route-level tanker freight proof-of-source design'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing proof-of-source marker.');
  assert(index.includes('docs/ROUTE_LEVEL_TANKER_FREIGHT_PROOF_OF_SOURCE_DESIGN.md'), 'INDEX missing proof-of-source doc.');
  assert(agents.includes('route-level tanker freight proof-of-source'), 'docs/AGENT_DOMAIN_BOUNDARIES.md missing proof-of-source boundary.');
}

function main() {
  assertDesignDoc();
  assertDesignFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Route-level tanker freight proof-of-source design: PASS');
}

main();
