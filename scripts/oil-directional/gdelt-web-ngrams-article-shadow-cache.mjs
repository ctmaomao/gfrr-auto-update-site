import {
  WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT,
  WEB_NGRAMS_LEGACY_CROSS_SOURCE_TELEMETRY_CONTRACT
} from './gdelt-web-ngrams-cross-source-telemetry.mjs';

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
    crossSourceTelemetryContractVersion: telemetry?.contractVersion || WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT,
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

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new Error(`Web NGrams v2 ${label} fields invalid`);
  }
}

function count(value) { return Number.isSafeInteger(value) && value >= 0; }

function assertDiagnostics(aggregate, candidateCount) {
  exactKeys(aggregate, ['webCandidateCount', 'referenceArticleCount', 'excludedReferenceArticleCount',
    'exactDiscoveryMatchCount', 'exactDiscoveryMatchRate', 'independentSupportCandidateCount',
    'independentSupportRate', 'crossProviderSupportCandidateCount', 'crossProviderSupportRate',
    'providerDiscoveryCounts', 'providerIndependentSupportCounts', 'diagnostics'], 'aggregate');
  const n = aggregate.webCandidateCount;
  if (!count(n) || n !== candidateCount || !count(aggregate.referenceArticleCount)
      || !count(aggregate.excludedReferenceArticleCount)) throw new Error('Web NGrams v2 candidate/reference count invalid');
  for (const [key, rateKey] of [['exactDiscoveryMatchCount', 'exactDiscoveryMatchRate'],
    ['independentSupportCandidateCount', 'independentSupportRate'],
    ['crossProviderSupportCandidateCount', 'crossProviderSupportRate']]) {
    if (!count(aggregate[key]) || aggregate[key] > n
        || aggregate[rateKey] !== (n ? Math.round(aggregate[key] / n * 10000) / 10000 : null)) {
      throw new Error('Web NGrams v2 support counts/rates inconsistent');
    }
  }
  if (aggregate.crossProviderSupportCandidateCount > aggregate.independentSupportCandidateCount) {
    throw new Error('Web NGrams v2 cross-provider support exceeds independent support');
  }
  for (const key of ['providerDiscoveryCounts', 'providerIndependentSupportCounts']) {
    exactKeys(aggregate[key], ['tavily', 'brave'], 'provider counts');
    const limit = key === 'providerDiscoveryCounts' ? aggregate.exactDiscoveryMatchCount : aggregate.independentSupportCandidateCount;
    if (Object.values(aggregate[key]).some(value => !count(value) || value > limit)) {
      throw new Error('Web NGrams v2 provider count invalid');
    }
  }
  const diagnostics = aggregate.diagnostics;
  exactKeys(diagnostics, ['web', 'reference', 'comparison'], 'diagnostics');
  for (const [key, total] of [['web', n], ['reference', aggregate.referenceArticleCount]]) {
    const row = diagnostics[key];
    exactKeys(row, ['totalCount', 'directionalCount', 'validDateCount', 'missingDateCount',
      'invalidDateCount', 'futureDateCount'], 'date diagnostics');
    if (Object.values(row).some(value => !count(value)) || row.totalCount !== total
        || row.directionalCount > total || row.validDateCount + row.missingDateCount
          + row.invalidDateCount + row.futureDateCount !== total) {
      throw new Error('Web NGrams v2 date diagnostic counts inconsistent');
    }
  }
  const comparisons = diagnostics.comparison;
  exactKeys(comparisons, ['windowComparableWebCount', 'directionalWindowComparableWebCount',
    'independentDomainSupportedWebCount'], 'comparison diagnostics');
  if (Object.values(comparisons).some(value => !count(value))
      || comparisons.windowComparableWebCount > diagnostics.web.validDateCount
      || comparisons.directionalWindowComparableWebCount > comparisons.windowComparableWebCount
      || comparisons.directionalWindowComparableWebCount > diagnostics.web.directionalCount
      || comparisons.independentDomainSupportedWebCount > comparisons.directionalWindowComparableWebCount
      || comparisons.independentDomainSupportedWebCount !== aggregate.independentSupportCandidateCount
      || (diagnostics.reference.validDateCount === 0 && comparisons.windowComparableWebCount !== 0)) {
    throw new Error('Web NGrams v2 comparison diagnostic counts inconsistent');
  }
}

