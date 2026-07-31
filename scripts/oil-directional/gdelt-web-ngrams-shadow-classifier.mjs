import {
  CLAIM_AXES,
  EVENT_TYPES,
  POLARITIES,
  claimAxis,
  countBy,
  eventType,
  fillCounts,
  sourceTier
} from './oil-news-claim-classifier.mjs';
import {
  matchWebNgramsDirectionalRules,
  WEB_NGRAMS_QUERY_SET_VERSION,
  WEB_NGRAMS_SUPPORTED_LANGUAGES
} from './oil-news-query-taxonomy.mjs';

export const WEB_NGRAMS_SHADOW_CLASSIFICATION_CONTRACT =
  'gdelt-web-ngrams-multilingual-classification-shadow-v1';

function baseLanguage(value) {
  const normalized = String(value || '').toLocaleLowerCase('en-US');
  return normalized.split('-')[0] || 'und';
}

function polarityFromHits(article, hits) {
  const polarities = new Set(hits.map(({ rule }) => rule.polarity));
  if (polarities.has('risk_escalation') && polarities.has('risk_deescalation')) {
    return 'mixed_or_contested';
  }
  if (polarities.has('risk_deescalation')) return 'risk_deescalation';
  if (polarities.has('risk_escalation')) return 'risk_escalation';
  if (Array.isArray(article?.buckets) && article.buckets.includes('market_reaction')) {
    return 'market_reaction_only';
  }
  return 'unclear_or_high_claim';
}

export function classifyWebNgramsShadowArticle(article) {
  const hits = matchWebNgramsDirectionalRules(article?.title);
  const type = eventType(article);
  const language = baseLanguage(article?.language);
  return {
    canonicalUrlHash: article?.canonicalUrlHash || null,
    storyClusterHash: article?.storyClusterHash || null,
    domain: article?.domain || null,
    publishedAt: article?.publishedAt || null,
    language,
    sourceTier: sourceTier(article?.domain),
    eventType: type,
    claimAxis: claimAxis(type),
    claimPolarity: polarityFromHits(article, hits),
    directionalRuleIds: [...new Set(hits.map(({ rule }) => rule.id))].sort(),
    matchedRuleLanguages: [...new Set(hits.map(({ rule }) => rule.language))].sort(),
    matchedTermIds: Array.isArray(article?.matchedTermIds)
      ? [...new Set(article.matchedTermIds)].sort()
      : [],
    buckets: Array.isArray(article?.buckets)
      ? [...new Set(article.buckets)].sort()
      : []
  };
}

function countLanguages(rows) {
  return Object.fromEntries(
    Object.entries(countBy(rows, 'language')).sort(([left], [right]) => left.localeCompare(right))
  );
}

export function buildWebNgramsMultilingualShadow(candidateSet) {
  const sourceArticles = Array.isArray(candidateSet?.articles) ? candidateSet.articles : [];
  const articles = sourceArticles.map(classifyWebNgramsShadowArticle);
  const directionalArticles = articles.filter((article) => (
    article.claimPolarity === 'risk_escalation'
    || article.claimPolarity === 'risk_deescalation'
    || article.claimPolarity === 'mixed_or_contested'
  ));
  const supportedLanguageArticles = articles.filter((article) => (
    WEB_NGRAMS_SUPPORTED_LANGUAGES.includes(article.language)
  ));
  const supportedLanguageDirectionalArticles = directionalArticles.filter((article) => (
    WEB_NGRAMS_SUPPORTED_LANGUAGES.includes(article.language)
  ));
  return {
    contractVersion: WEB_NGRAMS_SHADOW_CLASSIFICATION_CONTRACT,
    querySetVersion: WEB_NGRAMS_QUERY_SET_VERSION,
    candidateContractVersion: candidateSet?.contractVersion || null,
    timestamp: candidateSet?.timestamp || null,
    status: articles.length > 0 ? 'classified_shadow_ready' : 'no_candidates',
    aggregate: {
      candidateCount: articles.length,
      directionalArticleCount: directionalArticles.length,
      supportedLanguageCandidateCount: supportedLanguageArticles.length,
      supportedLanguageDirectionalCount: supportedLanguageDirectionalArticles.length,
      supportedLanguageCoverageRate: articles.length > 0
        ? Math.round((supportedLanguageArticles.length / articles.length) * 10000) / 10000
        : null,
      languageCounts: countLanguages(articles),
      polarityCounts: fillCounts(POLARITIES, countBy(articles, 'claimPolarity')),
      eventTypeCounts: fillCounts(EVENT_TYPES, countBy(articles, 'eventType')),
      claimAxisCounts: fillCounts(CLAIM_AXES, countBy(articles, 'claimAxis'))
    },
    articles,
    rawContentStored: false,
    multilingualClassificationShadowOnly: true,
    currentSignalEnhancement: false,
    eventConfirmationSource: false,
    eligibleForScoring: false
  };
}
