const FIRMS_REQUEST_POLICY_VERSION = 'firms-request-policy-1';

export const OIL_THERMAL_SAMPLE_HEALTH_GATE = Object.freeze({
  version: 'oil-thermal-sample-health-gate-p60',
  mode: 'eligible_only',
  firmsRequestPolicyVersion: FIRMS_REQUEST_POLICY_VERSION,
  requiresArtifactStatus: 'ok',
  requiresFirmsSourceStatus: 'live',
  requiresZeroFinalRequestErrors: true,
  requiresCompleteFacilityCoverage: true,
  requiresPostPolicyHealthySampleForPromotion: true
});

const FAILURE_CATEGORIES = new Set([
  'timeout',
  'network_error',
  'rate_limited',
  'server_error',
  'authentication_error',
  'request_rejected',
  'unexpected_http_status',
  'empty_response',
  'non_csv_response',
  'invalid_csv_schema',
  'response_parse_error',
  'unknown_error'
]);

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addReason(reasons, reason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function declaredFacilityCount(artifact) {
  const aggregateCount = nonNegativeInteger(artifact?.aggregate?.facilityCount);
  const coverageCount = nonNegativeInteger(artifact?.facilityCoverage?.facilityCount);
  if (aggregateCount !== null && coverageCount !== null && aggregateCount !== coverageCount) {
    return { count: null, conflict: true };
  }
  return {
    count: aggregateCount ?? coverageCount,
    conflict: false
  };
}

function sanitizedFailureCategories(requestDiagnostics) {
  const counts = isPlainObject(requestDiagnostics?.failuresByCategory)
    ? requestDiagnostics.failuresByCategory
    : {};
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([category, count]) => FAILURE_CATEGORIES.has(category) && nonNegativeInteger(count) > 0)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

export function classifyOilThermalSampleHealth(artifact) {
  const reasons = [];
  const facilities = Array.isArray(artifact?.facilities) ? artifact.facilities : [];
  const artifactStatus = typeof artifact?.status === 'string' ? artifact.status : null;
  const firmsSourceStatus = typeof artifact?.sourceStatus?.firms === 'string'
    ? artifact.sourceStatus.firms
    : null;
  const requestCount = nonNegativeInteger(artifact?.aggregate?.requestCount);
  const requestErrorCount = nonNegativeInteger(artifact?.aggregate?.requestErrorCount);
  const coverage = declaredFacilityCount(artifact);
  const requestDiagnostics = isPlainObject(artifact?.aggregate?.requestDiagnostics)
    ? artifact.aggregate.requestDiagnostics
    : null;

  if (artifactStatus !== OIL_THERMAL_SAMPLE_HEALTH_GATE.requiresArtifactStatus) {
    addReason(reasons, `artifact_status_${artifactStatus ?? 'missing'}`);
  }
  if (firmsSourceStatus !== OIL_THERMAL_SAMPLE_HEALTH_GATE.requiresFirmsSourceStatus) {
    addReason(reasons, `firms_source_status_${firmsSourceStatus ?? 'missing'}`);
  }
  if (requestCount === null || requestCount === 0) {
    addReason(reasons, 'request_count_missing_or_zero');
  }
  if (requestErrorCount === null) {
    addReason(reasons, 'request_error_count_missing');
  } else if (requestErrorCount > 0) {
    addReason(reasons, 'final_request_errors_present');
  }
  if (facilities.length === 0) {
    addReason(reasons, 'facilities_missing');
  }
  if (coverage.conflict) {
    addReason(reasons, 'declared_facility_count_conflict');
  } else if (coverage.count === null) {
    addReason(reasons, 'declared_facility_count_missing');
  } else if (coverage.count !== facilities.length) {
    addReason(reasons, 'facility_coverage_mismatch');
  }

  let facilityRequestErrorCount = 0;
  let facilityRequestErrorTelemetryComplete = facilities.length > 0;
  for (const facility of facilities) {
    const facilityErrors = nonNegativeInteger(facility?.requestErrorCount);
    if (facilityErrors === null) {
      facilityRequestErrorTelemetryComplete = false;
    } else {
      facilityRequestErrorCount += facilityErrors;
    }
    if (facility?.sourceStatus !== 'live') {
      addReason(reasons, 'facility_source_not_live');
    }
  }
  if (!facilityRequestErrorTelemetryComplete) {
    addReason(reasons, 'facility_request_error_count_missing');
  } else {
    if (facilityRequestErrorCount > 0) addReason(reasons, 'facility_request_errors_present');
    if (requestErrorCount !== null && facilityRequestErrorCount !== requestErrorCount) {
      addReason(reasons, 'facility_request_error_count_mismatch');
    }
  }

  let diagnosticsConfirmed = false;
  if (requestDiagnostics) {
    const policyVersion = typeof requestDiagnostics.policyVersion === 'string'
      ? requestDiagnostics.policyVersion
      : null;
    const logicalRequestCount = nonNegativeInteger(requestDiagnostics.logicalRequestCount);
    const failedRequestCount = nonNegativeInteger(requestDiagnostics.failedRequestCount);
    if (policyVersion !== FIRMS_REQUEST_POLICY_VERSION) {
      addReason(reasons, 'request_diagnostics_policy_unrecognized');
    }
    if (logicalRequestCount === null || requestCount === null || logicalRequestCount !== requestCount) {
      addReason(reasons, 'request_diagnostics_logical_count_mismatch');
    }
    if (failedRequestCount === null) {
      addReason(reasons, 'request_diagnostics_failed_count_missing');
    } else {
      if (failedRequestCount > 0) addReason(reasons, 'request_diagnostics_failures_present');
      if (requestErrorCount !== null && failedRequestCount !== requestErrorCount) {
        addReason(reasons, 'request_diagnostics_failed_count_mismatch');
      }
    }
    diagnosticsConfirmed = reasons.length === 0;
  }

  const eligible = reasons.length === 0;
  return {
    eligible,
    eligibilityBasis: eligible
      ? diagnosticsConfirmed
        ? 'post_policy_diagnostics_confirmed'
        : 'legacy_aggregate_health_confirmed'
      : null,
    reasons,
    artifactStatus,
    firmsSourceStatus,
    requestCount,
    requestErrorCount,
    facilityCount: facilities.length,
    declaredFacilityCount: coverage.count,
    facilityRequestErrorCount: facilityRequestErrorTelemetryComplete
      ? facilityRequestErrorCount
      : null,
    diagnosticsPolicyVersion: requestDiagnostics?.policyVersion ?? null,
    diagnosticsConfirmed,
    failureCategories: sanitizedFailureCategories(requestDiagnostics)
  };
}

export function summarizeOilThermalSampleHealth(samples) {
  const reasonCounts = {};
  const failureCategoryCounts = {};
  for (const sample of samples) {
    for (const reason of sample.health.reasons) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    }
    for (const [category, count] of Object.entries(sample.health.failureCategories)) {
      failureCategoryCounts[category] = (failureCategoryCounts[category] ?? 0) + count;
    }
  }

  const eligibleSamples = samples.filter((sample) => sample.health.eligible);
  const diagnosticsConfirmedEligibleSamples = eligibleSamples.filter(
    (sample) => sample.health.diagnosticsConfirmed
  );
  return {
    gateVersion: OIL_THERMAL_SAMPLE_HEALTH_GATE.version,
    mode: OIL_THERMAL_SAMPLE_HEALTH_GATE.mode,
    criteria: OIL_THERMAL_SAMPLE_HEALTH_GATE,
    inputSampleCount: samples.length,
    eligibleSampleCount: eligibleSamples.length,
    quarantinedSampleCount: samples.length - eligibleSamples.length,
    diagnosticsConfirmedEligibleSampleCount: diagnosticsConfirmedEligibleSamples.length,
    legacyEligibleSampleCount: eligibleSamples.length - diagnosticsConfirmedEligibleSamples.length,
    postPolicyObservationReady: diagnosticsConfirmedEligibleSamples.length > 0,
    quarantineReasonCounts: Object.fromEntries(
      Object.entries(reasonCounts).sort(([left], [right]) => left.localeCompare(right))
    ),
    failureCategoryCounts: Object.fromEntries(
      Object.entries(failureCategoryCounts).sort(([left], [right]) => left.localeCompare(right))
    )
  };
}

