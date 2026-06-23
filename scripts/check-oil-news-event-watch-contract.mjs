#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
const fail = (message) => errors.push(message);
const data = JSON.parse(readFileSync(resolve('data/oil-news-event-watch.json'), 'utf8'));
const gdeltCache = JSON.parse(readFileSync(resolve('data/gdelt-news-cache.json'), 'utf8'));

const STATUSES = new Set(['ok', 'partial', 'source_unavailable', 'not_configured', 'dry_run']);
const SIGNAL_STATES = new Set(['quiet', 'watch', 'elevated_manual_review', 'source_unavailable', 'dry_run']);
const CONFIDENCE = new Set(['none', 'low', 'medium_low', 'medium']);
const SOURCE_STATUSES = new Set(['live', 'partial', 'error', 'stale', 'not_configured', 'not_queried', 'dry_run']);
const CACHE_STATUSES = new Set(['ok', 'stale', 'error', 'not_initialized', 'dry_run']);
const CACHE_SOURCE_STATUSES = new Set(['live', 'stale', 'error', 'not_initialized', 'dry_run']);
const KEY_STATUSES = new Set(['configured', 'missing']);
const HEADLINE_READINESS_STATES = new Set([
  'candidate_ready_for_review',
  'dry_run_not_ready',
  'not_ready_high_claim_title_noise',
  'not_ready_source_unavailable'
]);
const PRODUCTION_FALSE_KEYS = [
  'affectsValues',
  'affectsScoring',
  'affectsDecisionModel',
  'affectsExecutionLock',
  'affectsPositionGuidance',
  'affectsBrentPromotion',
  'affectsOdpFinalBias',
  'affectsGlobalRiskHeatmap',
  'affectsCrossValidation'
];

function finiteNonNegative(value) {
  return Number.isFinite(value) && value >= 0;
}

function isoOrNull(value) {
  return value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
}

if (data.schemaVersion !== 'oil-news-event-watch-1') fail(`schemaVersion invalid: ${data.schemaVersion}`);
if (data.module !== 'oil-news-event-watch') fail(`module invalid: ${data.module}`);
if (typeof data.generatedAt !== 'string' || Number.isNaN(Date.parse(data.generatedAt))) fail('generatedAt must be ISO');
if (!STATUSES.has(data.status)) fail(`status invalid: ${data.status}`);
if (!SIGNAL_STATES.has(data.signalState)) fail(`signalState invalid: ${data.signalState}`);
if (typeof data.displayStatusZh !== 'string' || !data.displayStatusZh) fail('displayStatusZh must be non-empty');
if (!Array.isArray(data.sources) || data.sources.length === 0) fail('sources must be non-empty array');

if (!data.sourceStatus || typeof data.sourceStatus !== 'object') {
  fail('sourceStatus missing');
} else {
  for (const field of ['gdeltDoc', 'tavily', 'brave']) {
    if (!SOURCE_STATUSES.has(data.sourceStatus[field])) fail(`sourceStatus.${field} invalid: ${data.sourceStatus[field]}`);
  }
  for (const field of ['tavilyKey', 'braveKey']) {
    if (!KEY_STATUSES.has(data.sourceStatus[field])) fail(`sourceStatus.${field} invalid: ${data.sourceStatus[field]}`);
  }
  if (!data.sourceStatus.details || typeof data.sourceStatus.details !== 'object') fail('sourceStatus.details missing');
}

