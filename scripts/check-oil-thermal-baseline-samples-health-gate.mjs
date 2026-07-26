#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import {
  classifyOilThermalSampleHealth,
  evaluateOilThermalPromotionHealthGate
} from './oil-directional/oil-thermal-sample-health.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function buildSample({
  generatedAt,
  status,
  aggregateRequestErrorCount = 0,
  requestDiagnostics = null,
  facilityRequestErrorCount = 0,
  sourceStatus = 'live',
  rowCount = 4,
  maxFrp = 8
}) {
  return {
    schemaVersion: 'oil-thermal-watch-1',
    module: 'oil-thermal-watch',
    generatedAt,
    status,
    signalState: status === 'ok' ? 'baseline_building_watch' : status,
    sourceStatus: {
      firms: status === 'ok' ? 'live' : status === 'partial' ? 'partial' : 'error'
    },
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      affectsValues: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsBrentPromotion: false,
      affectsOdpFinalBias: false,
      affectsGlobalRiskHeatmap: false,
      affectsCrossValidation: false
    },
    aggregate: {
      facilityCount: 1,
      requestCount: 3,
      requestErrorCount: aggregateRequestErrorCount,
      ...(requestDiagnostics ? { requestDiagnostics } : {})
    },
    facilities: [
      {
        id: 'synthetic_refinery_alpha',
        label: 'Synthetic Refinery Alpha',
        region: 'Fixture region',
        assetType: 'refinery',
        sourceStatus,
        requestErrorCount: facilityRequestErrorCount,
        sourceAgreement: '2/3',
        rowCount,
        latestAcqAt: '2026-06-20T22:00:00Z',
        maxFrp,
        highConfidenceCount: 1,
        frpOver50Count: 0,
        frpOver100Count: 0,
        baselineComparison: {
          sourcesWithDetections: 2
        }
      }
    ],
    boundary: 'fixture only; not production data'
  };
}

