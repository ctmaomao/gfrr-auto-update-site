import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_READINESS_PATH =
  'docs/fixtures/oil-news/gdelt-web-ngrams-display-fallback-production-write-readiness-p55.json';
export const GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_CACHE_CONTRACT =
  'gdelt-web-ngrams-display-fallback-cache-v1';

const ROOT = process.cwd();
const BOUNDARY =
  'production read-only GDELT Web NGrams fallback cache for ODP oil-news event watch; display-only/audit-only background source-health cache; NOT in current Oil News signal, values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

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

export function assertGdeltWebNgramsDisplayFallbackCache(cache) {
  assert(cache?.contractVersion === GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_CACHE_CONTRACT, 'Fallback cache contract mismatch.');
  assert(cache.status === 'sample_gate_passed_projection_only', `Fallback cache status invalid: ${cache.status}`);
  assert(cache.sourceKey === 'gdelt_web_ngrams_v5_legacy', 'Fallback cache sourceKey mismatch.');
  assert(cache.displayMode === 'aggregate_source_health_only_no_headlines', 'Fallback cache displayMode mismatch.');
  assert(cache.fallbackContextOnly === true, 'Fallback cache must be context-only.');
  for (const field of [
    'currentSignalEnhancement',
    'eventConfirmationSource',
    'headlineSource',
    'oilDirectionInput',
    'eligibleForScoring',
    'usedForCurrentOilNewsSignal',
    'usedForOdpFinalBias',
    'usedForMainScore',
    'frontendDisplayApproved',
    'workflowAutomationApproved',
    'liveFetchApproved',
    'apiKeyReadApproved'
  ]) {
    assert(cache[field] === false, `Fallback cache ${field} must be false.`);
  }
  assert(cache.productionDataWriteApproved === true, 'Fallback cache productionDataWriteApproved must be true.');
  assert(cache.sourceHealth?.usedForCurrentSignal === false, 'Fallback cache sourceHealth.usedForCurrentSignal must be false.');
  assert(cache.sampleGate?.state === 'passed', 'Fallback cache sample gate must be passed.');
  assert(cache.sampleGate.usableSampleCount >= 8, 'Fallback cache usable sample count is too low.');
  assert(cache.sampleGate.selectedTimestampCount >= 2, 'Fallback cache timestamp count is too low.');
  assert(cache.sampleGate.observationWindowHours >= 24, 'Fallback cache observation window is too short.');
  for (const [key, value] of Object.entries(cache.productionImpact || {})) {
    assert(value === false, `Fallback cache productionImpact.${key} must be false.`);
  }
  assert(typeof cache.boundary === 'string' && cache.boundary.includes('display-only') && cache.boundary.includes('NOT in'), 'Fallback cache boundary is missing.');
  assertNoRawExposure(cache);
}

export function buildGdeltWebNgramsDisplayFallbackCache({
  generatedAt = new Date().toISOString(),
  readinessPath = GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_READINESS_PATH
} = {}) {
  const readiness = readJson(readinessPath);
  validateReadiness(readiness);
  const candidate = readiness.candidateCache;
  const cache = {
    contractVersion: GDELT_WEB_NGRAMS_DISPLAY_FALLBACK_CACHE_CONTRACT,
    status: candidate.status,
    generatedAt,
    sourceKey: candidate.sourceKey,
    sourceReview: {
      gate: 'display_fallback_production_write_readiness',
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
    frontendDisplayApproved: false,
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
      'frontend_not_connected',
      'not_used_for_current_oil_news_signal'
    ],
    productionImpact: productionImpact(),
    boundary: BOUNDARY
  };
  assertGdeltWebNgramsDisplayFallbackCache(cache);
  return cache;
}

export function attachGdeltWebNgramsDisplayFallbackCache(artifact, options = {}) {
  const generatedAt = options.generatedAt || artifact?.generatedAt || new Date().toISOString();
  const cache = buildGdeltWebNgramsDisplayFallbackCache({ ...options, generatedAt });
  return {
    ...artifact,
    sourceCaches: {
      ...(artifact?.sourceCaches && typeof artifact.sourceCaches === 'object' ? artifact.sourceCaches : {}),
      gdeltWebNgramsFallback: cache
    }
  };
}
