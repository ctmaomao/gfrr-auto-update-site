export const WEB_NGRAMS_ARTICLE_SHADOW_CACHE_CONTRACT =
  'gdelt-web-ngrams-article-shadow-cache-v1';

const STATUSES = new Set([
  'dry_run',
  'source_unavailable',
  'processing_error',
  'no_candidates',
  'shadow_partial_no_reference',
  'shadow_observation_ready'
]);

function compactAggregate(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : null;
}

export function buildWebNgramsArticleShadowCache({
  generatedAt,
  diagnosis,
  candidateSet,
  classification,
  telemetry,
  processingError = false
} = {}) {
  const selectedTimestamp = diagnosis?.selectedFile?.timestamp || null;
  let status = 'shadow_observation_ready';
  if (diagnosis?.status === 'dry_run') status = 'dry_run';
  else if (processingError) status = 'processing_error';
  else if (!selectedTimestamp) status = 'source_unavailable';
  else if (!candidateSet || candidateSet.aggregate?.candidateCount === 0) status = 'no_candidates';
  else if ((telemetry?.aggregate?.referenceArticleCount || 0) === 0) {
    status = 'shadow_partial_no_reference';
  }
  return {
    contractVersion: WEB_NGRAMS_ARTICLE_SHADOW_CACHE_CONTRACT,
    generatedAt,
    status,
    sourceFile: {
      selectedTimestamp,
      pairAvailable: Boolean(selectedTimestamp),
      sourceStatus: diagnosis?.status || 'source_unavailable'
    },
    candidateAggregate: compactAggregate(candidateSet?.aggregate),
    classificationAggregate: compactAggregate(classification?.aggregate),
    crossSourceAggregate: compactAggregate(telemetry?.aggregate),
    observationPolicy: {
      requiredObservationDays: 30,
      minimumUsableSamples: 120,
      comparisonProviders: ['tavily', 'brave'],
      comparisonWindowHours: telemetry?.comparisonWindowHours || 36
    },
    productionDataWriteApproved: true,
    workflowAutomationApproved: true,
    liveFetchApproved: true,
    apiKeyReadApproved: false,
    usesExistingOilNewsProviderResults: true,
    frontendDisplayApproved: false,
    shadowObservationOnly: true,
    currentSignalEnhancement: false,
    eventConfirmationSource: false,
    oilDirectionInput: false,
    eligibleForScoring: false,
    promotionEligible: false,
    boundary:
      'aggregate-only Web NGrams article-discovery shadow cache; no headlines or URLs; not a confirmed event; not in current Oil News signal, values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation'
  };
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

export function assertWebNgramsArticleShadowCache(cache) {
  if (cache?.contractVersion !== WEB_NGRAMS_ARTICLE_SHADOW_CACHE_CONTRACT) {
    throw new Error('Web NGrams article shadow cache contract invalid');
  }
  if (!STATUSES.has(cache.status)) {
    throw new Error(`Web NGrams article shadow cache status invalid: ${cache.status}`);
  }
  if (typeof cache.generatedAt !== 'string' || Number.isNaN(Date.parse(cache.generatedAt))) {
    throw new Error('Web NGrams article shadow cache generatedAt invalid');
  }
  const timestamp = cache.sourceFile?.selectedTimestamp;
  if (!(timestamp === null || /^\d{14}$/u.test(timestamp))) {
    throw new Error('Web NGrams article shadow cache selectedTimestamp invalid');
  }
  if (!finiteNonNegative(cache.observationPolicy?.requiredObservationDays)
      || cache.observationPolicy.requiredObservationDays < 30
      || !finiteNonNegative(cache.observationPolicy?.minimumUsableSamples)
      || cache.observationPolicy.minimumUsableSamples < 120) {
    throw new Error('Web NGrams article shadow observation policy invalid');
  }
  if (JSON.stringify(cache.observationPolicy?.comparisonProviders) !== '["tavily","brave"]') {
    throw new Error('Web NGrams article shadow comparison providers invalid');
  }
  for (const field of [
    'productionDataWriteApproved',
    'workflowAutomationApproved',
    'liveFetchApproved'
  ]) {
    if (cache[field] !== true) throw new Error(`Web NGrams article shadow ${field} must be true`);
  }
  for (const field of [
    'apiKeyReadApproved',
    'frontendDisplayApproved',
    'currentSignalEnhancement',
    'eventConfirmationSource',
    'oilDirectionInput',
    'eligibleForScoring',
    'promotionEligible'
  ]) {
    if (cache[field] !== false) throw new Error(`Web NGrams article shadow ${field} must be false`);
  }
  if (cache.shadowObservationOnly !== true) {
    throw new Error('Web NGrams article shadow must remain shadow-only');
  }
  if (cache.usesExistingOilNewsProviderResults !== true) {
    throw new Error('Web NGrams article shadow must reuse existing Oil News provider results');
  }
  const serialized = JSON.stringify(cache);
  for (const forbidden of [
    '"title":',
    '"url":',
    '"articles":',
    '"canonicalUrlHash":',
    '"storyClusterHash":',
    '"snippet":',
    '"body":',
    '"rawResponse":'
  ]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Web NGrams article shadow cache contains forbidden field ${forbidden}`);
    }
  }
  return true;
}
