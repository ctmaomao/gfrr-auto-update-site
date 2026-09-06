import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DOC = 'docs/TRANSPORT_SHOCK_SATELLITE_HANDLING_POLICY.md';
const FIXTURE = 'docs/fixtures/transport-shock-confirmation-factor/satellite-handling-policy-v1.json';

const RUNTIME_FILES = [
  'index.html',
  'scripts/app.js',
  'scripts/modules/renderMacroOverview.js',
  'scripts/modules/buildCrossValidationMatrix.js',
  'scripts/run-daily-pipeline.mjs',
  'workers/gfrr-realtime-worker/src/worker-market-preview.js',
  'data/radar-data.json',
  'data/oil-directional-pressure.json'
];

const BASELINE_WINDOWS = new Set([
  'starter_under_7d',
  'minimum_7d_gate',
  'stronger_14d_gate',
  'preferred_30d_stable'
]);

const RUNTIME_FORBIDDEN_MARKERS = [
  'transport-shock-satellite-handling-policy-v1',
  'transport_shock_satellite_handling_policy',
  'policy_review_no_thermal_blocker_bypass',
  'thermalBlockerBypassApproved'
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

function assertDoc() {
  assert(fs.existsSync(absolute(DOC)), 'P45 satellite handling policy doc is missing.');
  const doc = readText(DOC);
  for (const marker of [
    'Transport Shock Satellite Handling Policy',
    'transport-shock-satellite-handling-policy-v1',
    'policy_review_no_thermal_blocker_bypass',
    'Do Not Downgrade Thresholds',
    'Baseline Quality Comes First',
    'Targeted Probe From News Or Facility Mentions',
    'No-Detection Is Negative Evidence',
    'Bypass Requires Separate Policy Review',
    'does not change'
  ]) {
    assert(doc.includes(marker), `${DOC} missing marker: ${marker}`);
  }
  for (const forbidden of [
    'thermal blocker bypass is approved',
    'score write approved',
    'main-score connected',
    'lower FRP threshold to clear blocker'
  ]) {
    assert(!doc.includes(forbidden), `${DOC} contains forbidden approval claim: ${forbidden}`);
  }
}

function assertFixture() {
  assert(fs.existsSync(absolute(FIXTURE)), 'P45 satellite handling policy fixture is missing.');
  const fixture = JSON.parse(readText(FIXTURE));
  assert(fixture.contractVersion === 'transport-shock-satellite-handling-policy-v1', 'Unexpected contractVersion.');
  assert(fixture.kind === 'transport_shock_satellite_handling_policy', 'Unexpected kind.');
  assert(fixture.status === 'policy_review_no_thermal_blocker_bypass', 'Unexpected status.');
  assert(fixture.currentProductionState.highFrequencyPhysicalConfirmation === 'blocked', 'High-frequency physical confirmation must stay blocked.');
  assert(fixture.currentProductionState.thermalBlockerBypassApproved === false, 'Thermal blocker bypass must not be approved.');
  assert(fixture.currentProductionState.routeFreightConfirmation === 'not_connected', 'routeFreightConfirmation must stay not_connected.');
  assert(fixture.currentProductionState.eligibleForMainScore === false, 'eligibleForMainScore must stay false.');

  assert(Array.isArray(fixture.baselineQualityWindows), 'baselineQualityWindows must be an array.');
  const windows = new Set(fixture.baselineQualityWindows.map((window) => window.windowKey));
  for (const windowKey of BASELINE_WINDOWS) {
    assert(windows.has(windowKey), `Missing baseline window: ${windowKey}`);
  }
  for (const window of fixture.baselineQualityWindows) {
    assert(window.confirmationAllowed === false, `${window.windowKey}.confirmationAllowed must be false.`);
    assert(window.scoreAllowed === false, `${window.windowKey}.scoreAllowed must be false.`);
  }

  const requirements = fixture.thermalSupportRequirements || {};
  for (const field of [
    'sourceLiveOrReviewedRecentArtifact',
    'noExampleFacilities',
    'baselineAtLeast7d',
    'repeatedObservationRequired',
    'elevatedRepeatedObservationRequired',
    'facilityOrRegionOverlapsNewsOrTransportAxis',
    'requiresSeparateCrossConfirmationReview'
  ]) {
    assert(requirements[field] === true, `thermalSupportRequirements.${field} must be true.`);
  }
  assert(requirements.clearsHighFrequencyPhysicalByItself === false, 'Thermal support must not clear high-frequency physical confirmation by itself.');

  const targetedProbePolicy = fixture.targetedProbePolicy || {};
  assert(targetedProbePolicy.allowed === true, 'targetedProbePolicy.allowed must be true.');
  assert(Array.isArray(targetedProbePolicy.allowedWindowsDays), 'targetedProbePolicy.allowedWindowsDays must be an array.');
  for (const day of [1, 3, 5]) {
    assert(targetedProbePolicy.allowedWindowsDays.includes(day), `targetedProbePolicy.allowedWindowsDays missing ${day}.`);
  }
  assert(targetedProbePolicy.allowedOutputRoot === 'manual-artifacts/oil-thermal/', 'Unexpected targeted probe output root.');
  for (const field of ['writesProductionData', 'confirmsAccident', 'confirmsOutage', 'confirmsClosure', 'confirmsPriceDirection']) {
    assert(targetedProbePolicy[field] === false, `targetedProbePolicy.${field} must be false.`);
  }

  const noDetectionPolicy = fixture.noDetectionPolicy || {};
  assert(noDetectionPolicy.classification === 'negative_evidence_not_absence_proof', 'Unexpected no-detection classification.');
  assert(noDetectionPolicy.canReduceFacilityAccidentClaimConfidence === true, 'No-detection should be allowed to reduce facility-accident claim confidence.');
  assert(noDetectionPolicy.canDisplayCopy === '未见卫星热异常确认', 'Unexpected no-detection display copy.');
  for (const field of ['canClearThermalBlocker', 'canClearRouteFreightBlocker', 'canClearMarketBlocker', 'canApproveScoreWrite']) {
    assert(noDetectionPolicy[field] === false, `noDetectionPolicy.${field} must be false.`);
  }

  const bypassPolicy = fixture.bypassPolicy || {};
  assert(bypassPolicy.thermalBlockerBypassApprovedByThisPolicy === false, 'Thermal blocker bypass must not be approved by P45.');
  assert(bypassPolicy.futureBypassRequiresSeparateReviewedPolicyChange === true, 'Future bypass must require a separate reviewed policy change.');
  assert(bypassPolicy.falsePositiveControlsRequired === true, 'Future bypass must require false-positive controls.');

  for (const [key, value] of Object.entries(fixture.approvalState || {})) {
    assert(value === false, `approvalState.${key} must be false.`);
  }
  const boundaries = fixture.boundaries || {};
  for (const field of [
    'policyReviewOnly',
    'noThresholdDowngrade',
    'noThermalBlockerBypass',
    'noProductionWrite',
    'noWorkflowChange',
    'noFrontendChange',
    'noWorkerRuntimeChange',
    'noScoreWrite'
  ]) {
    assert(boundaries[field] === true, `boundaries.${field} must be true.`);
  }
  for (const field of ['affectsOdpFinalBias', 'affectsMainJudgment', 'affectsGlobalRiskHeatmap', 'affectsCrossValidation']) {
    assert(boundaries[field] === false, `boundaries.${field} must be false.`);
  }
}

function assertRuntimeRemainsUnwired() {
  for (const relativePath of RUNTIME_FILES) {
    assert(fs.existsSync(absolute(relativePath)), `${relativePath} is missing.`);
    const source = readText(relativePath);
    for (const marker of RUNTIME_FORBIDDEN_MARKERS) {
      assert(!source.includes(marker), `${relativePath} contains P45 policy marker: ${marker}`);
    }
  }
}

function assertAuthorityDocs() {
  const dataSources = readText('docs/DATA_SOURCES.md');
  const dataContract = readText('docs/DATA_CONTRACT.md');
  const signalIntake = readText('docs/SIGNAL_INTAKE.md');
  const backlog = readText('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
  const agents = readText('docs/AGENT_DOMAIN_BOUNDARIES.md');
  const packageJson = JSON.parse(readText('package.json'));
  const checkSuite = readText('scripts/check-suite.mjs');

  for (const marker of [
    'Transport Shock satellite handling policy',
    'transport-shock-satellite-handling-policy-v1',
    'policy_review_no_thermal_blocker_bypass'
  ]) {
    assert(dataSources.includes(marker), `DATA_SOURCES missing marker: ${marker}`);
    assert(dataContract.includes(marker), `DATA_CONTRACT missing marker: ${marker}`);
  }
  assert(signalIntake.includes('transport-shock-satellite-handling-policy-v1'), 'SIGNAL_INTAKE missing P45 marker.');
  assert(backlog.includes('Transport Shock satellite handling policy'), 'ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY missing P45 marker.');
  assert(agents.includes('Transport Shock satellite handling policy'), 'AGENTS missing P45 boundary.');
  assert(packageJson.scripts['check:transport-shock-satellite-handling-policy'], 'package.json missing P45 check script.');
  assert(checkSuite.includes('check:transport-shock-satellite-handling-policy'), 'check-suite missing P45 check.');
}

function main() {
  assertDoc();
  assertFixture();
  assertRuntimeRemainsUnwired();
  assertAuthorityDocs();
  console.log('Transport Shock satellite handling policy: PASS');
}

main();
