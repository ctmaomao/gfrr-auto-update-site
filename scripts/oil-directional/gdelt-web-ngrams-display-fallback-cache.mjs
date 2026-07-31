import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_READINESS_PATH =
  'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-production-write-readiness-p55.json';
export const GDELT_WEB_NGRAMS_FRONTEND_AGGREGATE_HEALTH_PATH =
  'docs/fixtures/oil-news/gdelt-web-ngrams-frontend-aggregate-health-p63.json';
export const GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_CACHE_CONTRACT =
  'gdelt-web-ngrams-display-fallback-cache-v1';
export const GDELT_WEB_NGRAMS_AUTOMATED_DISPLAY_CACHE_CONTRACT =
  'gdelt-web-ngrams-display-fallback-cache-v2';
export const GDELT_WEB_NGRAMS_FRONTEND_AGGREGATE_HEALTH_CONTRACT =
  'gdelt-web-ngrams-frontend-aggregate-health-p63';

const ROOT = process.cwd();
const BOUNDARY =
  'production read-only GDELT Web NGrams fallback cache for ODP oil-news event watch; display-only/audit-only background source-health cache; NOT in current Oil News signal, values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';
const AUTOMATED_STALE_AFTER_HOURS = 12;

function readJson(relativePath) {
  const absolutePath = join(ROOT, relativePath);
  if (!existsSync(absolutePath)) throw new Error(`Missing GDELT Web NGrams fallback readiness fixture: ${relativePath}`);
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function productionImpact() {
  return {
    affectsValues: false,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
    affectsBrentPromotion: false,
    affectsOdpFinalBias: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  };
}

function assertNoRawExposure(value, path = '$') {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    for (const forbidden of ['http://', 'https://', '<html', '<!doctype', 'article title', 'article url', 'article body', 'rawresponse']) {
      assert(!lower.includes(forbidden), `${path} contains forbidden raw-content marker: ${forbidden}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRawExposure(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      assert(!['title', 'url', 'snippet', 'raw', 'body', 'rawResponse', 'titleHash'].includes(key), `${path}.${key} is forbidden in fallback cache`);
      assertNoRawExposure(nested, `${path}.${key}`);
    }
  }
}

function validateReadiness(readiness) {
  assert(readiness?.status === 'production_display_only_write_ready_no_production_write', 'P55 readiness status is not write-ready.');
  assert(readiness?.readinessState === 'p56_display_only_write_authorized', 'P55 readiness state does not authorize P56.');
  assert(readiness?.approvedWriteScope?.targetArtifact === 'data/oil-news-event-watch.json', 'P55 target artifact mismatch.');
  assert(readiness?.approvedWriteScope?.fieldPath === 'sourceCaches.gdeltWebNgramsFallback', 'P55 field path mismatch.');
  assert(readiness?.approvedWriteScope?.contractVersion === GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_CACHE_CONTRACT, 'P55 cache contract mismatch.');
  assert(readiness?.approvedWriteScope?.allowedWriteMode === 'single_field_display_only_cache', 'P55 write mode mismatch.');
  for (const field of ['currentSignalEnhancement', 'eventConfirmationSource', 'headlineSource', 'oilDirectionInput', 'eligibleForScoring', 'rawContentAllowed']) {
    assert(readiness.approvedWriteScope[field] === false, `P55 approvedWriteScope.${field} must be false.`);
  }
  for (const field of ['p56ProductionDataWriteApproved', 'p56ProductionWriteApproved', 'p56WriterImplementationApproved', 'p56ScopedFieldOnly']) {
    assert(readiness?.approvalState?.[field] === true, `P55 approvalState.${field} must be true.`);
  }
  for (const field of [
    'frontendImplementationApproved',
    'workflowAutomationApproved',
    'liveFetchApproved',
    'apiKeyReadApproved',
    'currentSignalEnhancementApproved',
    'scoreApproved',
    'mainScoreApproved',
    'odpFinalBiasApproved',
    'brentPromotionApproved',
    'globalRiskHeatmapApproved',
    'crossValidationApproved'
  ]) {
    assert(readiness?.approvalState?.[field] === false, `P55 approvalState.${field} must be false.`);
  }
  assert(readiness?.candidateCache?.contractVersion === GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_CACHE_CONTRACT, 'P55 candidate cache contract mismatch.');
  assert(readiness.candidateCache.currentSignalEnhancement === false, 'Candidate cache must not enhance current signal.');
  assert(readiness.candidateCache.sourceHealth?.usedForCurrentSignal === false, 'Candidate source health must not be current signal.');
  assert(readiness.candidateCache.sampleGate?.usableSampleCount >= 8, 'Candidate sample gate usable count is too low.');
  assert(readiness.candidateCache.sampleGate?.selectedTimestampCount >= 2, 'Candidate sample gate timestamp count is too low.');
  assert(readiness.candidateCache.sampleGate?.observationWindowHours >= 24, 'Candidate sample gate observation window is too short.');
  assertNoRawExposure(readiness.candidateCache, '$.candidateCache');
}

function validateFrontendApproval(approval) {
  assert(
    approval?.contractVersion === GDELT_WEB_NGRAMS_FRONTEND_AGGREGATE_HEALTH_CONTRACT,
    'P63 frontend aggregate-health contract mismatch.'
  );
  assert(approval?.status === 'frontend_aggregate_source_health_approved', 'P63 frontend status is not approved.');
  assert(
    approval?.sourceField === 'data/oil-news-event-watch.json.sourceCaches.gdeltWebNgramsFallback',
    'P63 frontend source field mismatch.'
  );
  assert(
    approval?.requiredCacheContract === GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_CACHE_CONTRACT,
    'P63 required cache contract mismatch.'
  );
  assert(approval?.displayMode === 'aggregate_source_health_only_no_headlines', 'P63 display mode mismatch.');
  assert(approval?.approvalState?.frontendAggregateHealthApproved === true, 'P63 frontend aggregate health is not approved.');
  for (const field of [
    'headlineDisplayApproved',
    'rawContentDisplayApproved',
    'currentSignalEnhancementApproved',
    'eventConfirmationApproved',
    'oilDirectionInputApproved',
    'workflowAutomationApproved',
    'liveFetchApproved',
    'scoreApproved'
  ]) {
    assert(approval?.approvalState?.[field] === false, `P63 approvalState.${field} must be false.`);
  }
  for (const [key, value] of Object.entries(approval?.productionImpact || {})) {
    assert(value === false, `P63 productionImpact.${key} must be false.`);
  }
  assertNoRawExposure(approval);
}

function assertBoundaryFields(cache) {
  for (const field of [
    'currentSignalEnhancement',
    'eventConfirmationSource',
    'headlineSource',
    'oilDirectionInput',
    'eligibleForScoring',
    'usedForCurrentOilNewsSignal',
    'usedForOdpFinalBias',
    'usedForMainScore'
  ]) {
    assert(cache[field] === false, `Fallback cache ${field} must be false.`);
  }
  assert(cache.apiKeyReadApproved === false, 'Fallback cache apiKeyReadApproved must be false.');
  assert(cache.productionDataWriteApproved === true, 'Fallback cache productionDataWriteApproved must be true.');
  assert(cache.frontendDisplayApproved === true, 'Fallback cache frontendDisplayApproved must be true.');
  assert(cache.sourceHealth?.usedForCurrentSignal === false, 'Fallback cache sourceHealth.usedForCurrentSignal must be false.');
  for (const [key, value] of Object.entries(cache.productionImpact || {})) {
    assert(value === false, `Fallback cache productionImpact.${key} must be false.`);
  }
  assert(typeof cache.boundary === 'string' && cache.boundary.includes('display-only') && cache.boundary.includes('NOT in'), 'Fallback cache boundary is missing.');
  assertNoRawExposure(cache);
}

function assertReviewedSampleGate(cache) {
  assert(cache.sampleGate?.state === 'passed', 'Fallback cache sample gate must be passed.');
  assert(Number.isFinite(cache.sampleGate.usableSampleCount) && cache.sampleGate.usableSampleCount >= 8, 'Fallback cache usable sample count is too low.');
  assert(Number.isFinite(cache.sampleGate.selectedTimestampCount) && cache.sampleGate.selectedTimestampCount >= 2, 'Fallback cache timestamp count is too low.');
  assert(Number.isFinite(cache.sampleGate.observationWindowHours) && cache.sampleGate.observationWindowHours >= 24, 'Fallback cache observation window is too short.');
}

function assertLegacyCache(cache) {
  assert(cache?.contractVersion === GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_CACHE_CONTRACT, 'Fallback cache contract mismatch.');
  assert(cache.status === 'sample_gate_passed_projection_only', `Fallback cache status invalid: ${cache.status}`);
  assert(cache.sourceKey === 'gdelt_web_ngrams_v5_legacy', 'Fallback cache sourceKey mismatch.');
  assert(cache.displayMode === 'aggregate_source_health_only_no_headlines', 'Fallback cache displayMode mismatch.');
  assert(cache.fallbackContextOnly === true, 'Fallback cache must be context-only.');
  assert(cache.workflowAutomationApproved === false, 'Legacy fallback cache workflowAutomationApproved must be false.');
  assert(cache.liveFetchApproved === false, 'Legacy fallback cache liveFetchApproved must be false.');
  assertReviewedSampleGate(cache);
  assertBoundaryFields(cache);
}

function assertAutomatedCache(cache) {
  assert(cache?.contractVersion === GDELT_WEB_NGRAMS_AUTOMATED_DISPLAY_CACHE_CONTRACT, 'Automated fallback cache contract mismatch.');
  assert(['live', 'live_no_oil_terms_observed', 'stale', 'source_unavailable'].includes(cache.status), `Automated fallback cache status invalid: ${cache.status}`);
  assert(cache.sourceKey === 'gdelt_web_ngrams_v5_legacy', 'Automated fallback cache sourceKey mismatch.');
  assert(cache.displayMode === 'aggregate_source_health_only_no_headlines', 'Automated fallback cache displayMode mismatch.');
  assert(cache.fallbackContextOnly === true, 'Automated fallback cache must be context-only.');
  assert(cache.workflowAutomationApproved === true, 'Automated fallback cache workflowAutomationApproved must be true.');
  assert(cache.liveFetchApproved === true, 'Automated fallback cache liveFetchApproved must be true.');
  assert(cache.automation?.contractVersion === 'gdelt-web-ngrams-automation-v1', 'Automated fallback cache automation contract mismatch.');
  assert(cache.automation?.workflow === 'refresh-oil-news-event-watch', 'Automated fallback cache workflow mismatch.');
  assert(typeof cache.automation?.attemptedAt === 'string' && !Number.isNaN(Date.parse(cache.automation.attemptedAt)), 'Automated fallback cache attemptedAt invalid.');
  const expectedSourceState = cache.status === 'source_unavailable'
    ? 'unavailable'
    : cache.status === 'stale'
      ? 'stale'
      : 'live';
  const expectedFreshness = expectedSourceState === 'unavailable'
    ? 'unavailable'
    : expectedSourceState === 'stale'
      ? 'stale'
      : 'fresh';
  assert(cache.sourceHealth?.state === expectedSourceState, 'Automated fallback cache sourceHealth.state must match status.');
  assert(cache.sourceHealth?.freshness === expectedFreshness, 'Automated fallback cache sourceHealth.freshness must match status.');
  for (const field of ['parsedLineCount', 'totalHitCount', 'totalMentionCount', 'uniqueDocCount', 'matchedTermCount', 'matchedBucketCount']) {
    assert(Number.isFinite(cache.aggregate?.[field]) && cache.aggregate[field] >= 0, `Automated fallback cache aggregate.${field} invalid.`);
  }
  if (cache.status === 'source_unavailable') {
    assert(cache.automation?.selectedFileTimestamp === null, 'Unavailable automated cache must clear selectedFileTimestamp.');
    assert(cache.automation?.selectedFileAgeHours === null, 'Unavailable automated cache must clear selectedFileAgeHours.');
    for (const [field, value] of Object.entries(cache.aggregate)) {
      assert(value === 0, `Unavailable automated cache aggregate.${field} must be zero.`);
    }
  } else {
    assert(/^\d{14}$/u.test(cache.automation?.selectedFileTimestamp || ''), 'Automated fallback cache selectedFileTimestamp invalid.');
    assert(Number.isFinite(cache.automation?.selectedFileAgeHours) && cache.automation.selectedFileAgeHours >= 0, 'Automated fallback cache selectedFileAgeHours invalid.');
  }
  if (cache.status === 'live') {
    assert(cache.aggregate.totalHitCount > 0, 'Live automated cache must contain at least one aggregate hit.');
  }
  if (cache.status === 'live_no_oil_terms_observed') {
    assert(cache.aggregate.totalHitCount === 0, 'No-oil-terms automated cache must have zero aggregate hits.');
  }
  assert(cache.staleAfterHours === AUTOMATED_STALE_AFTER_HOURS, 'Automated fallback cache staleAfterHours must remain fixed at 12.');
  assertReviewedSampleGate(cache);
  assertBoundaryFields(cache);
}

export function assertGdeltWebNgramsDisplayFallbackCache(cache) {
  if (cache?.contractVersion === GDELT_WEB_NGRAMS_AUTOMATED_DISPLAY_CACHE_CONTRACT) {
    assertAutomatedCache(cache);
    return;
  }
  assertLegacyCache(cache);
}

export function buildGdeltWebNgramsDisplayFallbackCache({
  generatedAt = new Date().toISOString(),
  readinessPath = GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_READINESS_PATH,
  frontendApprovalPath = GDELT_WEB_NGRAMS_FRONTEND_AGGREGATE_HEALTH_PATH
} = {}) {
  const readiness = readJson(readinessPath);
  const frontendApproval = readJson(frontendApprovalPath);
  validateReadiness(readiness);
  validateFrontendApproval(frontendApproval);
  const candidate = readiness.candidateCache;
  const cache = {
    contractVersion: GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_CACHE_CONTRACT,
    status: candidate.status,
    generatedAt,
    sourceKey: candidate.sourceKey,
    sourceReview: {
      gate: 'display_fallback_production_write_readiness',
      frontendGate: GDELT_WEB_NGRAMS_FRONTEND_AGGREGATE_HEALTH_CONTRACT,
      source: 'reviewed_fixture_candidate_cache',
      p56ScopedFieldOnly: true
    },
    displayMode: candidate.displayMode,
    fallbackContextOnly: true,
    productionDataWriteApproved: true,
    currentSignalEnhancement: false,
    eventConfirmationSource: false,
    headlineSource: false,
    oilDirectionInput: false,
    eligibleForScoring: false,
    usedForCurrentOilNewsSignal: false,
    usedForOdpFinalBias: false,
    usedForMainScore: false,
    frontendDisplayApproved: true,
    workflowAutomationApproved: false,
    liveFetchApproved: false,
    apiKeyReadApproved: false,
    staleAfterHours: candidate.staleAfterHours,
    sampleGate: {
      state: candidate.sampleGate.state,
      collectorRunId: candidate.sampleGate.collectorRunId,
      usableSampleCount: candidate.sampleGate.usableSampleCount,
      selectedTimestampCount: candidate.sampleGate.selectedTimestampCount,
      observationWindowHours: candidate.sampleGate.observationWindowHours,
      latestSelectedTimestamp: candidate.sampleGate.latestSelectedTimestamp,
      warningCount: candidate.sampleGate.warningCount,
      warningTreatment: candidate.sampleGate.warningTreatment
    },
    sourceHealth: {
      state: candidate.sourceHealth.state,
      freshness: candidate.sourceHealth.freshness,
      gdeltDocReliefRole: candidate.sourceHealth.gdeltDocReliefRole,
      usedForCurrentSignal: false
    },
    aggregate: {
      selectedTimestampCount: candidate.aggregate.selectedTimestampCount,
      usableSampleCount: candidate.aggregate.usableSampleCount,
      observationWindowHours: candidate.aggregate.observationWindowHours
    },
    limitationZh: candidate.limitationZh,
    warnings: [
      ...candidate.warnings,
      'production_display_only_cache',
      'frontend_aggregate_source_health_connected',
      'not_used_for_current_oil_news_signal'
    ],
    productionImpact: productionImpact(),
    boundary: BOUNDARY
  };
  assertGdeltWebNgramsDisplayFallbackCache(cache);
  return cache;
}

function parseNgramsTimestamp(value) {
  const match = typeof value === 'string'
    ? value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/u)
    : null;
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const timestampMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(timestampMs);
  const valid = date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second;
  return valid ? timestampMs : null;
}

function compactAutomatedAggregate(summary = {}) {
  const terms = Array.isArray(summary.terms) ? summary.terms : [];
  const bucketCounts = summary.bucketCounts && typeof summary.bucketCounts === 'object'
    ? summary.bucketCounts
    : {};
  return {
    parsedLineCount: Number.isFinite(summary.parsedLineCount) ? Math.max(0, Math.round(summary.parsedLineCount)) : 0,
    totalHitCount: Number.isFinite(summary.totalHitCount) ? Math.max(0, Math.round(summary.totalHitCount)) : 0,
    totalMentionCount: Number.isFinite(summary.totalMentionCount) ? Math.max(0, Math.round(summary.totalMentionCount)) : 0,
    uniqueDocCount: Number.isFinite(summary.uniqueDocCount) ? Math.max(0, Math.round(summary.uniqueDocCount)) : 0,
    matchedTermCount: Number.isFinite(summary.matchedTermCount)
      ? Math.max(0, Math.round(summary.matchedTermCount))
      : terms.length,
    matchedBucketCount: Number.isFinite(summary.matchedBucketCount)
      ? Math.max(0, Math.round(summary.matchedBucketCount))
      : Object.keys(bucketCounts).length
  };
}

function automatedObservationAgeHours(timestamp, nowMs) {
  const timestampMs = parseNgramsTimestamp(timestamp);
  if (!Number.isFinite(timestampMs) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.round(((nowMs - timestampMs) / 3600000) * 10) / 10);
}

function isAutomatedCache(cache) {
  if (cache?.contractVersion !== GDELT_WEB_NGRAMS_AUTOMATED_DISPLAY_CACHE_CONTRACT) return false;
  try {
    assertAutomatedCache(cache);
    return true;
  } catch {
    return false;
  }
}

export function buildGdeltWebNgramsAutomatedDisplayCache({
  diagnosis,
  previousCache = null,
  generatedAt = new Date().toISOString()
} = {}) {
  assert(diagnosis?.diagnosisVersion === 'gdelt-web-ngrams-diagnosis-p41', 'Automated cache requires a P41 diagnosis artifact.');
  assert(diagnosis?.mode === 'manual_live_diagnosis', 'Automated cache requires a live diagnosis artifact.');
  assert(diagnosis?.productionDisplayApproved === false, 'Diagnosis artifact must not approve production display by itself.');
  assert(diagnosis?.promotionEligible === false, 'Diagnosis artifact must remain non-promotable.');
  const generatedAtMs = Date.parse(generatedAt);
  assert(Number.isFinite(generatedAtMs), 'Automated cache generatedAt must be ISO.');

  const legacyGate = buildGdeltWebNgramsDisplayFallbackCache({ generatedAt });
  const prior = isAutomatedCache(previousCache) ? previousCache : null;
  const diagnosisLive = ['ok', 'ok_no_oil_terms_observed'].includes(diagnosis.status);
  const selectedTimestamp = diagnosisLive ? diagnosis.selectedFile?.timestamp : null;
  const selectedTimestampMs = parseNgramsTimestamp(selectedTimestamp);
  const selectedAgeHours = automatedObservationAgeHours(selectedTimestamp, generatedAtMs);
  const selectedTimestampValid = Number.isFinite(selectedTimestampMs)
    && selectedTimestampMs <= generatedAtMs + 3600000;
  const currentObservationUsable = diagnosisLive && selectedTimestampValid;

  let status = 'source_unavailable';
  let effectiveTimestamp = null;
  let aggregate = compactAutomatedAggregate();
  let lastSuccessfulObservationAt = prior?.automation?.lastSuccessfulObservationAt || null;
  if (currentObservationUsable) {
    status = selectedAgeHours > AUTOMATED_STALE_AFTER_HOURS
      ? 'stale'
      : diagnosis.status === 'ok_no_oil_terms_observed'
        ? 'live_no_oil_terms_observed'
        : 'live';
    effectiveTimestamp = selectedTimestamp;
    aggregate = compactAutomatedAggregate(diagnosis.summary);
    lastSuccessfulObservationAt = diagnosis.generatedAt || generatedAt;
  } else if (prior?.automation?.selectedFileTimestamp) {
    const priorAgeHours = automatedObservationAgeHours(prior.automation.selectedFileTimestamp, generatedAtMs);
    if (Number.isFinite(priorAgeHours) && priorAgeHours <= AUTOMATED_STALE_AFTER_HOURS) {
      status = 'stale';
      effectiveTimestamp = prior.automation.selectedFileTimestamp;
      aggregate = compactAutomatedAggregate(prior.aggregate);
    }
  }

  const cache = {
    contractVersion: GDELT_WEB_NGRAMS_AUTOMATED_DISPLAY_CACHE_CONTRACT,
    status,
    generatedAt,
    sourceKey: 'gdelt_web_ngrams_v5_legacy',
    sourceReview: {
      gate: 'automated_display_only_cache_v1',
      frontendGate: GDELT_WEB_NGRAMS_FRONTEND_AGGREGATE_HEALTH_CONTRACT,
      source: 'sanitized_live_diagnosis',
      priorReviewedSampleGateRetained: true
    },
    displayMode: 'aggregate_source_health_only_no_headlines',
    fallbackContextOnly: true,
    productionDataWriteApproved: true,
    currentSignalEnhancement: false,
    eventConfirmationSource: false,
    headlineSource: false,
    oilDirectionInput: false,
    eligibleForScoring: false,
    usedForCurrentOilNewsSignal: false,
    usedForOdpFinalBias: false,
    usedForMainScore: false,
    frontendDisplayApproved: true,
    workflowAutomationApproved: true,
    liveFetchApproved: true,
    apiKeyReadApproved: false,
    staleAfterHours: AUTOMATED_STALE_AFTER_HOURS,
    sampleGate: { ...legacyGate.sampleGate },
    automation: {
      contractVersion: 'gdelt-web-ngrams-automation-v1',
      workflow: 'refresh-oil-news-event-watch',
      attemptedAt: diagnosis.generatedAt || generatedAt,
      diagnosisStatus: diagnosis.status,
      selectedFileTimestamp: effectiveTimestamp,
      selectedFileAgeHours: effectiveTimestamp
        ? automatedObservationAgeHours(effectiveTimestamp, generatedAtMs)
        : null,
      lastSuccessfulObservationAt
    },
    sourceHealth: {
      state: status === 'source_unavailable' ? 'unavailable' : status === 'stale' ? 'stale' : 'live',
      freshness: status === 'source_unavailable' ? 'unavailable' : status === 'stale' ? 'stale' : 'fresh',
      gdeltDocReliefRole: 'automated_download_path_only',
      usedForCurrentSignal: false
    },
    aggregate,
    limitationZh: '自动缓存只表示 GDELT Web NGrams 下载文件的可达性与聚合短语命中,不读取或展示标题、URL、正文,不确认事件,不用于当前 Oil News 信号或油价方向。',
    warnings: [
      'automated_display_only_cache',
      'no_headlines_or_urls',
      'not_used_for_current_oil_news_signal',
      ...(status === 'source_unavailable' ? ['latest_download_unavailable'] : []),
      ...(status === 'stale' ? ['latest_observation_stale'] : [])
    ],
    productionImpact: productionImpact(),
    boundary: BOUNDARY
  };
  assertAutomatedCache(cache);
  return cache;
}

export function attachGdeltWebNgramsDisplayFallbackCache(artifact, options = {}) {
  const generatedAt = options.generatedAt || artifact?.generatedAt || new Date().toISOString();
  let cache;
  if (options.diagnosis) {
    cache = buildGdeltWebNgramsAutomatedDisplayCache({
      diagnosis: options.diagnosis,
      previousCache: options.previousCache,
      generatedAt
    });
  } else if (isAutomatedCache(options.preservedCache)) {
    cache = options.preservedCache;
  } else {
    cache = buildGdeltWebNgramsDisplayFallbackCache({ ...options, generatedAt });
  }
  return {
    ...artifact,
    sourceCaches: {
      ...(artifact?.sourceCaches && typeof artifact.sourceCaches === 'object' ? artifact.sourceCaches : {}),
      gdeltWebNgramsFallback: cache
    }
  };
}