if (!gdeltCache || typeof gdeltCache !== 'object') {
  fail('data/gdelt-news-cache.json missing or invalid');
} else {
  if (gdeltCache.schemaVersion !== 'gdelt-news-cache-p37') {
    fail(`gdelt cache schemaVersion invalid: ${gdeltCache.schemaVersion}`);
  }
  if (gdeltCache.module !== 'gdelt-news-cache') fail(`gdelt cache module invalid: ${gdeltCache.module}`);
  if (gdeltCache.cacheScope !== 'odp_oil_news_event_watch') {
    fail(`gdelt cache cacheScope invalid: ${gdeltCache.cacheScope}`);
  }
  if (typeof gdeltCache.generatedAt !== 'string' || Number.isNaN(Date.parse(gdeltCache.generatedAt))) {
    fail('gdelt cache generatedAt must be ISO');
  }
  if (!CACHE_STATUSES.has(gdeltCache.status)) fail(`gdelt cache status invalid: ${gdeltCache.status}`);
  if (!CACHE_SOURCE_STATUSES.has(gdeltCache.sourceStatus)) {
    fail(`gdelt cache sourceStatus invalid: ${gdeltCache.sourceStatus}`);
  }
  if (!gdeltCache.cachePolicy || gdeltCache.cachePolicy.lowFrequencyCache !== true ||
      gdeltCache.cachePolicy.broadQueryLocalClassification !== true) {
    fail('gdelt cache must declare lowFrequencyCache and broadQueryLocalClassification');
  }
  if (!gdeltCache.query || gdeltCache.query.id !== 'gdelt_broad_oil_news') {
    fail('gdelt cache query.id must be gdelt_broad_oil_news');
  }
  if (!gdeltCache.aggregate || !finiteNonNegative(gdeltCache.aggregate.articleCount)) {
    fail('gdelt cache aggregate.articleCount must be non-negative number');
  }
  if (!Array.isArray(gdeltCache.articles)) {
    fail('gdelt cache articles must be array');
  } else {
    for (const [index, article] of gdeltCache.articles.entries()) {
      const path = `gdeltCache.articles[${index}]`;
      if (!article || typeof article !== 'object') {
        fail(`${path} must be object`);
        continue;
      }
      for (const field of ['title', 'url', 'domain', 'publishedAt']) {
        if (!(article[field] === null || typeof article[field] === 'string')) fail(`${path}.${field} must be string|null`);
      }
      for (const field of ['buckets', 'queryIds']) {
        if (!Array.isArray(article[field])) fail(`${path}.${field} must be array`);
      }
      if ('snippet' in article || 'raw' in article || 'body' in article || 'rawResponse' in article) {
        fail(`${path} must not expose snippet/raw/body/rawResponse fields`);
      }
    }
  }
  if (gdeltCache.productionDisplayApproved !== false) fail('gdelt cache productionDisplayApproved must remain false');
  if (gdeltCache.promotionEligible !== false) fail('gdelt cache promotionEligible must remain false');
  if (!gdeltCache.productionImpact || typeof gdeltCache.productionImpact !== 'object') {
    fail('gdelt cache productionImpact missing');
  } else {
    for (const field of PRODUCTION_FALSE_KEYS) {
      if (gdeltCache.productionImpact[field] !== false) fail(`gdelt cache productionImpact.${field} must be false`);
    }
  }
  if (typeof gdeltCache.boundary !== 'string' || !/display-only|audit-only/i.test(gdeltCache.boundary) || !/NOT in/u.test(gdeltCache.boundary)) {
    fail('gdelt cache boundary must declare display-only/audit-only and NOT in guarded paths');
  }
}

if (!data.freshness || typeof data.freshness !== 'object') {
  fail('freshness missing');
} else {
  if (!finiteNonNegative(data.freshness.windowDays) || data.freshness.windowDays > 31) fail('freshness.windowDays must be 0..31');
  if (!isoOrNull(data.freshness.latestArticleAt)) fail('freshness.latestArticleAt must be ISO|null');
  if (!(data.freshness.latestArticleAgeHours === null || finiteNonNegative(data.freshness.latestArticleAgeHours))) {
    fail('freshness.latestArticleAgeHours must be number|null');
  }
  if (typeof data.freshness.cadenceZh !== 'string' || !data.freshness.cadenceZh) fail('freshness.cadenceZh missing');
}

