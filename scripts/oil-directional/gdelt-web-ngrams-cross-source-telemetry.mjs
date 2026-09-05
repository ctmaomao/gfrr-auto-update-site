import {
  classifyWebNgramsShadowArticle
} from './gdelt-web-ngrams-shadow-classifier.mjs';
import {
  buildArticleIdentity
} from './oil-news-story-identity.mjs';

export const WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT =
  'gdelt-web-ngrams-cross-source-telemetry-shadow-v2';
export const WEB_NGRAMS_LEGACY_CROSS_SOURCE_TELEMETRY_CONTRACT =
  'gdelt-web-ngrams-cross-source-telemetry-shadow-v1';

const INDEPENDENT_PROVIDERS = Object.freeze(['tavily', 'brave']);
const DIRECTIONAL_POLARITIES = new Set(['risk_escalation', 'risk_deescalation']);

function roundRate(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : null;
}

function parseTime(value) {
  const match = typeof value === 'string'
    ? value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u) : null;
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1
      || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseShadowTimestamp(value) {
  const match = typeof value === 'string' ? value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/u) : null;
  if (!match) return null;
  return parseTime(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`);
}

function dateState(value, anchorMs) {
  if (value === null || value === undefined || value === '') return 'missingDateCount';
  const time = parseTime(value);
  if (time === null) return 'invalidDateCount';
  return time > anchorMs ? 'futureDateCount' : 'validDateCount';
}

function dateCounts(rows, anchorMs) {
  const result = { totalCount: rows.length, directionalCount: 0,
    validDateCount: 0, missingDateCount: 0, invalidDateCount: 0, futureDateCount: 0 };
  for (const row of rows) {
    result[dateState(row.publishedAt, anchorMs)] += 1;
    if (DIRECTIONAL_POLARITIES.has(row.claimPolarity)) result.directionalCount += 1;
  }
  return result;
}

function providerName(value) {
  const normalized = String(value || '').toLocaleLowerCase('en-US');
  return INDEPENDENT_PROVIDERS.includes(normalized) ? normalized : null;
}

function normalizeDomain(value) {
  const domain = String(value || '').toLocaleLowerCase('en-US').replace(/^www\./u, '').replace(/\.$/u, '');
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(domain)
    ? domain : null;
}

function independentDomains(left, right) {
  const a = normalizeDomain(left);
  const b = normalizeDomain(right);
  // Reject exact and parent/child hosts. Sibling-host ownership is unknown;
  // taking the last two labels would not be a valid public-suffix algorithm.
  return Boolean(a && b && a !== b && !a.endsWith(`.${b}`) && !b.endsWith(`.${a}`));
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

function withinWindow(left, right, maxWindowHours, anchorMs) {
  const leftTime = parseTime(left);
  const rightTime = parseTime(right);
  if (leftTime === null || rightTime === null || leftTime > anchorMs || rightTime > anchorMs) return false;
  return Math.abs(leftTime - rightTime) <= maxWindowHours * 60 * 60 * 1000;
}

function buildReferenceRows(referenceArticles) {
  return (Array.isArray(referenceArticles) ? referenceArticles : []).flatMap((article) => {
    const provider = providerName(article?.source);
    if (!provider) return [];
    const identity = buildArticleIdentity(article);
    const classification = classifyWebNgramsShadowArticle(article);
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

function directionalMatch(webArticle, reference) {
  if (!DIRECTIONAL_POLARITIES.has(webArticle.claimPolarity)) return false;
  if (webArticle.claimPolarity !== reference.claimPolarity) return false;
  if (webArticle.claimAxis !== reference.claimAxis) return false;
  if (!bucketOverlap(webArticle.buckets, reference.buckets)) return false;
  return true;
}

function articleTelemetry(webArticle, references, maxWindowHours, anchorMs) {
  const exactDiscoveryRows = references.filter((reference) => (
    dateState(webArticle.publishedAt, anchorMs) === 'validDateCount'
    && dateState(reference.publishedAt, anchorMs) === 'validDateCount'
    && (
    (webArticle.canonicalUrlHash
      && reference.canonicalUrlHash === webArticle.canonicalUrlHash)
    || (webArticle.storyClusterHash
      && reference.storyClusterHash === webArticle.storyClusterHash))
  ));
  const comparableRows = references.filter((reference) => (
    withinWindow(webArticle.publishedAt, reference.publishedAt, maxWindowHours, anchorMs)
  ));
  const directionalRows = comparableRows.filter((reference) => directionalMatch(webArticle, reference));
  const independentRows = directionalRows.filter((reference) => independentDomains(webArticle.domain, reference.domain));
  const exactDiscoveryProviders = [...new Set(
    exactDiscoveryRows.map((row) => row.provider)
  )].sort();
  const independentSupportProviders = [...new Set(
    independentRows.map((row) => row.provider)
  )].sort();
  const supportHosts = [...new Set(independentRows.map((row) => normalizeDomain(row.domain)).filter(Boolean))];
  const independentSupportDomains = new Set(supportHosts.filter(host => (
    !supportHosts.some(parent => parent !== host && host.endsWith(`.${parent}`))
  )));
  return {
    canonicalUrlHash: webArticle.canonicalUrlHash,
    storyClusterHash: webArticle.storyClusterHash,
    domain: webArticle.domain,
    publishedAt: webArticle.publishedAt,
    language: webArticle.language,
    claimAxis: webArticle.claimAxis,
    claimPolarity: webArticle.claimPolarity,
    windowComparable: comparableRows.length > 0,
    directionalWindowComparable: directionalRows.length > 0,
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
  const anchorMs = parseShadowTimestamp(webShadow?.timestamp);
  if (anchorMs === null) throw new Error('Web NGrams cross-source shadow timestamp must be a real UTC calendar timestamp');
  const references = buildReferenceRows(referenceArticles);
  const articles = webArticles.map((article) => articleTelemetry(
    article,
    references,
    maxWindowHours,
    anchorMs
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
      ),
      diagnostics: {
        web: dateCounts(webArticles, anchorMs),
        reference: dateCounts(references, anchorMs),
        comparison: {
          windowComparableWebCount: articles.filter(row => row.windowComparable).length,
          directionalWindowComparableWebCount: articles.filter(row => row.directionalWindowComparable).length,
          independentDomainSupportedWebCount: independentRows.length
        }
      }
    },
    articles,
    rawContentStored: false,
    discoveryOverlapIsEventConfirmation: false,
    independentSupportIsConfirmedEvent: false,
    shadowTelemetryOnly: true,
    domainIndependenceRule: 'distinct_non_parent_child_hosts_sibling_ownership_unverified',
    currentSignalEnhancement: false,
    eventConfirmationSource: false,
    eligibleForScoring: false
  };
}
