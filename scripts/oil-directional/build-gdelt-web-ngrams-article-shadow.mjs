import {
  buildWebNgramsArticleCandidates,
  sanitizeWebNgramsArticleCandidates
} from './gdelt-web-ngrams-article-candidates.mjs';
import {
  buildWebNgramsArticleShadowCache,
  assertWebNgramsArticleShadowCache
} from './gdelt-web-ngrams-article-shadow-cache.mjs';
import {
  buildWebNgramsCrossSourceTelemetry
} from './gdelt-web-ngrams-cross-source-telemetry.mjs';
import {
  buildWebNgramsMultilingualShadow
} from './gdelt-web-ngrams-shadow-classifier.mjs';
import {
  buildDryRunArtifact,
  buildHeartbeatDiscoveryTimestamps,
  buildLiveArtifactFromFetched,
  fetchFirstAvailableNgrams
} from './diagnose-gdelt-web-ngrams.mjs';

export const WEB_NGRAMS_ARTICLE_SHADOW_OBSERVATION_CONTRACT =
  'gdelt-web-ngrams-article-shadow-observation-v1';

function webOptions() {
  return {
    allowNetwork: true,
    safeLagMinutes: 5,
    candidateSpacingMinutes: 5,
    maxCandidates: 18,
    discoveryHours: 12,
    maxProbes: 96,
    probeBeforeDownload: true,
    timestamp: null,
    writeOutput: false,
    strict: false,
    printJson: false
  };
}

function compactDiagnosis(diagnosis) {
  return {
    diagnosisVersion: diagnosis?.diagnosisVersion || null,
    generatedAt: diagnosis?.generatedAt || null,
    status: diagnosis?.status || 'source_unavailable',
    selectedFile: diagnosis?.selectedFile || null,
    discovery: diagnosis?.discovery || null,
    summary: diagnosis?.summary
      ? {
          parsedLineCount: diagnosis.summary.parsedLineCount,
          totalHitCount: diagnosis.summary.totalHitCount,
          totalMentionCount: diagnosis.summary.totalMentionCount,
          uniqueDocCount: diagnosis.summary.uniqueDocCount,
          bucketCounts: diagnosis.summary.bucketCounts,
          terms: (diagnosis.summary.terms || []).map((term) => ({
            termId: term.termId,
            hitCount: term.hitCount,
            totalCount: term.totalCount,
            uniqueDocCount: term.uniqueDocCount,
            buckets: term.buckets
          }))
        }
      : null
  };
}

function productionImpactFalseMap() {
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

function buildObservation({
  generatedAt,
  diagnosis,
  candidateSet,
  classification,
  telemetry,
  processingError
}) {
  return {
    contractVersion: WEB_NGRAMS_ARTICLE_SHADOW_OBSERVATION_CONTRACT,
    generatedAt,
    status: processingError
      ? 'processing_error'
      : (telemetry?.status || diagnosis?.status || 'source_unavailable'),
    diagnosis: compactDiagnosis(diagnosis),
    candidates: candidateSet ? sanitizeWebNgramsArticleCandidates(candidateSet) : null,
    classification,
    crossSourceTelemetry: telemetry,
    processingError: processingError ? 'web_ngrams_shadow_processing_error' : null,
    storesRawContent: false,
    productionImpact: productionImpactFalseMap(),
    promotionEligible: false,
    currentSignalEnhancement: false,
    eventConfirmationSource: false,
    eligibleForScoring: false,
    boundary:
      'ignored Web NGrams article-discovery shadow observation; no raw NGRAMS/TOC, title, URL, snippet, body, response, header, or secret; not a confirmed event or current Oil News signal'
  };
}

export async function buildGdeltWebNgramsArticleShadow({
  allowNetwork,
  referenceArticles,
  nowMs = Date.now(),
  fetchFirstAvailable = fetchFirstAvailableNgrams
} = {}) {
  const options = webOptions();
  const candidates = buildHeartbeatDiscoveryTimestamps(options, nowMs);
  const generatedAt = new Date(nowMs).toISOString();
  if (!allowNetwork) {
    const diagnosis = buildDryRunArtifact({ ...options, allowNetwork: false }, candidates);
    const observation = buildObservation({ generatedAt, diagnosis });
    const productionCache = buildWebNgramsArticleShadowCache({ generatedAt, diagnosis });
    assertWebNgramsArticleShadowCache(productionCache);
    return { diagnosis, observation, productionCache };
  }

  const fetched = await fetchFirstAvailable(candidates, options);
  const diagnosis = buildLiveArtifactFromFetched(options, candidates, fetched);
  let candidateSet = null;
  let classification = null;
  let telemetry = null;
  let processingError = false;
  try {
    if (fetched.timestamp && fetched.ngramsText && fetched.tocText) {
      candidateSet = buildWebNgramsArticleCandidates({
        timestamp: fetched.timestamp,
        ngramsText: fetched.ngramsText,
        tocText: fetched.tocText
      });
      classification = buildWebNgramsMultilingualShadow(candidateSet);
      telemetry = buildWebNgramsCrossSourceTelemetry({
        webShadow: classification,
        referenceArticles
      });
    }
  } catch {
    processingError = true;
    candidateSet = null;
    classification = null;
    telemetry = null;
  }
  const observation = buildObservation({
    generatedAt,
    diagnosis,
    candidateSet,
    classification,
    telemetry,
    processingError
  });
  const productionCache = buildWebNgramsArticleShadowCache({
    generatedAt,
    diagnosis,
    candidateSet,
    classification,
    telemetry,
    processingError
  });
  assertWebNgramsArticleShadowCache(productionCache);
  return { diagnosis, observation, productionCache };
}
