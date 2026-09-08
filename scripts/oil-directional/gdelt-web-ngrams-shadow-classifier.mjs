import { buildOilNewsEventSignature } from './oil-news-event-signature.mjs';
import { normalizeAbsoluteNewsTime } from './oil-news-time.mjs';
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
  normalizeMultilingualText,
  WEB_NGRAMS_DIRECTIONAL_RULES,
  WEB_NGRAMS_QUERY_SET_VERSION,
  WEB_NGRAMS_SUPPORTED_LANGUAGES
} from './oil-news-query-taxonomy.mjs';

export const WEB_NGRAMS_SHADOW_CLASSIFICATION_CONTRACT =
  'gdelt-web-ngrams-multilingual-classification-shadow-v3';

// Shadow-only inflections: do not change discovery queries or the production
// Oil News classifier. Explicit forms avoid substring/stemming false positives.
const SHADOW_RULES = WEB_NGRAMS_DIRECTIONAL_RULES.map(rule => ({
  ...rule,
  patterns: [...rule.patterns, ...(rule.id === 'escalation_en' ? [
    'attacks', 'attacked', 'attacking', 'strikes', 'struck', 'striking',
    'blockaded', 'closures', 'shutdowns', 'halts', 'halted', 'disrupted',
    'disrupts', 'disruptions', 'explosions', 'fires', 'outages'
  ] : rule.id === 'deescalation_en' ? [
    'reopens', 'reopening', 'resumes', 'resuming', 'restarts', 'restarted',
    'restarting', 'restore', 'restores', 'restoring', 'waivers', 'ceasefires'
  ] : [])]
}));

// A body-level bucket cannot lend oil/transport relevance to an unrelated
// headline (e.g. a pond restoration story mentioning a road tanker). These are
// conservative title anchors, not entity extraction or proof of an oil event.
const TITLE_TOPIC_RE = /(?<![\p{L}\p{N}])(?:hormuz|ormuz|suez|red sea|bab el[ -]mandeb|tankers?|vlcc|refiner(?:y|ies)|oil (?:prices?|exports?|suppl(?:y|ies)|production|terminals?|pipelines?|sanctions)|crude oil|brent crude|wti crude|shadow fleet|shipping insurance|lng|petroleros?|refineria|petroleo|oleoducto|mar rojo|buque cisterna|ормуз\p{L}*|танкер\p{L}*|нефт\p{L}*|нпз|нефтепровод\p{L}*|هرمز|ناقل\p{L}*|النفط|مصفاة|المصفاة)(?![\p{L}\p{N}])|霍尔木兹|苏伊士|曼德海峡|红海|油轮|原油|油价|炼厂|炼油厂|石油|输油|航运保险|影子船队/u;
const NON_OIL_TANKER_RE = /\b(?:water|road|milk|sewage|septic) tanker|\btanker truck|水罐车|洒水车/u;
const OTHER_OIL_TOPIC_RE = /\b(?:hormuz|crude oil|refinery|oil pipeline)\b|霍尔木兹|原油|炼厂/u;
const DENIAL_RE = /\b(?:no|not|never|without|deny|denies|denied|denial|rejects?|rejected|dismiss(?:es|ed)?|disputes?|disputed|false|debunked|hoax|unfounded|didn['’]t|isn['’]t|wasn['’]t|hasn['’]t)\b|否认|辟谣|没有|并非|不会|并不|未(?:曾|能|有|遭|被|发生|出现|关闭|封锁|恢复|重开|重启|停运|中断|袭击|停火)|(?<!\p{L})(?:не|нет|опроверг\p{L}*|отрица\p{L}*|لم|لن|لا|ليس|نفي|ينفي|نفت|niega|niegan|nego|desmiente|sin)(?!\p{L})/u;
const CLAIM_RE = /\b(?:claims?|claimed|alleges?|alleged)\b|声称|宣称|(?<!\p{L})(?:утвержда\p{L}*|يزعم|تدعي|afirma|alega)(?!\p{L})/u;
const NON_ASSERTIVE_RE = /[?？]|\b(?:may|might|could|would|will|if|unless|possible|possibly|potential|reportedly|unconfirmed|plans?|planned|planning|scheduled|drills?|exercises?|simulat\w*|threat\w*|warn\w*|wants?|seeks?|expected|forecast\w*|fears?|risk of|next (?:week|month|year))\b|可能|或将|或许|如果|假如|威胁|警告|计划|拟|预计|担忧|风险|尚未|将会|演习|演练|模拟|欲|(?<!\p{L})(?:может|могут|если|угроз\p{L}*|планир\p{L}*|учения|قد|اذا|تهديد|يهدد|تحذر|تدريب|planea|podria|puede|si|amenaza\p{L}*|previsto|simulacro)(?!\p{L})/u;

function titleClaimEvidence(article) {
  const title = normalizeMultilingualText(article?.title);
  const hits = matchWebNgramsDirectionalRules(title, SHADOW_RULES);
  const topicPresent = TITLE_TOPIC_RE.test(title)
    && (!NON_OIL_TANKER_RE.test(title) || OTHER_OIL_TOPIC_RE.test(title));
  const guardIds = [];
  if (!topicPresent) guardIds.push('title_topic_unbound');
  // Require topic and direction in the same clause. Full-title uncertainty
  // vetoes below intentionally prefer abstention to guessing negation scope.
  const relevantClauses = title.split(/[.!?;。！？；]|\b(?:but|while|whereas)\b|但是|然而/u)
    .filter(clause => TITLE_TOPIC_RE.test(clause));
  const boundHits = relevantClauses.flatMap(clause => matchWebNgramsDirectionalRules(clause, SHADOW_RULES));
  if (hits.length && !boundHits.length) guardIds.push('title_direction_unbound');
  const denied = DENIAL_RE.test(title);
  const claimed = CLAIM_RE.test(title);
  if (denied) guardIds.push('title_denied_or_negated');
  if (claimed || NON_ASSERTIVE_RE.test(title)) guardIds.push('title_non_assertive');
  return { hits, boundHits, topicPresent, denied, claimed, guardIds };
}

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
  const evidence = titleClaimEvidence(article);
  const { hits, boundHits, topicPresent, denied, claimed, guardIds } = evidence;
  let polarity = polarityFromHits(article, boundHits);
  if (!topicPresent || guardIds.length) polarity = 'unclear_or_high_claim';
  // Disputed headlines stay visible for review, but mixed claims never count
  // as independent directional support. A denial is not a de-escalation.
  if (topicPresent && boundHits.length && denied && claimed) polarity = 'mixed_or_contested';
  const type = eventType(article);
  const language = baseLanguage(article?.language);
  return {
    canonicalUrlHash: article?.canonicalUrlHash || null,
    storyClusterHash: article?.storyClusterHash || null,
    domain: article?.domain || null,
    publishedAt: article?.source === 'gdelt_web_ngrams' ? null : normalizeAbsoluteNewsTime(article?.publishedAt),
    datasetObservedAt: normalizeAbsoluteNewsTime(article?.datasetObservedAt),
    tocTimestamp: normalizeAbsoluteNewsTime(article?.tocTimestamp),
    publicationTimeBasis: article?.source === 'gdelt_web_ngrams'
      ? 'original_publication_time_unknown' : 'reference_reported_time_unverified',
    language,
    sourceTier: sourceTier(article?.domain),
    eventType: type,
    claimAxis: claimAxis(type),
    claimPolarity: polarity,
    classificationGuardIds: guardIds,
    eventSignature: buildOilNewsEventSignature(article?.title),
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