function runReview(inputs) {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/oil-directional/review-oil-thermal-baseline-samples.mjs',
      ...inputs.flatMap((input) => ['--input', input]),
      '--min-samples',
      '1',
      '--json',
      '--no-output'
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8'
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`review-oil-thermal-baseline-samples failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(String(result.stdout));
}

function runPromote({ reviewPath, readinessPath }) {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/oil-directional/promote-oil-thermal-baseline-candidate.mjs',
      '--review',
      reviewPath,
      '--readiness',
      readinessPath,
      '--json'
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8'
    }
  );
  return {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? '')
  };
}

const tempRoot = resolve(tmpdir());
const tempDir = mkdtempSync(join(tempRoot, 'gfrr-oil-thermal-health-gate-'));
const promotionTempRoot = resolve('manual-artifacts/oil-thermal');
mkdirSync(promotionTempRoot, { recursive: true });
const promotionTempDir = mkdtempSync(join(promotionTempRoot, 'check-health-gate-'));

try {
  const recoveredSample = buildSample({
    generatedAt: '2026-06-19T00:00:00.000Z',
    status: 'ok',
    requestDiagnostics: {
      policyVersion: 'firms-request-policy-1',
      logicalRequestCount: 3,
      failedRequestCount: 0,
      retryCount: 1,
      recoveredAfterRetryCount: 1,
      failuresByCategory: {}
    }
  });
  const recoveredHealth = classifyOilThermalSampleHealth(recoveredSample);
  assert(recoveredHealth.eligible === true, 'fully recovered bounded retry should remain health-eligible');
  assert(recoveredHealth.diagnosticsConfirmed === true, 'post-policy diagnostics should be confirmed');

  const mismatchedDiagnostics = structuredClone(recoveredSample);
  mismatchedDiagnostics.aggregate.requestDiagnostics.logicalRequestCount = 2;
  const mismatchedHealth = classifyOilThermalSampleHealth(mismatchedDiagnostics);
  assert(mismatchedHealth.eligible === false, 'diagnostic/request-count mismatch should fail closed');
  assert(
    mismatchedHealth.reasons.includes('request_diagnostics_logical_count_mismatch'),
    'diagnostic/request-count mismatch should retain a bounded reason'
  );

  const noPostPolicyGate = evaluateOilThermalPromotionHealthGate({
    sampleHealth: {
      gateVersion: 'oil-thermal-sample-health-gate-p60',
      mode: 'eligible_only',
      eligibleSampleCount: 3,
      postPolicyObservationReady: false
    },
    candidateBaselineStatus: 'established',
    facilitiesReadyForBaseline: 1,
    facilityCount: 1
  });
  assert(noPostPolicyGate.satisfied === false, 'promotion should hold without a healthy P59 sample');
  assert(
    noPostPolicyGate.reasons.includes('post_policy_healthy_sample_missing'),
    'promotion hold should explain the missing post-policy healthy sample'
  );

  const healthyPath = join(tempDir, 'healthy.json');
  const partialPath = join(tempDir, 'partial.json');
  const unavailablePath = join(tempDir, 'unavailable.json');
  const unverifiablePath = join(tempDir, 'unverifiable.json');

  writeFileSync(healthyPath, `${JSON.stringify(buildSample({
    generatedAt: '2026-06-20T00:00:00.000Z',
    status: 'ok',
    aggregateRequestErrorCount: 0,
    requestDiagnostics: {
      policyVersion: 'firms-request-policy-1',
      logicalRequestCount: 3,
      failedRequestCount: 0,
      failuresByCategory: {}
    }
  }), null, 2)}\n`, 'utf8');
  writeFileSync(partialPath, `${JSON.stringify(buildSample({
    generatedAt: '2026-06-21T00:00:00.000Z',
    status: 'partial',
    aggregateRequestErrorCount: 1,
    facilityRequestErrorCount: 1,
    sourceStatus: 'error',
    rowCount: 40,
    maxFrp: 80
  }), null, 2)}\n`, 'utf8');
  writeFileSync(unavailablePath, `${JSON.stringify(buildSample({
    generatedAt: '2026-06-22T00:00:00.000Z',
    status: 'source_unavailable',
    aggregateRequestErrorCount: 3,
    facilityRequestErrorCount: 3,
    sourceStatus: 'error'
  }), null, 2)}\n`, 'utf8');

  const unverifiable = buildSample({
    generatedAt: '2026-06-23T00:00:00.000Z',
    status: 'ok',
    aggregateRequestErrorCount: 0
  });
  delete unverifiable.aggregate.requestErrorCount;
  delete unverifiable.aggregate.requestCount;
  delete unverifiable.facilities[0].requestErrorCount;
  writeFileSync(unverifiablePath, `${JSON.stringify(unverifiable, null, 2)}\n`, 'utf8');

  const mixedReview = runReview([healthyPath, partialPath, unavailablePath]);
  assert(mixedReview.reviewVersion === 'oil-thermal-baseline-samples-review-p26', 'reviewVersion should bump to p26');
  assert(mixedReview.status === 'warn', 'mixed review should warn');
  assert(mixedReview.recommendation === 'baseline_candidate_ready_with_warnings', 'unsafe temporary paths should remain the only review warning');
  assert(mixedReview.summary.totalSampleCount === 3, 'mixed review totalSampleCount should be 3');
  assert(mixedReview.summary.sampleCount === 1, 'mixed review eligible sampleCount should be 1');
  assert(mixedReview.summary.quarantinedSampleCount === 2, 'mixed review quarantinedSampleCount should be 2');
  assert(mixedReview.summary.sampleEligibility.quarantinedByReason.artifact_status_partial === 1, 'partial sample should be quarantined');
  assert(mixedReview.summary.sampleEligibility.quarantinedByReason.artifact_status_source_unavailable === 1, 'source_unavailable sample should be quarantined');
  assert(mixedReview.summary.facilityP95ChangedCountAfterQuarantine === 1, 'health gate should report facility p95 change');
  assert(Array.isArray(mixedReview.facilities) && mixedReview.facilities[0].quarantinedSampleCount === 2, 'facility row should track quarantined sample count');
  assert(mixedReview.sampleHealth.promotionGate.satisfied === true, 'one healthy post-policy sample should satisfy the shared promotion health gate');

  const unverifiableReview = runReview([healthyPath, unverifiablePath]);
  assert(unverifiableReview.summary.totalSampleCount === 2, 'unverifiable review totalSampleCount should be 2');
  assert(unverifiableReview.summary.sampleCount === 1, 'unverifiable sample should be excluded from eligible sample count');
  assert(unverifiableReview.summary.sampleEligibility.quarantinedByReason.request_count_missing_or_zero === 1, 'missing request count should fail closed');
  assert(unverifiableReview.summary.sampleEligibility.quarantinedByReason.request_error_count_missing === 1, 'missing request error count should fail closed');

  const fixtureCheck = JSON.parse(readFileSync('docs/fixtures/oil-thermal/oil-thermal-watch-sample-a.json', 'utf8'));
  assert(fixtureCheck.aggregate?.requestErrorCount === 0, 'fixture health evidence should be present');

  const establishedReview = runReview([
    'docs/fixtures/oil-thermal/oil-thermal-watch-sample-a.json',
    'docs/fixtures/oil-thermal/oil-thermal-watch-sample-b.json',
    'docs/fixtures/oil-thermal/oil-thermal-watch-sample-c.json'
  ]);
  const oldReviewPath = join(promotionTempDir, 'review-old-version.json');
  const gateHoldReviewPath = join(promotionTempDir, 'review-gate-hold.json');
  const inconsistentGateReviewPath = join(promotionTempDir, 'review-inconsistent-gate.json');
  const readinessPath = join(promotionTempDir, 'readiness.json');
  const oldVersionReview = structuredClone(establishedReview);
  oldVersionReview.reviewVersion = 'oil-thermal-baseline-samples-review-p25';
  writeFileSync(oldReviewPath, `${JSON.stringify(oldVersionReview, null, 2)}\n`, 'utf8');

  const gateHoldReview = structuredClone(establishedReview);
  gateHoldReview.sampleHealth.postPolicyObservationReady = false;
  gateHoldReview.sampleHealth.diagnosticsConfirmedEligibleSampleCount = 0;
  gateHoldReview.sampleHealth.promotionGate = {
    gateVersion: 'oil-thermal-sample-health-gate-p60',
    satisfied: false,
    reasons: ['post_policy_healthy_sample_missing']
  };
  writeFileSync(gateHoldReviewPath, `${JSON.stringify(gateHoldReview, null, 2)}\n`, 'utf8');

  const inconsistentGateReview = structuredClone(establishedReview);
  inconsistentGateReview.sampleHealth.postPolicyObservationReady = true;
  inconsistentGateReview.sampleHealth.diagnosticsConfirmedEligibleSampleCount = 0;
  writeFileSync(
    inconsistentGateReviewPath,
    `${JSON.stringify(inconsistentGateReview, null, 2)}\n`,
    'utf8'
  );

  const readiness = {
    prepVersion: 'oil-thermal-baseline-readiness-p47',
    generatedAt: '2026-06-22T12:00:00.000Z',
    dryRun: true,
    status: 'ok',
    recommendation: 'baseline_candidate_ready_for_manual_promotion_review',
    promotionEligible: false,
    productionBaselineWriteApproved: false,
    review: {
      sampleCount: establishedReview.summary.sampleCount,
      totalSampleCount: establishedReview.summary.totalSampleCount,
      quarantinedSampleCount: establishedReview.summary.quarantinedSampleCount,
      facilityCount: establishedReview.summary.facilityCount,
      facilitiesReadyForBaseline: establishedReview.summary.facilitiesReadyForBaseline,
      blockers: establishedReview.blockers.length,
      warnings: establishedReview.warnings.length
    },
    sampleHealth: structuredClone(establishedReview.sampleHealth),
    notReadyFacilityIds: [],
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      affectsValues: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsBrentPromotion: false,
      affectsOdpFinalBias: false,
      affectsGlobalRiskHeatmap: false,
      affectsCrossValidation: false
    }
  };
  writeFileSync(readinessPath, `${JSON.stringify(readiness, null, 2)}\n`, 'utf8');

  const oldVersionPromotion = runPromote({
    reviewPath: oldReviewPath,
    readinessPath
  });
  assert(oldVersionPromotion.status === 1, 'old-version review artifact must not promote');
  assert(
    `${oldVersionPromotion.stderr}\n${oldVersionPromotion.stdout}`.includes('Unsupported reviewVersion'),
    'old-version review artifact should fail on unsupported reviewVersion'
  );

  const gateHoldPromotion = runPromote({
    reviewPath: gateHoldReviewPath,
    readinessPath
  });
  assert(gateHoldPromotion.status === 1, 'missing post-policy healthy sample must not promote');
  assert(
    `${gateHoldPromotion.stderr}\n${gateHoldPromotion.stdout}`.includes('post_policy_healthy_sample_missing'),
    'missing post-policy healthy sample should fail closed with explicit reason'
  );

  const inconsistentGatePromotion = runPromote({
    reviewPath: inconsistentGateReviewPath,
    readinessPath
  });
  assert(inconsistentGatePromotion.status === 1, 'inconsistent post-policy sample health must not promote');
  assert(
    `${inconsistentGatePromotion.stderr}\n${inconsistentGatePromotion.stdout}`.includes('post_policy_healthy_sample_missing'),
    'zero diagnostics-confirmed eligible samples should fail closed even when the ready flag is true'
  );

  console.log('check-oil-thermal-baseline-samples-health-gate: PASS');
} finally {
  if (!resolve(tempDir).startsWith(`${tempRoot}${sep}`)) {
    throw new Error(`Refusing to remove unexpected temp path: ${tempDir}`);
  }
  rmSync(tempDir, { recursive: true, force: true });
  if (resolve(promotionTempDir).startsWith(`${promotionTempRoot}${sep}`)) {
    rmSync(promotionTempDir, { recursive: true, force: true });
  }
}