if (!data.queryCoverage || typeof data.queryCoverage !== 'object') {
  fail('queryCoverage missing');
} else {
  for (const field of ['queryCount', 'querySuccessCount', 'queryFailureCount']) {
    if (!finiteNonNegative(data.queryCoverage[field])) fail(`queryCoverage.${field} must be non-negative number`);
  }
  if (!Array.isArray(data.queryCoverage.topics) || data.queryCoverage.topics.length === 0) fail('queryCoverage.topics must be non-empty array');
}

if (!data.aggregate || typeof data.aggregate !== 'object') {
  fail('aggregate missing');
} else {
  for (const field of ['rawArticleCount', 'uniqueArticleCount', 'liveSourceCount', 'configuredSourceCount', 'bucketCountWithHits']) {
    if (!finiteNonNegative(data.aggregate[field])) fail(`aggregate.${field} must be non-negative number`);
  }
  if (!CONFIDENCE.has(data.aggregate.confidence)) fail(`aggregate.confidence invalid: ${data.aggregate.confidence}`);
  if (typeof data.aggregate.reasonZh !== 'string' || !data.aggregate.reasonZh) fail('aggregate.reasonZh must be non-empty');
}

if (!data.buckets || typeof data.buckets !== 'object') {
  fail('buckets missing');
} else {
  for (const [bucketId, bucket] of Object.entries(data.buckets)) {
    if (!bucket || typeof bucket !== 'object') {
      fail(`buckets.${bucketId} must be object`);
      continue;
    }
    for (const field of ['labelZh']) {
      if (typeof bucket[field] !== 'string' || !bucket[field]) fail(`buckets.${bucketId}.${field} must be non-empty string`);
    }
    for (const field of ['articleCount', 'sourceCount', 'weightedSignal']) {
      if (!finiteNonNegative(bucket[field])) fail(`buckets.${bucketId}.${field} must be non-negative number`);
    }
    if (!Array.isArray(bucket.topArticles)) fail(`buckets.${bucketId}.topArticles must be array`);
  }
}

if (!Array.isArray(data.topArticles)) {
  fail('topArticles must be array');
} else {
  for (const [index, article] of data.topArticles.entries()) {
    const path = `topArticles[${index}]`;
    if (!article || typeof article !== 'object') {
      fail(`${path} must be object`);
      continue;
    }
    for (const field of ['title', 'url', 'domain', 'publishedAt']) {
      if (!(article[field] === null || typeof article[field] === 'string')) fail(`${path}.${field} must be string|null`);
    }
    for (const field of ['sources', 'buckets', 'queryIds']) {
      if (!Array.isArray(article[field])) fail(`${path}.${field} must be array`);
    }
    if ('snippet' in article || 'raw' in article || 'body' in article) fail(`${path} must not expose snippet/raw/body fields`);
  }
}

if (!data.titleRisk || typeof data.titleRisk !== 'object') {
  fail('titleRisk missing');
} else {
  if (data.titleRisk.ruleVersion !== 'oil-news-title-risk-p31') fail(`titleRisk.ruleVersion invalid: ${data.titleRisk.ruleVersion}`);
  for (const field of ['evaluatedArticleCount', 'highClaimTitleCount', 'highClaimDomainCount']) {
    if (!finiteNonNegative(data.titleRisk[field])) fail(`titleRisk.${field} must be non-negative number`);
  }
  for (const field of ['highClaimDomains', 'highClaimTerms']) {
    if (!Array.isArray(data.titleRisk[field])) fail(`titleRisk.${field} must be array`);
  }
  if (data.titleRisk.directHeadlineDisplayAllowed !== false) fail('titleRisk.directHeadlineDisplayAllowed must remain false');
  if (typeof data.titleRisk.noteZh !== 'string' || !data.titleRisk.noteZh) fail('titleRisk.noteZh must be non-empty');
}