export function evaluateOilThermalPromotionHealthGate({
  sampleHealth,
  candidateBaselineStatus,
  facilitiesReadyForBaseline,
  facilityCount
}) {
  const reasons = [];
  if (sampleHealth?.gateVersion !== OIL_THERMAL_SAMPLE_HEALTH_GATE.version) {
    addReason(reasons, 'sample_health_gate_missing_or_unsupported');
  }
  if (sampleHealth?.mode !== OIL_THERMAL_SAMPLE_HEALTH_GATE.mode) {
    addReason(reasons, 'candidate_not_built_from_eligible_samples_only');
  }
  if (!Number.isInteger(sampleHealth?.eligibleSampleCount) || sampleHealth.eligibleSampleCount <= 0) {
    addReason(reasons, 'eligible_samples_missing');
  }
  if (
    sampleHealth?.postPolicyObservationReady !== true
    || !Number.isInteger(sampleHealth?.diagnosticsConfirmedEligibleSampleCount)
    || sampleHealth.diagnosticsConfirmedEligibleSampleCount < 1
  ) {
    addReason(reasons, 'post_policy_healthy_sample_missing');
  }
  if (candidateBaselineStatus !== 'established') {
    addReason(reasons, 'candidate_baseline_not_established');
  }
  if (
    !Number.isInteger(facilitiesReadyForBaseline)
    || !Number.isInteger(facilityCount)
    || facilityCount <= 0
    || facilitiesReadyForBaseline !== facilityCount
  ) {
    addReason(reasons, 'facility_baseline_coverage_not_ready');
  }
  return {
    gateVersion: OIL_THERMAL_SAMPLE_HEALTH_GATE.version,
    satisfied: reasons.length === 0,
    reasons
  };
}