function parseNgramsTimestamp(value) {
  const match = typeof value === 'string'
    ? value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/u)
    : null;
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const timestampMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const date = new Date(timestampMs);
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second
    ? timestampMs
    : null;
}

export function assertWebNgramsArticleShadowCache(cache) {
  if (cache?.contractVersion !== WEB_NGRAMS_ARTICLE_SHADOW_CACHE_CONTRACT) {
    throw new Error('Web NGrams article shadow cache contract invalid');
  }
  const telemetryVersion = cache.crossSourceTelemetryContractVersion;
  if (telemetryVersion !== undefined && telemetryVersion !== WEB_NGRAMS_LEGACY_CROSS_SOURCE_TELEMETRY_CONTRACT
      && telemetryVersion !== WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT) {
    throw new Error('Web NGrams article shadow telemetry version invalid');
  }
  if (!STATUSES.has(cache.status)) {
    throw new Error(`Web NGrams article shadow cache status invalid: ${cache.status}`);
  }
  if (typeof cache.generatedAt !== 'string' || Number.isNaN(Date.parse(cache.generatedAt))) {
    throw new Error('Web NGrams article shadow cache generatedAt invalid');
  }
  const generatedAtMs = Date.parse(cache.generatedAt);
  const timestamp = cache.sourceFile?.selectedTimestamp;
  const timestampMs = timestamp === null ? null : parseNgramsTimestamp(timestamp);
  if (!(timestamp === null || Number.isFinite(timestampMs))) {
    throw new Error('Web NGrams article shadow cache selectedTimestamp invalid');
  }
  if (Number.isFinite(timestampMs) && timestampMs > generatedAtMs + 60 * 60 * 1000) {
    throw new Error('Web NGrams article shadow cache selectedTimestamp is in the future');
  }
  if (cache.sourceFile?.pairAvailable !== Boolean(timestamp)) {
    throw new Error('Web NGrams article shadow cache pair availability mismatch');
  }
  if (cache.observationPolicy?.requiredObservationDays !== 30
      || cache.observationPolicy?.minimumUsableSamples !== 120
      || !Number.isInteger(cache.observationPolicy?.comparisonWindowHours)
      || cache.observationPolicy.comparisonWindowHours < 1
      || cache.observationPolicy.comparisonWindowHours > 168) {
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
  const candidateCount = cache.candidateAggregate?.candidateCount;
  const referenceArticleCount = cache.crossSourceAggregate?.referenceArticleCount;
  if (cache.status === 'shadow_observation_ready') {
    if (!finiteNonNegative(candidateCount) || candidateCount < 1
        || !finiteNonNegative(referenceArticleCount) || referenceArticleCount < 1
        || !cache.classificationAggregate) {
      throw new Error('Web NGrams ready shadow cache aggregates are incomplete');
    }
  }
  if (cache.status === 'shadow_partial_no_reference') {
    if (!finiteNonNegative(candidateCount) || candidateCount < 1
        || referenceArticleCount !== 0 || !cache.classificationAggregate) {
      throw new Error('Web NGrams partial shadow cache aggregates are inconsistent');
    }
  }
  if (cache.status === 'no_candidates' && candidateCount !== 0) {
    throw new Error('Web NGrams no-candidates shadow cache count is inconsistent');
  }
  if (cache.status === 'source_unavailable' && cache.sourceFile.pairAvailable !== false) {
    throw new Error('Web NGrams unavailable shadow cache cannot claim a pair');
  }
  if (telemetryVersion === WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT) {
    if (cache.crossSourceAggregate) assertDiagnostics(cache.crossSourceAggregate, candidateCount);
    else if (['shadow_observation_ready', 'shadow_partial_no_reference', 'no_candidates'].includes(cache.status)) {
      throw new Error('Web NGrams v2 telemetry aggregate missing');
    }
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
