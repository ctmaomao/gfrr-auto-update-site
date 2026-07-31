import {
  classifyOilNewsArticle
} from './oil-news-claim-classifier.mjs';
import {
  buildArticleIdentity
} from './oil-news-story-identity.mjs';

export const WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT =
  'gdelt-web-ngrams-cross-source-telemetry-shadow-v1';

const INDEPENDENT_PROVIDERS = Object.freeze(['tavily', 'brave']);
const DIRECTIONAL_POLARITIES = new Set(['risk_escalation', 'risk_deescalation']);

function roundRate(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : null;
}

function parseTime(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function providerName(value) {
  const normalized = String(value || '').toLocaleLowerCase('en-US');
  return INDEPENDENT_PROVIDERS.includes(normalized) ? normalized : null;
}

function normalizeDomain(value) {
  return String(value || '').toLocaleLowerCase('en-US').replace(/^www\./u, '') || null;
}

function domainFromCanonicalUrl(value) {
  try {
    return normalizeDomain(new URL(value).hostname);
  } catch {
    return null;
  }
}

function bucketOverlap(left, right) {
  const rightSet = new Set(Array.isArray(right) ? right : []);
  return (Array.isArray(left) ? left : []).some((bucket) => rightSet.has(bucket));
}

function withinWindow(left, right, maxWindowHours) {
  const leftTime = parseTime(left);
  const rightTime = parseTime(right);
  if (leftTime === null || rightTime === null) return false;
  return Math.abs(leftTime - rightTime) <= maxWindowHours * 60 * 60 * 1000;
}

function buildReferenceRows(referenceArticles) {
  return (Array.isArray(referenceArticles) ? referenceArticles : []).flatMap((article) => {
    const provider = providerName(article?.source);
    if (!provider) return [];
    const identity = buildArticleIdentity(article);
    const classification = classifyOilNewsArticle(article);
    return [{
      provider,
      domain: domainFromCanonicalUrl(identity.canonicalUrl) || normalizeDomain(article?.domain),
      publishedAt: article?.publishedAt || null,
      buckets: Array.isArray(article?.buckets) ? article.buckets : [],
      canonicalUrlHash: identity.canonicalUrlHash,
      storyClusterHash: identity.storyClusterHash,
      claimAxis: classification.claimAxis,
      claimPolarity: classification.claimPolarity
    }];
  });
}

function isIndependentDirectionalSupport(webArticle, reference, maxWindowHours) {
  if (!webArticle.domain || !reference.domain || webArticle.domain === reference.domain) return false;
  if (!DIRECTIONAL_POLARITIES.has(webArticle.claimPolarity)) return false;
  if (webArticle.claimPolarity !== reference.claimPolarity) return false;
  if (webArticle.claimAxis !== reference.claimAxis) return false;
  if (!bucketOverlap(webArticle.buckets, reference.buckets)) return false;
  return withinWindow(webArticle.publishedAt, reference.publishedAt, maxWindowHours);
}

function articleTelemetry(webArticle, references, maxWindowHours) {
  const exactDiscoveryRows = references.filter((reference) => (
    (webArticle.canonicalUrlHash
      && reference.canonicalUrlHash === webArticle.canonicalUrlHash)
    || (webArticle.storyClusterHash
      && reference.storyClusterHash === webArticle.storyClusterHash)
  ));
  const independentRows = references.filter((reference) => (
    isIndependentDirectionalSupport(webArticle, reference, maxWindowHours)
  ));
  const exactDiscoveryProviders = [...new Set(
    exactDiscoveryRows.map((row) => row.provider)
  )].sort();
  const independentSupportProviders = [...new Set(
    independentRows.map((row) => row.provider)
  )].sort();
  const independentSupportDomains = new Set(
    independentRows.map((row) => row.domain).filter(Boolean)
  );
  return {
    canonicalUrlHash: webArticle.canonicalUrlHash,
    storyClusterHash: webArticle.storyClusterHash,
    domain: webArticle.domain,
    publishedAt: webArticle.publishedAt,
    language: webArticle.language,
    claimAxis: webArticle.claimAxis,
    claimPolarity: webArticle.claimPolarity,
    exactDiscoveryProviders,
    independentSupportProviders,
    independentSupportDomainCount: independentSupportDomains.size,
    independentSourceSupported: independentSupportDomains.size > 0,
    crossProviderSupported: independentSupportDomains.size >= 2
      && INDEPENDENT_PROVIDERS.every((provider) => independentSupportProviders.includes(provider))
  };
}

function countProviderSupport(rows, key) {
  return Object.fromEntries(INDEPENDENT_PROVIDERS.map((provider) => [
    provider,
    rows.filter((row) => row[key].includes(provider)).length
  ]));
}

export function buildWebNgramsCrossSourceTelemetry({
  webShadow,
  referenceArticles,
  maxWindowHours = 36
} = {}) {
  if (!Number.isInteger(maxWindowHours) || maxWindowHours < 1 || maxWindowHours > 168) {
    throw new Error('Web NGrams cross-source maxWindowHours must be an integer from 1 to 168');
  }
  const webArticles = Array.isArray(webShadow?.articles) ? webShadow.articles : [];
  const references = buildReferenceRows(referenceArticles);
  const articles = webArticles.map((article) => articleTelemetry(
    article,
    references,
    maxWindowHours
  ));
  const exactDiscoveryRows = articles.filter((article) => article.exactDiscoveryProviders.length > 0);
  const independentRows = articles.filter((article) => article.independentSourceSupported);
  const crossProviderRows = articles.filter((article) => article.crossProviderSupported);
  return {
    contractVersion: WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT,
    classificationContractVersion: webShadow?.contractVersion || null,
    timestamp: webShadow?.timestamp || null,
    status: articles.length > 0 ? 'cross_source_shadow_ready' : 'no_web_candidates',
    comparisonWindowHours: maxWindowHours,
    aggregate: {
      webCandidateCount: articles.length,
      referenceArticleCount: references.length,
      excludedReferenceArticleCount: Math.max(
        0,
        (Array.isArray(referenceArticles) ? referenceArticles.length : 0) - references.length
      ),
      exactDiscoveryMatchCount: exactDiscoveryRows.length,
      exactDiscoveryMatchRate: roundRate(exactDiscoveryRows.length, articles.length),
      independentSupportCandidateCount: independentRows.length,
      independentSupportRate: roundRate(independentRows.length, articles.length),
      crossProviderSupportCandidateCount: crossProviderRows.length,
      crossProviderSupportRate: roundRate(crossProviderRows.length, articles.length),
      providerDiscoveryCounts: countProviderSupport(articles, 'exactDiscoveryProviders'),
      providerIndependentSupportCounts: countProviderSupport(
        articles,
        'independentSupportProviders'
      )
    },
    articles,
    rawContentStored: false,
    discoveryOverlapIsEventConfirmation: false,
    independentSupportIsConfirmedEvent: false,
    shadowTelemetryOnly: true,
    currentSignalEnhancement: false,
    eventConfirmationSource: false,
    eligibleForScoring: false
  };
}