if (!data.headlineDisplayReadiness || typeof data.headlineDisplayReadiness !== 'object') {
  fail('headlineDisplayReadiness missing');
} else {
  if (!HEADLINE_READINESS_STATES.has(data.headlineDisplayReadiness.state)) {
    fail(`headlineDisplayReadiness.state invalid: ${data.headlineDisplayReadiness.state}`);
  }
  if (data.headlineDisplayReadiness.displayHeadlinesApproved !== false) {
    fail('headlineDisplayReadiness.displayHeadlinesApproved must remain false');
  }
  if (typeof data.headlineDisplayReadiness.reasonZh !== 'string' || !data.headlineDisplayReadiness.reasonZh) {
    fail('headlineDisplayReadiness.reasonZh must be non-empty');
  }
  if (typeof data.headlineDisplayReadiness.requiredNextReview !== 'string' || !data.headlineDisplayReadiness.requiredNextReview) {
    fail('headlineDisplayReadiness.requiredNextReview must be non-empty');
  }
}

if (data.titleRisk && data.headlineDisplayReadiness) {
  if (data.titleRisk.highClaimTitleCount > 0 && data.headlineDisplayReadiness.state !== 'not_ready_high_claim_title_noise') {
    fail('headlineDisplayReadiness.state must be not_ready_high_claim_title_noise when high-claim titles exist');
  }
  if (data.titleRisk.highClaimTitleCount === 0 && data.headlineDisplayReadiness.state === 'not_ready_high_claim_title_noise') {
    fail('headlineDisplayReadiness.state must not claim title noise when titleRisk.highClaimTitleCount is zero');
  }
}

if (!data.recommendation || typeof data.recommendation !== 'object') {
  fail('recommendation missing');
} else {
  if (data.recommendation.state !== data.signalState) fail('recommendation.state must mirror signalState');
  if (typeof data.recommendation.noteZh !== 'string' || !data.recommendation.noteZh) fail('recommendation.noteZh must be non-empty');
}

if (data.productionDisplayApproved !== true) fail('productionDisplayApproved must be true for this display-only artifact');
if (data.promotionEligible !== false) fail('promotionEligible must remain false');
if (!data.productionImpact || typeof data.productionImpact !== 'object') {
  fail('productionImpact missing');
} else {
  for (const field of PRODUCTION_FALSE_KEYS) {
    if (data.productionImpact[field] !== false) fail(`productionImpact.${field} must be false`);
  }
}

if (!Array.isArray(data.limitationsZh) || data.limitationsZh.length < 2) fail('limitationsZh must explain source limits');
if (typeof data.boundary !== 'string' || !/display-only|audit-only/i.test(data.boundary) || !/NOT in/u.test(data.boundary)) {
  fail('boundary must declare display-only/audit-only and NOT in guarded paths');
}

const serialized = JSON.stringify(data);
const cacheSerialized = JSON.stringify(gdeltCache);
for (const needle of [
  'TAVILY_API_KEY',
  'TAVILY_API_KEYS',
  'BRAVE_API_KEY',
  'BRAVE_API_KEYS',
  'Authorization',
  'X-Subscription-Token',
  'Bearer ',
  '"snippet"',
  '"body"',
  '"rawResponse"',
  '"displayHeadlinesApproved":true',
  '"directHeadlineDisplayAllowed":true'
]) {
  if (serialized.includes(needle)) fail(`production artifact must not contain forbidden marker: ${needle}`);
  if (cacheSerialized.includes(needle)) fail(`gdelt cache artifact must not contain forbidden marker: ${needle}`);
}
for (const unsafeClaim of ['已确认关闭', '已确认断供', '封锁确认', '油价预测', '战争概率']) {
  if (serialized.includes(unsafeClaim)) fail(`production artifact must not contain unsafe confirmation phrase: ${unsafeClaim}`);
  if (cacheSerialized.includes(unsafeClaim)) fail(`gdelt cache artifact must not contain unsafe confirmation phrase: ${unsafeClaim}`);
}

if (errors.length > 0) {
  console.error('Oil news event watch contract check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log(`Oil news event watch contract check: PASS (${data.status}, state=${data.signalState}, articles=${data.aggregate.uniqueArticleCount})`);
