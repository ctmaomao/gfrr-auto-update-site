#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
const fail = (message) => errors.push(message);
const data = JSON.parse(readFileSync(resolve('data/oil-news-event-watch.json'), 'utf8'));

const STATUSES = new Set(['ok', 'partial', 'source_unavailable', 'not_configured', 'dry_run']);
const SIGNAL_STATES = new Set(['quiet', 'watch', 'elevated_manual_review', 'source_unavailable', 'dry_run']);
const CONFIDENCE = new Set(['none', 'low', 'medium_low', 'medium']);
const SOURCE_STATUSES = new Set(['live', 'partial', 'error', 'not_configured', 'not_queried', 'dry_run']);
const KEY_STATUSES = new Set(['configured', 'missing']);
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
  '"rawResponse"'
]) {
  if (serialized.includes(needle)) fail(`production artifact must not contain forbidden marker: ${needle}`);
}
for (const unsafeClaim of ['已确认关闭', '已确认断供', '封锁确认', '油价预测', '战争概率']) {
  if (serialized.includes(unsafeClaim)) fail(`production artifact must not contain unsafe confirmation phrase: ${unsafeClaim}`);
}

if (errors.length > 0) {
  console.error('Oil news event watch contract check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log(`Oil news event watch contract check: PASS (${data.status}, state=${data.signalState}, articles=${data.aggregate.uniqueArticleCount})`);
